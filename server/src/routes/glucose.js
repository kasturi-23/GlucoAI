import { Router } from "express";
import { body, query, validationResult } from "express-validator";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

router.get("/", async (req, res, next) => {
  const { days = 7 } = req.query;
  const since = new Date();
  since.setDate(since.getDate() - Number(days));
  try {
    const readings = await prisma.glucoseReading.findMany({
      where: { userId: req.user.id, timestamp: { gte: since } },
      orderBy: { timestamp: "asc" },
    });
    res.json({ readings });
  } catch (e) {
    next(e);
  }
});

router.post(
  "/",
  [
    body("value").isFloat({ min: 20, max: 600 }),
    body("mealContext").optional().isString(),
    body("notes").optional().isString(),
    body("timestamp").optional().isISO8601(),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { value, mealContext, notes, timestamp } = req.body;
    try {
      const reading = await prisma.glucoseReading.create({
        data: {
          userId: req.user.id,
          value,
          mealContext,
          notes,
          timestamp: timestamp ? new Date(timestamp) : undefined,
        },
      });

      // Auto-create alert if glucose is high
      if (value > 180) {
        await prisma.alert.create({
          data: {
            userId: req.user.id,
            type: "SPIKE_WARNING",
            message: `High glucose reading: ${Math.round(value)} mg/dL`,
            detail: `Your glucose is above the 180 mg/dL threshold. Consider your recent meal and activity level.`,
          },
        });
      }

      res.status(201).json({ reading });
    } catch (e) {
      next(e);
    }
  },
);

// HbA1c trend (derived from average glucose over 90-day windows)
router.get("/hba1c-trend", async (req, res, next) => {
  try {
    const months = [];
    for (let m = 2; m >= 0; m--) {
      const end = new Date();
      end.setMonth(end.getMonth() - m);
      end.setDate(0);
      const start = new Date(end);
      start.setDate(start.getDate() - 90);

      const readings = await prisma.glucoseReading.findMany({
        where: { userId: req.user.id, timestamp: { gte: start, lte: end } },
        select: { value: true },
      });

      if (readings.length > 0) {
        const avg = readings.reduce((s, r) => s + r.value, 0) / readings.length;
        // eAG to HbA1c formula: HbA1c = (eAG + 46.7) / 28.7
        const hba1c = (avg + 46.7) / 28.7;
        months.push({
          label: end.toLocaleString("default", {
            month: "short",
            year: "2-digit",
          }),
          hba1c: Math.round(hba1c * 10) / 10,
        });
      }
    }
    res.json({ trend: months });
  } catch (e) {
    next(e);
  }
});

export default router;
