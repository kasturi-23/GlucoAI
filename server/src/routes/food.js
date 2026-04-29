import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { analyzeFoodImage, predictGlucoseSpike, suggestFoodSwaps, analyzeFoodLabel } from '../services/claudeService.js';
import { rateLimit } from 'express-rate-limit';

const router = Router();
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Images only'));
    cb(null, true);
  },
});

const aiLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30 });

// Get food logs
router.get('/', async (req, res, next) => {
  const { days = 7 } = req.query;
  const since = new Date();
  since.setDate(since.getDate() - Number(days));
  try {
    const logs = await prisma.foodLog.findMany({
      where: { userId: req.user.id, timestamp: { gte: since } },
      orderBy: { timestamp: 'desc' },
    });
    res.json({ logs });
  } catch (e) { next(e); }
});

// Log a meal manually
router.post(
  '/',
  [
    body('mealType').isIn(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']),
    body('foodsJson').isArray({ min: 1 }),
    body('totalCarbs').isFloat({ min: 0 }),
    body('totalCalories').optional().isFloat({ min: 0 }),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { mealType, foodsJson, totalCarbs, totalCalories = 0, glycemicLoad = 0, timestamp } = req.body;
    try {
      const log = await prisma.foodLog.create({
        data: {
          userId: req.user.id,
          mealType,
          foodsJson,
          totalCarbs,
          totalCalories,
          glycemicLoad,
          timestamp: timestamp ? new Date(timestamp) : undefined,
        },
      });
      res.status(201).json({ log });
    } catch (e) { next(e); }
  }
);

// Analyze food photo with Claude Vision
router.post('/analyze-image', aiLimiter, upload.single('image'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No image provided' });
  try {
    const base64 = req.file.buffer.toString('base64');
    const result = await analyzeFoodImage(base64, req.file.mimetype);
    res.json({ analysis: result });
  } catch (e) { next(e); }
});

// Predict glucose spike for a planned meal
router.post('/predict-spike', aiLimiter, async (req, res, next) => {
  const { foods } = req.body;
  if (!Array.isArray(foods)) return res.status(400).json({ error: 'foods array required' });

  try {
    const latestGlucose = await prisma.glucoseReading.findFirst({
      where: { userId: req.user.id },
      orderBy: { timestamp: 'desc' },
    });
    const currentGlucose = latestGlucose?.value ?? 120;
    const prediction = await predictGlucoseSpike(req.user, foods, currentGlucose);
    res.json({ prediction });
  } catch (e) { next(e); }
});

// Suggest food swaps
router.get('/swaps', aiLimiter, async (req, res, next) => {
  const { food } = req.query;
  if (!food) return res.status(400).json({ error: 'food query param required' });
  try {
    const swaps = await suggestFoodSwaps(food, req.user);
    res.json(swaps);
  } catch (e) { next(e); }
});

// ── Food Label Scanner ────────────────────────────────────────────────────────

// Scan a food product label image — returns safety analysis + saves to DB
router.post('/scan-label', aiLimiter, upload.single('image'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No image provided' });

  try {
    // Calculate today's carb consumption
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayLogs = await prisma.foodLog.findMany({
      where: { userId: req.user.id, timestamp: { gte: todayStart } },
      select: { totalCarbs: true },
    });
    const carbsConsumedToday = todayLogs.reduce((s, l) => s + l.totalCarbs, 0);
    const carbBudgetRemaining = Math.max(0, req.user.carbTarget - carbsConsumedToday);

    const base64 = req.file.buffer.toString('base64');
    const analysis = await analyzeFoodLabel(
      base64,
      req.file.mimetype,
      req.user,
      carbBudgetRemaining,
      carbsConsumedToday
    );

    // Map Claude's safety_level to Prisma enum
    const safetyMap = { SAFE: 'SAFE', CAUTION: 'CAUTION', AVOID: 'AVOID' };
    const spikeMap  = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' };

    const saved = await prisma.scannedLabel.create({
      data: {
        userId:              req.user.id,
        productName:         analysis.product_name ?? 'Unknown Product',
        nutritionJson:       analysis.nutrition_extracted ?? {},
        verdict:             analysis.verdict,
        safetyLevel:         safetyMap[analysis.safety_level] ?? 'CAUTION',
        recommendedPortion:  analysis.recommended_portion,
        spikeRisk:           spikeMap[analysis.spike_risk] ?? 'MEDIUM',
        healthConcerns:      analysis.health_concerns ?? [],
        reasoning:           analysis.reasoning,
        tips:                analysis.tips ?? [],
        netCarbs:            analysis.net_carbs_per_serving ?? null,
        carbBudgetRemaining,
      },
    });

    res.json({
      scanId: saved.id,
      analysis: {
        ...analysis,
        carbsConsumedToday: Math.round(carbsConsumedToday),
        carbBudgetRemaining: Math.round(carbBudgetRemaining),
      },
    });
  } catch (e) { next(e); }
});

// Scan history
router.get('/scan-label/history', async (req, res, next) => {
  try {
    const scans = await prisma.scannedLabel.findMany({
      where: { userId: req.user.id },
      orderBy: { scannedAt: 'desc' },
      take: 50,
      select: {
        id: true, productName: true, verdict: true, safetyLevel: true,
        spikeRisk: true, netCarbs: true, recommendedPortion: true,
        carbBudgetRemaining: true, tips: true, healthConcerns: true,
        reasoning: true, nutritionJson: true, scannedAt: true,
      },
    });
    res.json({ scans });
  } catch (e) { next(e); }
});

// Delete a scan from history
router.delete('/scan-label/:id', async (req, res, next) => {
  try {
    await prisma.scannedLabel.deleteMany({
      where: { id: req.params.id, userId: req.user.id },
    });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Quick-log a scanned label food into the food diary
router.post('/scan-label/:id/log', async (req, res, next) => {
  const { mealType = 'SNACK', servings = 1 } = req.body;
  try {
    const scan = await prisma.scannedLabel.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!scan) return res.status(404).json({ error: 'Scan not found' });

    const nutrition = scan.nutritionJson ?? {};
    const log = await prisma.foodLog.create({
      data: {
        userId: req.user.id,
        mealType,
        foodsJson: [{
          name: scan.productName,
          carbs: (scan.netCarbs ?? 0) * servings,
          calories: (nutrition.calories ?? 0) * servings,
          gi: scan.spikeRisk === 'HIGH' ? 75 : scan.spikeRisk === 'MEDIUM' ? 55 : 30,
          portion: scan.recommendedPortion ?? '1 serving',
        }],
        totalCarbs: (scan.netCarbs ?? 0) * servings,
        totalCalories: (nutrition.calories ?? 0) * servings,
      },
    });
    res.status(201).json({ log });
  } catch (e) { next(e); }
});

// Simple nutrition database search (built-in common foods)
router.get('/search', (req, res) => {
  const { q = '' } = req.query;
  const db = [
    { name: 'White rice (cooked)', carbs: 45, calories: 206, gi: 72, gl: 29, per: '1 cup' },
    { name: 'Cauliflower rice', carbs: 5, calories: 25, gi: 10, gl: 1, per: '1 cup' },
    { name: 'Brown rice (cooked)', carbs: 45, calories: 216, gi: 50, gl: 22, per: '1 cup' },
    { name: 'Oatmeal (cooked)', carbs: 27, calories: 150, gi: 55, gl: 13, per: '1 cup' },
    { name: 'Quinoa (cooked)', carbs: 39, calories: 222, gi: 53, gl: 21, per: '1 cup' },
    { name: 'Whole wheat bread', carbs: 12, calories: 69, gi: 69, gl: 9, per: '1 slice' },
    { name: 'Ezekiel bread', carbs: 15, calories: 80, gi: 36, gl: 5, per: '1 slice' },
    { name: 'White bread', carbs: 14, calories: 79, gi: 75, gl: 11, per: '1 slice' },
    { name: 'Apple', carbs: 25, calories: 95, gi: 36, gl: 9, per: 'medium' },
    { name: 'Banana', carbs: 27, calories: 105, gi: 51, gl: 13, per: 'medium' },
    { name: 'Blueberries', carbs: 11, calories: 42, gi: 40, gl: 5, per: '½ cup' },
    { name: 'Sweet potato (baked)', carbs: 26, calories: 112, gi: 70, gl: 18, per: 'medium' },
    { name: 'Broccoli (steamed)', carbs: 11, calories: 55, gi: 10, gl: 1, per: '1.5 cups' },
    { name: 'Spinach (raw)', carbs: 1, calories: 7, gi: 15, gl: 0, per: '1 cup' },
    { name: 'Chicken breast (grilled)', carbs: 0, calories: 185, gi: 0, gl: 0, per: '4 oz' },
    { name: 'Salmon (baked)', carbs: 0, calories: 280, gi: 0, gl: 0, per: '5 oz' },
    { name: 'Eggs (scrambled)', carbs: 2, calories: 180, gi: 0, gl: 0, per: '2 large' },
    { name: 'Greek yogurt (plain)', carbs: 6, calories: 100, gi: 35, gl: 2, per: '½ cup' },
    { name: 'Almond milk (unsweetened)', carbs: 1, calories: 30, gi: 25, gl: 0, per: '1 cup' },
    { name: 'Lentils (cooked)', carbs: 40, calories: 230, gi: 29, gl: 12, per: '1 cup' },
    { name: 'Black beans (cooked)', carbs: 41, calories: 227, gi: 30, gl: 12, per: '1 cup' },
    { name: 'Almonds', carbs: 6, calories: 164, gi: 0, gl: 0, per: '1 oz (23 nuts)' },
    { name: 'Avocado', carbs: 12, calories: 234, gi: 15, gl: 1, per: '½ fruit' },
    { name: 'Orange juice', carbs: 26, calories: 112, gi: 50, gl: 13, per: '1 cup' },
    { name: 'Cola (regular)', carbs: 39, calories: 155, gi: 63, gl: 25, per: '12 oz' },
  ];

  const term = q.toLowerCase();
  const results = db.filter((f) => f.name.toLowerCase().includes(term)).slice(0, 10);
  res.json({ results });
});

export default router;
