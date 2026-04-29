import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, email: true, name: true, role: true, diabetesType: true,
        weight: true, height: true, hba1c: true, carbTarget: true, calorieGoal: true,
        medications: true, allergies: true, foodPreferences: true, avatar: true,
        dateOfBirth: true, createdAt: true,
      },
    });
    res.json({ user });
  } catch (e) { next(e); }
});

router.patch(
  '/',
  [
    body('name').optional().trim().isLength({ min: 2 }),
    body('weight').optional().isFloat({ min: 20, max: 500 }),
    body('height').optional().isFloat({ min: 50, max: 300 }),
    body('carbTarget').optional().isInt({ min: 20, max: 500 }),
    body('calorieGoal').optional().isInt({ min: 500, max: 5000 }),
    body('hba1c').optional().isFloat({ min: 3, max: 20 }),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const allowed = [
      'name', 'diabetesType', 'weight', 'height', 'hba1c',
      'carbTarget', 'calorieGoal', 'medications', 'allergies',
      'foodPreferences', 'avatar', 'dateOfBirth',
    ];
    const data = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowed.includes(k))
    );

    try {
      const user = await prisma.user.update({
        where: { id: req.user.id },
        data,
        select: {
          id: true, email: true, name: true, role: true, diabetesType: true,
          weight: true, height: true, hba1c: true, carbTarget: true, calorieGoal: true,
          medications: true, allergies: true, foodPreferences: true,
        },
      });
      res.json({ user });
    } catch (e) { next(e); }
  }
);

export default router;
