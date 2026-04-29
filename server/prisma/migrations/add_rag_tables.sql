-- ──────────────────────────────────────────────────────────────────────────────
-- GlucoAI RAG pipeline — pgvector tables
-- Apply: cd server && npx prisma db execute --file prisma/migrations/add_rag_tables.sql --schema=prisma/schema.prisma
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. ADA document chunks with embeddings
CREATE TABLE IF NOT EXISTS rag_chunks (
  id          TEXT         PRIMARY KEY,
  source      TEXT         NOT NULL,
  document    TEXT         NOT NULL,
  journal_ref TEXT,
  section     TEXT,
  pdf_page    INTEGER,
  chunk_index INTEGER,
  tags        TEXT[]       DEFAULT '{}',
  chunk_text  TEXT         NOT NULL,
  embedding   vector(1024),
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- IVFFlat index for fast approximate cosine search
CREATE INDEX IF NOT EXISTS rag_embedding_idx
  ON rag_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- GIN index for tag filtering
CREATE INDEX IF NOT EXISTS rag_tags_idx
  ON rag_chunks USING GIN (tags);

-- 3. Embedding cache — avoids re-embedding identical query strings
CREATE TABLE IF NOT EXISTS rag_query_cache (
  query_hash TEXT         PRIMARY KEY,
  query_text TEXT,
  embedding  vector(1024),
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

-- 4. Scanned food recommendations (text-based RAG food check)
CREATE TABLE IF NOT EXISTS scanned_foods (
  id                  TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id             TEXT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  food_name           TEXT         NOT NULL,
  glucose_at_scan     FLOAT,
  verdict             TEXT,
  spike_risk          TEXT,
  portion_advice      TEXT,
  recommendation_json JSONB,
  scanned_at          TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scanned_foods_user_idx ON scanned_foods(user_id, scanned_at DESC);

-- 5. Add ragGrounded flag to meal_plans if not already present
ALTER TABLE meal_plans
  ADD COLUMN IF NOT EXISTS rag_grounded BOOLEAN DEFAULT FALSE;
