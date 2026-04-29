/**
 * RAG evaluation — 15 test cases grounded in ADA Standards of Care 2026.
 * Calls getRagGroundedRecommendation() directly and asserts structural validity.
 *
 * Usage:
 *   cd scripts && node eval_rag.js
 *   or: npm run rag:eval
 *
 * Pass threshold: 13/15. Exits with code 1 if below.
 */
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../server/.env') });

const ragServicePath = pathToFileURL(
  resolve(__dirname, '../server/src/services/ragService.js')
).href;

const { getRagGroundedRecommendation, classifyGlucose } = await import(ragServicePath);

// ── Test cases ───────────────────────────────────────────────────────────────

const PATIENT_NORMAL = {
  name: 'Jane Doe', diabetesType: 'Type_2', hba1c: 7.1,
  carbTarget: 150, medications: [{ name: 'Metformin', dosage: '500mg' }], age: 52,
};
const PATIENT_HIGH = {
  name: 'John Smith', diabetesType: 'Type_1', hba1c: 8.4,
  carbTarget: 120, medications: [{ name: 'Insulin', dosage: '10 units' }], age: 34,
};
const PATIENT_LOW = {
  name: 'Pat Kim', diabetesType: 'Type_2', hba1c: 6.8,
  carbTarget: 180, medications: 'None listed', age: 67,
};

const TEST_CASES = [
  // Food checks — safe items
  { desc: 'broccoli, normal glucose',       patient: PATIENT_NORMAL, glucose: 95,  food: 'broccoli',           type: 'food_check', expectVerdicts: ['Safe','Recommended'], expectSpike: ['Low'] },
  { desc: 'grilled salmon, normal glucose', patient: PATIENT_NORMAL, glucose: 90,  food: 'grilled salmon',     type: 'food_check', expectVerdicts: ['Safe','Recommended'], expectSpike: ['Low'] },
  { desc: 'almonds, pre-diabetic glucose',  patient: PATIENT_HIGH,   glucose: 115, food: 'almonds',            type: 'food_check', expectVerdicts: ['Safe','Recommended','Caution'], expectSpike: ['Low','Medium'] },

  // Food checks — risky items
  { desc: 'white bread, high glucose',      patient: PATIENT_HIGH,   glucose: 145, food: 'white bread',        type: 'food_check', expectVerdicts: ['Avoid','Caution','Modify'], expectSpike: ['High','Medium'] },
  { desc: 'cola soda, high glucose',        patient: PATIENT_HIGH,   glucose: 160, food: 'cola soda',          type: 'food_check', expectVerdicts: ['Avoid','Caution'],           expectSpike: ['High'] },
  { desc: 'candy bar, pre-diabetic',        patient: PATIENT_NORMAL, glucose: 118, food: 'candy bar',          type: 'food_check', expectVerdicts: ['Avoid','Caution','Modify'],  expectSpike: ['High','Medium'] },
  { desc: 'white rice, high glucose',       patient: PATIENT_HIGH,   glucose: 135, food: 'white rice',         type: 'food_check', expectVerdicts: ['Caution','Avoid','Modify'],  expectSpike: ['High','Medium'] },

  // Food checks — moderate items
  { desc: 'banana, normal glucose',         patient: PATIENT_NORMAL, glucose: 88,  food: 'banana',             type: 'food_check', expectVerdicts: ['Caution','Safe','Modify'],   expectSpike: ['Medium','Low'] },
  { desc: 'oatmeal, normal glucose',        patient: PATIENT_LOW,    glucose: 82,  food: 'oatmeal',            type: 'food_check', expectVerdicts: ['Safe','Recommended','Caution'], expectSpike: ['Low','Medium'] },
  { desc: 'apple, pre-diabetic',            patient: PATIENT_NORMAL, glucose: 112, food: 'apple',              type: 'food_check', expectVerdicts: ['Safe','Caution','Recommended'], expectSpike: ['Low','Medium'] },

  // Low glucose scenarios
  { desc: 'orange juice, low glucose',      patient: PATIENT_LOW,    glucose: 62,  food: 'orange juice',       type: 'food_check', expectVerdicts: ['Safe','Recommended','Caution'], expectSpike: ['Low','Medium','High'] },

  // Meal plan recommendations
  { desc: 'meal plan, high glucose',        patient: PATIENT_HIGH,   glucose: 155, food: null, type: 'meal_plan', expectVerdicts: ['Recommended','Caution','Modify'], expectSpike: ['Low','Medium','High'] },
  { desc: 'meal plan, normal glucose',      patient: PATIENT_NORMAL, glucose: 92,  food: null, type: 'meal_plan', expectVerdicts: ['Recommended'],                   expectSpike: ['Low','Medium'] },

  // Weekly advice
  { desc: 'weekly advice, pre-diabetic',    patient: PATIENT_NORMAL, glucose: 110, food: null, type: 'weekly_advice', expectVerdicts: ['Recommended','Caution','Modify'], expectSpike: ['Low','Medium'] },
  { desc: 'weekly advice, high glucose',    patient: PATIENT_HIGH,   glucose: 148, food: null, type: 'weekly_advice', expectVerdicts: ['Caution','Recommended','Modify'],  expectSpike: ['Low','Medium','High'] },
];

