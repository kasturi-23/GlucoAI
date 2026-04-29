import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { rateLimit } from 'express-rate-limit';
import prisma from '../lib/prisma.js';
import { pool } from '../lib/db.js';
import { authenticate } from '../middleware/auth.js';
import { getRagGroundedRecommendation, classifyGlucose } from '../services/ragService.js';

const router = Router();
router.use(authenticate);

const ragLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 40 });

// ── POST /api/rag/food-check ──────────────────────────────────────────────────
// Text-based food safety analysis grounded in ADA 2026.
router.post(
  '/food-check',
  ragLimiter,
  [
    body('food_name').trim().isLength({ min: 2, max: 200 }),
    body('current_glucose').optional().isFloat({ min: 20, max: 600 }),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { food_name, current_glucose } = req.body;

    try {
      // Resolve current glucose: use supplied value or pull latest reading
      let glucoseValue = current_glucose ?? null;
      if (!glucoseValue) {
        const latest = await prisma.glucoseReading.findFirst({
          where: { userId: req.user.id },
          orderBy: { timestamp: 'desc' },
        });
        glucoseValue = latest?.value ?? 110;
      }

      const classification = classifyGlucose(glucoseValue);

      const recommendation = await getRagGroundedRecommendation({
        patient:     req.user,
        glucose:     { value: glucoseValue, classification },
        foodQuery:   food_name,
        requestType: 'food_check',
      });

      // Persist to scanned_foods
      await prisma.scannedFood.create({
        data: {
          userId:             req.user.id,
          foodName:           food_name,
          glucoseAtScan:      glucoseValue,
          verdict:            recommendation.verdict,
          spikeRisk:          recommendation.spike_risk,
          portionAdvice:      recommendation.portion_advice,
          recommendationJson: recommendation,
        },
      });

      res.json({
        food_name,
        glucose: { value: glucoseValue, classification },
        recommendation,
      });
    } catch (e) { next(e); }
  }
);

// ── POST /api/rag/meal-recommendation ────────────────────────────────────────
// RAG-grounded meal plan recommendation triggered after a glucose reading.
router.post(
  '/meal-recommendation',
  ragLimiter,
  [body('glucose_reading_id').optional().isUUID()],
  async (req, res, next) => {
    try {
      let glucoseValue    = null;
      let classification  = null;

      if (req.body.glucose_reading_id) {
        const reading = await prisma.glucoseReading.findFirst({
          where: { id: req.body.glucose_reading_id, userId: req.user.id },
        });
        if (!reading) return res.status(404).json({ error: 'Glucose reading not found' });
        glucoseValue   = reading.value;
        classification = classifyGlucose(glucoseValue);
      } else {
        const latest = await prisma.glucoseReading.findFirst({
          where: { userId: req.user.id },
          orderBy: { timestamp: 'desc' },
        });
        glucoseValue   = latest?.value ?? 110;
        classification = classifyGlucose(glucoseValue);
      }

      const recommendation = await getRagGroundedRecommendation({
        patient:     req.user,
        glucose:     { value: glucoseValue, classification },
        requestType: 'meal_plan',
      });

      // Persist as a RAG-grounded meal plan
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const plan = await prisma.mealPlan.create({
        data: {
          userId:       req.user.id,
          weekStart,
          planJson:     recommendation,
          generatedByAi: true,
          ragGrounded:  true,
          aiModel:      'claude-sonnet-4-20250514',
          notes:        `RAG-grounded at glucose ${glucoseValue} mg/dL (${classification})`,
        },
      });

      res.json({
        planId: plan.id,
        glucose: { value: glucoseValue, classification },
        recommendation,
      });
    } catch (e) { next(e); }
  }
);

// ── GET /api/rag/sources ──────────────────────────────────────────────────────
// Returns indexed source documents with chunk counts.
router.get('/sources', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        source,
        document,
        journal_ref  AS "journalRef",
        section,
        COUNT(*)::int AS chunk_count
      FROM rag_chunks
      GROUP BY source, document, journal_ref, section
      ORDER BY section
    `);

    res.json({
      note: 'All recommendations are grounded in these indexed sources.',
      sources: result.rows,
      total_chunks: result.rows.reduce((s, r) => s + r.chunk_count, 0),
    });
  } catch (err) {
    if (err.code === '42P01') {
      return res.json({ note: 'RAG tables not yet created. Run npm run rag:migrate.', sources: [], total_chunks: 0 });
    }
    next(err);
  }
});

// ── GET /api/rag/history ──────────────────────────────────────────────────────
router.get('/history', async (req, res, next) => {
  try {
    const scans = await prisma.scannedFood.findMany({
      where: { userId: req.user.id },
      orderBy: { scannedAt: 'desc' },
      take: 30,
    });
    res.json({ scans });
  } catch (e) { next(e); }
});

export default router;
