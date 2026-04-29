import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { generateMealPlanStream, generateWeeklyReport } from '../services/claudeService.js';
import { rateLimit } from 'express-rate-limit';

const router = Router();
router.use(authenticate);

const planLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });

// Get meal plans
router.get('/', async (req, res, next) => {
  try {
    const plans = await prisma.mealPlan.findMany({
      where: { userId: req.user.id },
      orderBy: { weekStart: 'desc' },
      take: 8,
    });
    res.json({ plans });
  } catch (e) { next(e); }
});

// Get current week's plan
router.get('/current', async (req, res, next) => {
  try {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const plan = await prisma.mealPlan.findFirst({
      where: { userId: req.user.id, weekStart: { gte: weekStart } },
      orderBy: { weekStart: 'desc' },
    });
    res.json({ plan });
  } catch (e) { next(e); }
});

// Generate new meal plan with Claude (streaming SSE)
router.post('/generate', planLimiter, async (req, res, next) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    sendEvent('status', { message: 'Generating your personalized meal plan...' });

    let full = '';
    await generateMealPlanStream(
      req.user,
      (chunk) => sendEvent('chunk', { text: chunk }),
      (complete) => { full = complete; }
    );

    // Parse and save
    let planJson;
    try {
      const jsonMatch = full.match(/\{[\s\S]*\}/);
      planJson = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: full };
    } catch {
      planJson = { raw: full };
    }

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const plan = await prisma.mealPlan.create({
      data: {
        userId: req.user.id,
        weekStart,
        planJson,
        generatedByAi: true,
        aiModel: 'claude-sonnet-4-20250514',
      },
    });

    sendEvent('done', { planId: plan.id, plan: planJson });
    res.end();
  } catch (e) {
    sendEvent('error', { message: e.message });
    res.end();
  }
});

// Weekly insight report
router.get('/weekly-report', planLimiter, async (req, res, next) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const [glucoseReadings, foodLogs] = await Promise.all([
      prisma.glucoseReading.findMany({ where: { userId: req.user.id, timestamp: { gte: since } } }),
      prisma.foodLog.findMany({ where: { userId: req.user.id, timestamp: { gte: since } } }),
    ]);

    const report = await generateWeeklyReport(req.user, glucoseReadings, foodLogs);
    res.json({ report });
  } catch (e) { next(e); }
});

export default router;
