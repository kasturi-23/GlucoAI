import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);
router.use(requireRole('DOCTOR', 'DIETITIAN'));

// Get patients linked to this doctor
router.get('/patients', async (req, res, next) => {
  try {
    const links = await prisma.doctorPatient.findMany({
      where: { doctorId: req.user.id },
      include: {
        patient: {
          select: {
            id: true, name: true, email: true, diabetesType: true,
            hba1c: true, weight: true, carbTarget: true, medications: true,
            createdAt: true,
          },
        },
      },
    });
    res.json({ patients: links.map((l) => l.patient) });
  } catch (e) { next(e); }
});

// Get full patient data for doctor
router.get('/patients/:patientId', async (req, res, next) => {
  const { patientId } = req.params;
  try {
    const link = await prisma.doctorPatient.findUnique({
      where: { doctorId_patientId: { doctorId: req.user.id, patientId } },
    });
    if (!link) return res.status(403).json({ error: 'Patient not linked to your account' });

    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [patient, glucoseReadings, foodLogs, alerts, notes] = await Promise.all([
      prisma.user.findUnique({
        where: { id: patientId },
        select: {
          id: true, name: true, email: true, diabetesType: true, hba1c: true,
          weight: true, height: true, carbTarget: true, calorieGoal: true,
          medications: true, allergies: true, foodPreferences: true, createdAt: true,
        },
      }),
      prisma.glucoseReading.findMany({
        where: { userId: patientId, timestamp: { gte: since } },
        orderBy: { timestamp: 'asc' },
      }),
      prisma.foodLog.findMany({
        where: { userId: patientId, timestamp: { gte: since } },
        orderBy: { timestamp: 'desc' },
        take: 50,
      }),
      prisma.alert.findMany({
        where: { userId: patientId },
        orderBy: { timestamp: 'desc' },
        take: 20,
      }),
      prisma.clinicalNote.findMany({
        where: { patientId },
        orderBy: { createdAt: 'desc' },
        include: { doctor: { select: { name: true } } },
      }),
    ]);

    res.json({ patient, glucoseReadings, foodLogs, alerts, notes });
  } catch (e) { next(e); }
});

// Add clinical note
router.post(
  '/patients/:patientId/notes',
  [body('content').trim().isLength({ min: 5 })],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { patientId } = req.params;
    const { content, restrictions } = req.body;

    try {
      const link = await prisma.doctorPatient.findUnique({
        where: { doctorId_patientId: { doctorId: req.user.id, patientId } },
      });
      if (!link) return res.status(403).json({ error: 'Not authorized' });

      const note = await prisma.clinicalNote.create({
        data: { patientId, doctorId: req.user.id, content, restrictions },
      });
      res.status(201).json({ note });
    } catch (e) { next(e); }
  }
);

// Link a patient by email
router.post('/patients/link', [body('email').isEmail()], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const patient = await prisma.user.findUnique({ where: { email: req.body.email } });
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    if (patient.role !== 'PATIENT') return res.status(400).json({ error: 'User is not a patient' });

    const link = await prisma.doctorPatient.upsert({
      where: { doctorId_patientId: { doctorId: req.user.id, patientId: patient.id } },
      update: {},
      create: { doctorId: req.user.id, patientId: patient.id },
    });
    res.status(201).json({ link, patient: { id: patient.id, name: patient.name, email: patient.email } });
  } catch (e) { next(e); }
});

export default router;
