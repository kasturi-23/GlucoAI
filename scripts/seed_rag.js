/**
 * Seed RAG chunks from data/ada_chunks.json into rag_chunks (pgvector).
 *
 * Usage:
 *   cd scripts && node seed_rag.js
 *   or from repo root: npm run rag:seed
 *
 * Requires either VOYAGE_API_KEY or OPENAI_API_KEY in server/.env.
 * DATABASE_URL must also be set in server/.env.
 */
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load server .env
dotenv.config({ path: resolve(__dirname, '../server/.env') });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BATCH_SIZE  = 10;
const BATCH_DELAY = 250; // ms between batches

// ── Embedding providers ──────────────────────────────────────────────────────

async function callVoyage(texts) {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ model: 'voyage-3', input: texts }),
  });
  if (!res.ok) throw new Error(`Voyage AI error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

async function callOpenAI(texts) {
  const embeddings = [];
  for (const text of texts) {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text, dimensions: 1024 }),
    });
    if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    embeddings.push(data.data[0].embedding);
  }
  return embeddings;
}

async function embedBatch(texts) {
  if (process.env.VOYAGE_API_KEY) return callVoyage(texts);
  if (process.env.OPENAI_API_KEY) return callOpenAI(texts);
  throw new Error('Set VOYAGE_API_KEY or OPENAI_API_KEY in server/.env');
}

// ── Upsert ───────────────────────────────────────────────────────────────────

async function upsertChunk(chunk, embedding) {
  const vecStr = `[${embedding.join(',')}]`;
  await pool.query(
    `INSERT INTO rag_chunks
       (id, source, document, journal_ref, section, pdf_page, chunk_index, tags, chunk_text, embedding)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::vector)
     ON CONFLICT (id) DO UPDATE SET
       chunk_text  = EXCLUDED.chunk_text,
       embedding   = EXCLUDED.embedding,
       tags        = EXCLUDED.tags`,
    [
      chunk.id,
      chunk.source,
      chunk.document,
      chunk.journal_ref,
      chunk.section,
      chunk.pdf_page,
      chunk.chunk_index,
      chunk.tags,
      chunk.text,
      vecStr,
    ]
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const chunksPath = resolve(__dirname, '../data/ada_chunks.json');
  let chunks;
  try {
    chunks = JSON.parse(readFileSync(chunksPath, 'utf8'));
  } catch {
    console.error(`Could not read ${chunksPath}`);
    console.error('Run: python scripts/extract_ada_chunks.py  (requires the PDF in data/)');
    process.exit(1);
  }

  console.log(`Seeding ${chunks.length} ADA 2026 chunks into rag_chunks...`);

  // Check for already-embedded chunks to enable resume
  const existingRes = await pool.query('SELECT id FROM rag_chunks WHERE embedding IS NOT NULL');
  const existing = new Set(existingRes.rows.map((r) => r.id));
  const pending = chunks.filter((c) => !existing.has(c.id));

  if (pending.length === 0) {
    console.log(`All ${chunks.length} chunks already seeded.`);
    await pool.end();
    return;
  }

  console.log(`${existing.size} already seeded. Embedding ${pending.length} new chunks...`);

  let done = existing.size;
  let errors = 0;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => c.text);

    try {
      const embeddings = await embedBatch(texts);
      await Promise.all(batch.map((c, idx) => upsertChunk(c, embeddings[idx])));
      done += batch.length;
      console.log(`Progress: ${done}/${chunks.length} chunks embedded from ADA 2026`);
    } catch (err) {
      errors += batch.length;
      console.error(`Batch ${i / BATCH_SIZE + 1} failed: ${err.message}`);
    }

    if (i + BATCH_SIZE < pending.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY));
    }
  }

  await pool.end();

  if (errors > 0) {
    console.warn(`Completed with ${errors} chunk(s) failed. Re-run to retry.`);
  } else {
    console.log(`Done. ${done} chunks ready for RAG retrieval.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
