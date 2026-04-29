/**
 * Shared embedding utility with pg-backed cache.
 *
 * Priority:
 *   1. VOYAGE_API_KEY  → voyage-3          (1024 dims, native)
 *   2. OPENAI_API_KEY  → text-embedding-3-small with dimensions=1024
 *
 * Both providers produce 1024-dim vectors so the DB schema is constant.
 */
import { createHash } from 'crypto';
import { pool } from '../lib/db.js';

const DIMS = 1024;

// ── Provider calls ──────────────────────────────────────────────────────────

async function callVoyage(text) {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ model: 'voyage-3', input: [text] }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Voyage AI error ${res.status}: ${body}`);
  }
  const data = await res.json();
  return data.data[0].embedding;
}

async function callOpenAI(text) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: DIMS,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${body}`);
  }
  const data = await res.json();
  return data.data[0].embedding;
}

async function generateEmbedding(text) {
  if (process.env.VOYAGE_API_KEY) return callVoyage(text);
  if (process.env.OPENAI_API_KEY) return callOpenAI(text);
  throw new Error(
    'No embedding API key found. Set VOYAGE_API_KEY or OPENAI_API_KEY in server/.env'
  );
}

// Parse pgvector string "[0.1,0.2,...]" → number[]
function parseVector(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    return v.replace(/[\[\]]/g, '').split(',').map(Number);
  }
  return null;
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function getEmbedding(text) {
  const hash = createHash('sha256').update(text).digest('hex');

  // 1. Cache lookup
  try {
    const cached = await pool.query(
      'SELECT embedding FROM rag_query_cache WHERE query_hash = $1',
      [hash]
    );
    if (cached.rows.length > 0 && cached.rows[0].embedding) {
      return parseVector(cached.rows[0].embedding);
    }
  } catch {
    // Cache table may not exist yet — continue to generate
  }

  // 2. Generate
  const embedding = await generateEmbedding(text);
  const vecStr    = `[${embedding.join(',')}]`;

  // 3. Store in cache (best-effort)
  try {
    await pool.query(
      `INSERT INTO rag_query_cache (query_hash, query_text, embedding)
       VALUES ($1, $2, $3::vector)
       ON CONFLICT (query_hash) DO NOTHING`,
      [hash, text.slice(0, 500), vecStr]
    );
  } catch {
    // Non-fatal
  }

  return embedding;
}

export { DIMS };
