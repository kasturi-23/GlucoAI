import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-20250514';

function buildPatientContext(user) {
  return `
PATIENT PROFILE:
- Name: ${user.name}
- Diabetes Type: ${user.diabetesType || 'Unknown'}
- Weight: ${user.weight ? `${user.weight} kg` : 'Not provided'}
- Height: ${user.height ? `${user.height} cm` : 'Not provided'}
- Current HbA1c: ${user.hba1c ? `${user.hba1c}%` : 'Not provided'}
- Daily Carb Target: ${user.carbTarget}g
- Daily Calorie Goal: ${user.calorieGoal} kcal
- Medications: ${user.medications ? JSON.stringify(user.medications) : 'None listed'}
- Allergies: ${user.allergies?.length ? user.allergies.join(', ') : 'None'}
- Food Preferences: ${user.foodPreferences?.length ? user.foodPreferences.join(', ') : 'None specified'}
`.trim();
}

// ── Meal plan generation (streaming) ──────────────────────────────────────────
export async function generateMealPlanStream(user, onChunk, onDone) {
  const systemPrompt = `You are a certified diabetes dietitian and nutrition expert.
Your role is to create safe, effective, evidence-based meal plans for patients with diabetes.
Always prioritize glycemic control, nutritional balance, and patient preferences.

${buildPatientContext(user)}

INSTRUCTIONS:
- Generate a 7-day meal plan with breakfast, lunch, dinner, and 1-2 snacks per day.
- Keep each meal within the patient's carb targets (roughly ${Math.round(user.carbTarget / 3)}g per main meal).
- Include carb counts, estimated glycemic load, and calories for each item.
- Provide 3-5 "Smart Food Swaps" (e.g., white rice → cauliflower rice).
- Format the response as valid JSON matching this structure:
{
  "summary": "Brief personalized introduction",
  "days": [
    {
      "day": "Monday",
      "breakfast": { "name": "...", "items": ["..."], "carbs": 0, "calories": 0, "gl": 0, "tips": "..." },
      "lunch":     { "name": "...", "items": ["..."], "carbs": 0, "calories": 0, "gl": 0, "tips": "..." },
      "dinner":    { "name": "...", "items": ["..."], "carbs": 0, "calories": 0, "gl": 0, "tips": "..." },
      "snacks":    [{ "name": "...", "carbs": 0, "calories": 0 }]
    }
  ],
  "swaps": [{ "from": "...", "to": "...", "reason": "...", "carbSaving": 0 }],
  "hiddenSugars": ["..."],
  "weeklyTips": ["..."]
}`;

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: 'Please generate my personalized weekly meal plan.' }],
  });

  let full = '';
  stream.on('text', (text) => { full += text; onChunk(text); });
  await stream.finalMessage();
  onDone(full);
}

// ── Chat / coaching (streaming) ────────────────────────────────────────────────
export async function chatStream(user, messages, recentFoodLogs, recentGlucose, onChunk, onDone) {
  const foodSummary = recentFoodLogs
    .slice(-10)
    .map((l) => `${l.mealType} (${new Date(l.timestamp).toLocaleDateString()}): ${l.totalCarbs}g carbs, ${l.totalCalories} kcal`)
    .join('\n');

  const glucoseSummary = recentGlucose
    .slice(-20)
    .map((r) => `${new Date(r.timestamp).toLocaleString()}: ${Math.round(r.value)} mg/dL${r.mealContext ? ` (${r.mealContext})` : ''}`)
    .join('\n');

  const systemPrompt = `You are GlucoCoach, a compassionate 24/7 AI diabetes diet coach with expertise in nutrition, behavioral health, and diabetes management.

${buildPatientContext(user)}

RECENT GLUCOSE READINGS (last 20):
${glucoseSummary || 'No recent readings'}

RECENT FOOD LOG (last 10 meals):
${foodSummary || 'No recent food logs'}

COACHING APPROACH:
- Use evidence-based nutrition science and motivational interviewing techniques.
- Apply CBT-based motivational nudges when the patient seems discouraged.
- When analyzing restaurant menus: identify safe options, warn about hidden carbs, suggest modifications.
- Always contextualize advice using the patient's actual glucose and food data above.
- Be warm, encouraging, and non-judgmental. Celebrate small wins.
- If asked about medications, recommend consulting their doctor.
- Keep responses concise unless the patient asks for detail.`;

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  let full = '';
  stream.on('text', (text) => { full += text; onChunk(text); });
  await stream.finalMessage();
  onDone(full);
}

// ── Food photo analysis (non-streaming) ────────────────────────────────────────
export async function analyzeFoodImage(base64Image, mediaType = 'image/jpeg') {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Image },
          },
          {
            type: 'text',
            text: `Analyze this food image for a diabetic patient. Identify all visible foods and return a JSON object:
{
  "foods": [{ "name": "...", "portion": "...", "carbs": 0, "calories": 0, "gi": 0, "gl": 0 }],
  "totalCarbs": 0,
  "totalCalories": 0,
  "diabeticWarnings": ["..."],
  "confidence": "high|medium|low"
}
Be as accurate as possible with portion sizes and carb estimates.`,
          },
        ],
      },
    ],
  });

  const text = response.content[0].text;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: text };
  } catch {
    return { raw: text };
  }
}

