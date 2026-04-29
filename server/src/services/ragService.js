/**
 * RAG orchestrator — grounds all dietary recommendations in
 * ADA Standards of Care in Diabetes 2026 (Diabetes Care 2026;49(Suppl. 1)).
 *
 * Flow:
 *   1. Build two semantic queries from patient context + food item
 *   2. Embed queries (cached)
 *   3. Retrieve top-K ADA 2026 chunks via pgvector cosine similarity
 *   4. Deduplicate, format into numbered context block
 *   5. Call Claude with a strict RAG system prompt
 *   6. Return structured JSON + chunk metadata
 */
import Anthropic from '@anthropic-ai/sdk';
import { getEmbedding } from '../utils/embed.js';
import { retrieveChunks, formatContext } from './ragRetriever.js';

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL  = 'claude-sonnet-4-20250514';

// ── Glucose classification (ADA 2026, Section 2, PDF p.34) ───────────────────
export function classifyGlucose(value) {
  if (value === null || value === undefined) return 'Unknown';
  if (value < 70)   return 'Low';
  if (value <= 99)  return 'Normal';
  if (value <= 125) return 'Pre-Diabetic';
  return 'High';
}

// ── Tag sets by request type ──────────────────────────────────────────────────
const REQUEST_TAGS = {
  food_check:    ['carbohydrate', 'eating_patterns', 'mnt_recommendations'],
  meal_plan:     ['mnt_recommendations', 'eating_patterns', 'weight'],
  weekly_advice: ['eating_patterns', 'weight', 'mnt_recommendations'],
};

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * @param {{
 *   patient: { name?, diabetesType?, hba1c?, carbTarget?, medications?, age? },
 *   glucose: { value: number, classification?: string },
 *   foodQuery?: string,
 *   requestType: 'food_check'|'meal_plan'|'weekly_advice'
 * }} params
 */
export async function getRagGroundedRecommendation({ patient, glucose, foodQuery, requestType }) {
  const glucoseValue  = glucose?.value ?? 100;
  const classification = glucose?.classification ?? classifyGlucose(glucoseValue);
  const diabetesType  = patient?.diabetesType?.replace('_', ' ') ?? 'Type 2';
  const hba1c         = patient?.hba1c    ?? '?';
  const carbTarget    = patient?.carbTarget ?? 150;
  const meds          = Array.isArray(patient?.medications)
    ? patient.medications.map((m) => `${m.name} ${m.dosage}`).join(', ')
    : (patient?.medications ?? 'None listed');

  // 1. Build retrieval queries
  const q1 = `${diabetesType} diabetes ${classification} glucose ${glucoseValue} mg/dL dietary recommendation meal`;
  const q2 = foodQuery
    ? `${foodQuery} glycemic index carbohydrate diabetes safe portion`
    : q1;

  // 2. Embed in parallel
  const [emb1, emb2] = await Promise.all([getEmbedding(q1), getEmbedding(q2)]);

  const tags = REQUEST_TAGS[requestType] ?? REQUEST_TAGS.food_check;

  // 3. Retrieve in parallel
  const [chunks1, chunks2] = await Promise.all([
    retrieveChunks(emb1, { tags, topK: 4, minSimilarity: 0.65 }),
    retrieveChunks(emb2, { tags: ['carbohydrate', 'eating_patterns'], topK: 3, minSimilarity: 0.65 }),
  ]);

  // 4. Deduplicate by chunk id
  const seenIds = new Set();
  const allChunks = [...chunks1, ...chunks2].filter((c) => {
    if (seenIds.has(c.id)) return false;
    seenIds.add(c.id);
    return true;
  });

  // Sort by similarity descending
  allChunks.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));

  const contextBlock = formatContext(allChunks);

  // 5. Build Claude prompt
  const systemPrompt = buildSystemPrompt({
    diabetesType, hba1c, carbTarget, meds,
    glucoseValue, classification,
    contextBlock,
    age: patient?.age,
  });

  const userMessage = buildUserMessage({ requestType, foodQuery, glucoseValue, classification });

  // 6. Call Claude
  const response = await claude.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const raw = response.content[0].text;

  // 7. Parse JSON
  let recommendation;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    recommendation = match ? JSON.parse(match[0]) : buildFallback(raw);
  } catch {
    recommendation = buildFallback(raw);
  }

  // Ensure disclaimer is always present
  if (!recommendation.disclaimer) {
    recommendation.disclaimer =
      'Based on ADA Standards of Care in Diabetes 2026 (Diabetes Care 2026;49(Suppl.1)). Not a substitute for personalised medical advice.';
  }

  // 8. Attach source metadata
  recommendation.retrieved_chunks = allChunks.slice(0, 5).map((c) => ({
    ref:        `ADA 2026 PDF p.${c.pdfPage ?? '?'}`,
    section:    c.section,
    tags:       c.tags,
    similarity: Math.round((c.similarity ?? 0) * 1000) / 10,
    excerpt:    c.chunkText?.slice(0, 160) + (c.chunkText?.length > 160 ? '…' : ''),
  }));

  return recommendation;
}

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildSystemPrompt({ diabetesType, hba1c, carbTarget, meds, glucoseValue, classification, contextBlock, age }) {
  return `You are GlucoAI, a dietary guidance assistant for people with diabetes.

CRITICAL RULE: Your recommendations MUST be grounded EXCLUSIVELY in the retrieved excerpts from "ADA Standards of Care in Diabetes 2026" (Diabetes Care 2026;49(Suppl. 1)) shown below. Do NOT add any dietary advice not supported by the retrieved text. Cite specific ADA 2026 passages (e.g. "Rec 5.14, PDF p.99") in every recommendation.

PATIENT PROFILE:
- Diabetes type:       ${diabetesType}
- Age:                 ${age ?? 'Not provided'}
- HbA1c:               ${hba1c}%
- Daily carb target:   ${carbTarget}g
- Medications:         ${meds}

CURRENT GLUCOSE STATUS:
- Reading:             ${glucoseValue} mg/dL → ${classification}
- ADA 2026 thresholds: Low <70 | Normal 70–99 | Pre-Diabetic 100–125 | High ≥126

RETRIEVED ADA STANDARDS OF CARE 2026 EXCERPTS:
${contextBlock}

RESPONSE RULES:
1. Cite specific ADA 2026 recommendations (e.g. "Rec 5.14", "PDF p.101").
2. Flag refined carbohydrates, sugary beverages, and high-GI foods as spike risks.
3. Adjust advice based on the glucose classification above.
4. Return ONLY a valid JSON object — no markdown, no backticks, no commentary outside JSON.
5. If no relevant chunks were retrieved, respond conservatively with CAUTION/Avoid and note the data limitation.`.trim();
}