// ── Runner ───────────────────────────────────────────────────────────────────

const VALID_VERDICTS   = ['Safe','Caution','Avoid','Recommended','Modify'];
const VALID_LEVELS     = ['green','amber','red'];
const VALID_SPIKE      = ['Low','Medium','High'];

function validate(result, tc) {
  const issues = [];

  if (!result || typeof result !== 'object') {
    return ['Result is not an object'];
  }

  if (!VALID_VERDICTS.includes(result.verdict)) {
    issues.push(`Invalid verdict "${result.verdict}"`);
  } else if (!tc.expectVerdicts.includes(result.verdict)) {
    issues.push(`Unexpected verdict "${result.verdict}" for "${tc.desc}" (expected one of: ${tc.expectVerdicts.join(', ')})`);
  }

  if (!VALID_LEVELS.includes(result.safety_level)) {
    issues.push(`Invalid safety_level "${result.safety_level}"`);
  }

  if (!VALID_SPIKE.includes(result.spike_risk)) {
    issues.push(`Invalid spike_risk "${result.spike_risk}"`);
  } else if (!tc.expectSpike.includes(result.spike_risk)) {
    issues.push(`Unexpected spike_risk "${result.spike_risk}" for "${tc.desc}"`);
  }

  if (typeof result.recommendation !== 'string' || result.recommendation.length < 20) {
    issues.push('recommendation missing or too short');
  }

  if (!Array.isArray(result.cited_sources) || result.cited_sources.length === 0) {
    issues.push('cited_sources missing');
  }

  if (!result.disclaimer) {
    issues.push('disclaimer missing');
  }

  // Retrieved chunks should be present (may be empty if DB not seeded)
  if (!Array.isArray(result.retrieved_chunks)) {
    issues.push('retrieved_chunks not an array');
  }

  return issues;
}

async function runTests() {
  console.log(`Running ${TEST_CASES.length} RAG evaluation tests...\n`);

  let passed = 0;
  let failed = 0;

  for (const tc of TEST_CASES) {
    const glucoseValue   = tc.glucose;
    const classification = classifyGlucose(glucoseValue);

    let result;
    let callError;

    try {
      result = await getRagGroundedRecommendation({
        patient:     tc.patient,
        glucose:     { value: glucoseValue, classification },
        foodQuery:   tc.food ?? undefined,
        requestType: tc.type,
      });
    } catch (err) {
      callError = err;
    }

    if (callError) {
      console.log(`  FAIL  ${tc.desc}`);
      console.log(`        Error: ${callError.message}`);
      failed++;
      continue;
    }

    const issues = validate(result, tc);

    if (issues.length === 0) {
      console.log(`  PASS  ${tc.desc}  →  ${result.verdict} / spike:${result.spike_risk}`);
      passed++;
    } else {
      console.log(`  FAIL  ${tc.desc}`);
      for (const issue of issues) console.log(`        - ${issue}`);
      failed++;
    }
  }

  const total  = passed + failed;
  const pct    = ((passed / total) * 100).toFixed(0);
  const THRESHOLD = 13;

  console.log(`\nResults: ${passed}/${total} passed (${pct}%)`);

  if (passed < THRESHOLD) {
    console.error(`FAIL: ${passed} < ${THRESHOLD} required. Check RAG pipeline or DB seeding.`);
    process.exit(1);
  } else {
    console.log(`PASS: meets threshold (${THRESHOLD}/15).`);
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
