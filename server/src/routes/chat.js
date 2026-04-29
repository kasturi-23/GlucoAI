import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { rateLimit } from 'express-rate-limit';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { chatStream } from '../services/claudeService.js';

const router = Router();
router.use(authenticate);

const chatLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

router.get('/history', async (req, res, next) => {
  try {
    const messages = await prisma.chatMessage.findMany({
      where: { userId: req.user.id },
      orderBy: { timestamp: 'asc' },
      take: 100,
    });
    res.json({ messages });
  } catch (e) { next(e); }
});

// Streaming chat endpoint (SSE)
router.post(
  '/send',
  chatLimiter,
  [body('message').trim().isLength({ min: 1, max: 2000 })],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const { message } = req.body;

    try {
      // Save user message
      await prisma.chatMessage.create({
        data: { userId: req.user.id, role: 'user', content: message },
      });

      // Load recent context
      const [history, foodLogs, glucoseReadings] = await Promise.all([
        prisma.chatMessage.findMany({
          where: { userId: req.user.id },
          orderBy: { timestamp: 'desc' },
          take: 20,
        }),
        prisma.foodLog.findMany({
          where: {
            userId: req.user.id,
            timestamp: { gte: new Date(Date.now() - 7 * 86400000) },
          },
          orderBy: { timestamp: 'desc' },
          take: 10,
        }),
        prisma.glucoseReading.findMany({
          where: {
            userId: req.user.id,
            timestamp: { gte: new Date(Date.now() - 7 * 86400000) },
          },
          orderBy: { timestamp: 'desc' },
          take: 20,
        }),
      ]);

      const claudeMessages = history
        .reverse()
        .map((m) => ({ role: m.role, content: m.content }));

      let full = '';
      await chatStream(
        req.user,
        claudeMessages,
        foodLogs,
        glucoseReadings,
        (chunk) => sendEvent('chunk', { text: chunk }),
        (complete) => { full = complete; }
      );

      // Save assistant response
      await prisma.chatMessage.create({
        data: { userId: req.user.id, role: 'assistant', content: full },
      });

      sendEvent('done', { message: full });
      res.end();
    } catch (e) {
      sendEvent('error', { message: e.message });
      res.end();
    }
  }
);

router.delete('/history', async (req, res, next) => {
  try {
    await prisma.chatMessage.deleteMany({ where: { userId: req.user.id } });
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