function buildUserMessage({ requestType, foodQuery, glucoseValue, classification }) {
  if (requestType === 'food_check' && foodQuery) {
    return `Assess whether "${foodQuery}" is safe for this patient right now (current glucose: ${glucoseValue} mg/dL, ${classification}).

Return this exact JSON structure:
{
  "verdict":         "Safe" | "Caution" | "Avoid" | "Recommended" | "Modify",
  "safety_level":    "green" | "amber" | "red",
  "recommendation":  "<2–3 sentence plain-language explanation citing ADA 2026>",
  "portion_advice":  "<specific portion, e.g. '½ cup (90g)'>",
  "spike_risk":      "Low" | "Medium" | "High",
  "cited_sources":   ["<ADA 2026, Rec X.XX, PDF p.YY: brief excerpt>"],
  "health_concerns": ["<concern 1>"],
  "tips":            ["<actionable tip 1>", "<actionable tip 2>"],
  "gi_note":         "<GI/GL note or null>",
  "disclaimer":      "Based on ADA Standards of Care in Diabetes 2026 (Diabetes Care 2026;49(Suppl.1)). Not a substitute for personalised medical advice."
}`;
  }

  if (requestType === 'meal_plan') {
    return `Provide meal planning guidance for this patient (current glucose: ${glucoseValue} mg/dL, ${classification}).

Return this exact JSON structure:
{
  "verdict":         "Recommended" | "Caution" | "Modify",
  "safety_level":    "green" | "amber" | "red",
  "recommendation":  "<2–3 sentences citing ADA 2026 meal planning recommendations>",
  "portion_advice":  "<guidance on meal structure and portions>",
  "spike_risk":      "Low" | "Medium" | "High",
  "cited_sources":   ["<ADA 2026, Rec X.XX, PDF p.YY: brief excerpt>"],
  "health_concerns": ["<concern if any>"],
  "tips":            ["<practical meal planning tip 1>", "<practical meal planning tip 2>"],
  "gi_note":         "<GI/GL note or null>",
  "disclaimer":      "Based on ADA Standards of Care in Diabetes 2026 (Diabetes Care 2026;49(Suppl.1)). Not a substitute for personalised medical advice."
}`;
  }

  // weekly_advice
  return `Provide weekly dietary advice for this patient (current glucose: ${glucoseValue} mg/dL, ${classification}).

Return this exact JSON structure:
{
  "verdict":         "Recommended" | "Caution" | "Modify",
  "safety_level":    "green" | "amber" | "red",
  "recommendation":  "<2–3 sentences of ADA 2026-grounded weekly dietary advice>",
  "portion_advice":  "<general portion and eating pattern guidance>",
  "spike_risk":      "Low" | "Medium" | "High",
  "cited_sources":   ["<ADA 2026, Rec X.XX, PDF p.YY: brief excerpt>"],
  "health_concerns": ["<concern if any>"],
  "tips":            ["<actionable weekly tip 1>"],
  "gi_note":         null,
  "disclaimer":      "Based on ADA Standards of Care in Diabetes 2026 (Diabetes Care 2026;49(Suppl.1)). Not a substitute for personalised medical advice."
}`;
}

function buildFallback(raw) {
  return {
    verdict:         'Caution',
    safety_level:    'amber',
    recommendation:  raw.slice(0, 400),
    portion_advice:  'Consult your dietitian for personalised guidance.',
    spike_risk:      'Medium',
    cited_sources:   ['ADA Standards of Care in Diabetes 2026'],
    health_concerns: [],
    tips:            [],
    gi_note:         null,
    disclaimer:      'Based on ADA Standards of Care in Diabetes 2026 (Diabetes Care 2026;49(Suppl.1)). Not a substitute for personalised medical advice.',
  };
}