// ── Spike prediction reasoning ────────────────────────────────────────────────
export async function predictGlucoseSpike(user, foods, currentGlucose) {
  const foodList = foods.map((f) => `${f.name}: ${f.carbs}g carbs, GI ${f.gi ?? 'unknown'}`).join('\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Patient profile: ${user.diabetesType}, HbA1c ${user.hba1c}%, current glucose ${currentGlucose} mg/dL.

Planned meal:
${foodList}

Predict whether this meal will cause a significant glucose spike (>180 mg/dL) and explain WHY in 2-3 sentences.
Return JSON: { "willSpike": true/false, "predictedPeak": number, "reason": "...", "recommendation": "..." }`,
      },
    ],
  });

  const text = response.content[0].text;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: text };
  } catch {
    return { raw: text };
  }
}

// ── Weekly insight report ─────────────────────────────────────────────────────
export async function generateWeeklyReport(user, glucoseReadings, foodLogs) {
  const avgGlucose = glucoseReadings.reduce((s, r) => s + r.value, 0) / (glucoseReadings.length || 1);
  const totalCarbs = foodLogs.reduce((s, l) => s + l.totalCarbs, 0);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Generate a weekly health insight report for this patient.

${buildPatientContext(user)}

WEEK STATS:
- Average glucose: ${Math.round(avgGlucose)} mg/dL
- Total carb intake: ${Math.round(totalCarbs)}g over ${foodLogs.length} logged meals
- Glucose readings: ${glucoseReadings.length} data points
- High readings (>180): ${glucoseReadings.filter((r) => r.value > 180).length}
- Low readings (<70): ${glucoseReadings.filter((r) => r.value < 70).length}

Return JSON: {
  "overallScore": 1-10,
  "summary": "...",
  "patterns": ["..."],
  "wins": ["..."],
  "improvements": ["..."],
  "actionItems": ["..."]
}`,
      },
    ],
  });

  const text = response.content[0].text;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: text };
  } catch {
    return { raw: text };
  }
}

// ── Food label scanner ────────────────────────────────────────────────────────
export async function analyzeFoodLabel(base64Image, mediaType = 'image/jpeg', user, carbBudgetRemaining, carbsConsumedToday) {
  const systemPrompt = `You are a diabetes diet safety assistant. Analyze food product labels with deep clinical accuracy.

${buildPatientContext(user)}

TODAY'S CONTEXT:
- Carbs consumed today: ${Math.round(carbsConsumedToday)}g
- Remaining carb budget: ${Math.round(carbBudgetRemaining)}g
- Daily carb target: ${user.carbTarget}g

Your analysis must be evidence-based, specific to this patient's profile, and actionable.
Always account for the patient's remaining carb budget when recommending portions.`;

  const userPrompt = `Analyze this food label image and return a structured safety assessment for this diabetic patient.

Evaluate:
1. Is this food SAFE / CAUTION / AVOID based on: net carbs, glycemic index of ingredients, saturated fat, sodium, and this patient's remaining carb budget of ${Math.round(carbBudgetRemaining)}g.
2. What is the recommended portion size given their remaining carb budget?
3. What is the glycemic impact — will it cause a spike? (LOW / MEDIUM / HIGH)
4. What are the specific health concerns (saturated fat %, sodium, refined ingredients, hidden sugars)?
5. Verdict: BUY IT or SKIP IT with one concise reason.

Return ONLY a valid JSON object with exactly these keys:
{
  "product_name": "string — name of the product if visible, else 'Unknown Product'",
  "verdict": "BUY IT" | "BUY WITH CARE" | "SKIP IT",
  "safety_level": "SAFE" | "CAUTION" | "AVOID",
  "recommended_portion": "string — e.g. '1 serving (28g / 8 pieces)'",
  "net_carbs_per_serving": number,
  "spike_risk": "LOW" | "MEDIUM" | "HIGH",
  "spike_explanation": "string — one sentence explaining the glycemic mechanism",
  "health_concerns": ["string"],
  "reasoning": "string — 2-3 sentence clinical rationale",
  "tips": ["string — max 4 actionable tips"],
  "nutrition_extracted": {
    "serving_size": "string",
    "calories": number | null,
    "total_carbs": number | null,
    "fiber": number | null,
    "net_carbs": number | null,
    "sugars": number | null,
    "saturated_fat": number | null,
    "sodium": number | null,
    "protein": number | null
  }
}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Image },
          },
          { type: 'text', text: userPrompt },
        ],
      },
    ],
  });

  const text = response.content[0].text;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    return JSON.parse(jsonMatch[0]);
  } catch {
    return { raw: text, product_name: 'Unknown Product', verdict: 'BUY WITH CARE', safety_level: 'CAUTION' };
  }
}

// ── Food swap suggestions ─────────────────────────────────────────────────────
export async function suggestFoodSwaps(foodName, user) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Suggest 3 diabetes-friendly alternatives to "${foodName}" for a patient with ${user.diabetesType}.
Allergies: ${user.allergies?.join(', ') || 'none'}.
Return JSON: { "swaps": [{ "name": "...", "reason": "...", "carbSaving": 0, "tasteMatch": "similar|different" }] }`,
      },
    ],
  });

  const text = response.content[0].text;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: text };
  } catch {
    return { raw: text };
  }
}
