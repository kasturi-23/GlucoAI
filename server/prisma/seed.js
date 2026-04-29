import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const patientPw = await bcrypt.hash('patient123', 10);
  const doctorPw = await bcrypt.hash('doctor123', 10);

  const patient = await prisma.user.upsert({
    where: { email: 'jane.doe@example.com' },
    update: {},
    create: {
      email: 'jane.doe@example.com',
      name: 'Jane Doe',
      password: patientPw,
      role: 'PATIENT',
      diabetesType: 'TYPE_2',
      weight: 72,
      height: 165,
      hba1c: 7.2,
      carbTarget: 150,
      calorieGoal: 1800,
      medications: [
        { name: 'Metformin', dosage: '500mg', frequency: 'twice daily' },
        { name: 'Lisinopril', dosage: '10mg', frequency: 'once daily' },
      ],
      allergies: ['shellfish', 'peanuts'],
      foodPreferences: ['vegetarian-friendly', 'low-sodium'],
    },
  });

  const doctor = await prisma.user.upsert({
    where: { email: 'dr.smith@clinic.com' },
    update: {},
    create: {
      email: 'dr.smith@clinic.com',
      name: 'Dr. Robert Smith',
      password: doctorPw,
      role: 'DOCTOR',
    },
  });

  await prisma.doctorPatient.upsert({
    where: { doctorId_patientId: { doctorId: doctor.id, patientId: patient.id } },
    update: {},
    create: { doctorId: doctor.id, patientId: patient.id },
  });

  // Glucose readings: last 7 days
  const now = new Date();
  const glucoseData = [];
  for (let day = 6; day >= 0; day--) {
    const base = new Date(now);
    base.setDate(base.getDate() - day);
    const readings = [
      { hour: 7, value: 125 + Math.random() * 20, ctx: 'fasting' },
      { hour: 9, value: 155 + Math.random() * 30, ctx: 'post_breakfast' },
      { hour: 13, value: 145 + Math.random() * 25, ctx: 'post_lunch' },
      { hour: 19, value: 160 + Math.random() * 35, ctx: 'post_dinner' },
      { hour: 22, value: 115 + Math.random() * 15, ctx: 'bedtime' },
    ];
    for (const r of readings) {
      const ts = new Date(base);
      ts.setHours(r.hour, 0, 0, 0);
      glucoseData.push({ userId: patient.id, value: r.value, mealContext: r.ctx, timestamp: ts });
    }
  }
  await prisma.glucoseReading.createMany({ data: glucoseData, skipDuplicates: true });

  // Food logs: last 3 days
  const meals = [
    {
      mealType: 'BREAKFAST',
      foodsJson: [
        { name: 'Oatmeal', carbs: 27, calories: 150, gi: 55, portion: '1 cup' },
        { name: 'Blueberries', carbs: 11, calories: 45, gi: 40, portion: '1/2 cup' },
        { name: 'Almond milk', carbs: 4, calories: 30, gi: 30, portion: '1/2 cup' },
      ],
      totalCarbs: 42,
      totalCalories: 225,
      glycemicLoad: 18,
    },
    {
      mealType: 'LUNCH',
      foodsJson: [
        { name: 'Grilled chicken breast', carbs: 0, calories: 185, gi: 0, portion: '4 oz' },
        { name: 'Quinoa', carbs: 39, calories: 222, gi: 53, portion: '1 cup' },
        { name: 'Mixed salad', carbs: 8, calories: 35, gi: 15, portion: '2 cups' },
      ],
      totalCarbs: 47,
      totalCalories: 442,
      glycemicLoad: 21,
    },
    {
      mealType: 'DINNER',
      foodsJson: [
        { name: 'Baked salmon', carbs: 0, calories: 280, gi: 0, portion: '5 oz' },
        { name: 'Steamed broccoli', carbs: 11, calories: 55, gi: 10, portion: '1.5 cups' },
        { name: 'Brown rice', carbs: 45, calories: 216, gi: 50, portion: '1 cup' },
      ],
      totalCarbs: 56,
      totalCalories: 551,
      glycemicLoad: 25,
    },
  ];

  for (let day = 2; day >= 0; day--) {
    const d = new Date(now);
    d.setDate(d.getDate() - day);
    for (let i = 0; i < meals.length; i++) {
      const ts = new Date(d);
      ts.setHours(7 + i * 6, 0, 0, 0);
      await prisma.foodLog.create({ data: { userId: patient.id, ...meals[i], timestamp: ts } });
    }
  }

  // Meal plan
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  await prisma.mealPlan.create({
    data: {
      userId: patient.id,
      weekStart,
      generatedByAi: true,
      aiModel: 'claude-sonnet-4-20250514',
      planJson: {
        days: [
          {
            day: 'Monday',
            breakfast: { name: 'Greek yogurt parfait', carbs: 35, calories: 280 },
            lunch: { name: 'Turkey lettuce wraps', carbs: 22, calories: 320 },
            dinner: { name: 'Grilled cod with asparagus', carbs: 18, calories: 380 },
            snack: { name: 'Apple slices with almond butter', carbs: 25, calories: 190 },
          },
          {
            day: 'Tuesday',
            breakfast: { name: 'Veggie egg scramble', carbs: 12, calories: 310 },
            lunch: { name: 'Lentil soup + side salad', carbs: 45, calories: 360 },
            dinner: { name: 'Chicken stir-fry with cauliflower rice', carbs: 28, calories: 420 },
            snack: { name: 'Celery + hummus', carbs: 15, calories: 120 },
          },
        ],
        swaps: [
          { from: 'White rice', to: 'Cauliflower rice', reason: 'Reduces carbs by 40g per serving' },
          { from: 'White bread', to: 'Ezekiel bread', reason: 'Lower glycemic index (36 vs 75)' },
        ],
      },
    },
  });

  // Alerts
  await prisma.alert.createMany({
    data: [
      {
        userId: patient.id,
        type: 'SPIKE_WARNING',
        message: 'Predicted glucose spike after tonight\'s dinner',
        detail: 'Brown rice + juice combination may push your glucose above 180 mg/dL. Consider swapping juice for water.',
        isRead: false,
        timestamp: new Date(),
      },
      {
        userId: patient.id,
        type: 'WEEKLY_PATTERN',
        message: 'Pattern detected: glucose spikes every Friday evening',
        detail: 'Your glucose averages 195 mg/dL on Friday evenings. This may correlate with higher-carb weekend meals.',
        isRead: false,
        timestamp: new Date(now.getTime() - 3600000),
      },
      {
        userId: patient.id,
        type: 'MEDICATION_REMINDER',
        message: 'Metformin reminder — take with dinner',
        detail: null,
        isRead: true,
        timestamp: new Date(now.getTime() - 7200000),
      },
    ],
    skipDuplicates: true,
  });

  // Seed chat history
  await prisma.chatMessage.createMany({
    data: [
      {
        userId: patient.id,
        role: 'user',
        content: 'What foods should I avoid to keep my blood sugar stable?',
        timestamp: new Date(now.getTime() - 86400000),
      },
      {
        userId: patient.id,
        role: 'assistant',
        content: 'Based on your Type 2 diabetes profile, I recommend avoiding white bread, sugary drinks, and processed snacks. Focus on fiber-rich vegetables, lean proteins, and whole grains with a low glycemic index.',
        timestamp: new Date(now.getTime() - 86390000),
      },
    ],
    skipDuplicates: true,
  });

  console.log('Seed complete.');
  console.log(`Patient: jane.doe@example.com / patient123`);
  console.log(`Doctor:  dr.smith@clinic.com  / doctor123`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
