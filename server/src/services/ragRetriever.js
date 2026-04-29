/**
 * pgvector-backed retriever for ADA 2026 chunks.
 * Uses raw SQL via the pg pool — Prisma has no native vector support.
 */
import { pool } from '../lib/db.js';

/**
 * Retrieve top-K chunks by cosine similarity.
 *
 * @param {number[]} queryEmbedding  1024-dim query vector
 * @param {{ tags?: string[], topK?: number, minSimilarity?: number }} options
 * @returns {Promise<Array<{ id, source, document, journalRef, section, pdfPage, tags, chunkText, similarity }>>}
 */
export async function retrieveChunks(queryEmbedding, options = {}) {
  const { tags = [], topK = 5, minSimilarity = 0.72 } = options;

  const vecStr = `[${queryEmbedding.join(',')}]`;

  // Build tag filter safely (tags are internal constants, not user input)
  let tagFilter = '';
  if (tags.length > 0) {
    const tagList = tags.map((t) => `'${t.replace(/'/g, "''")}'`).join(',');
    tagFilter = `AND tags && ARRAY[${tagList}]::text[]`;
  }

  const sql = `
    SELECT
      id,
      source,
      document,
      journal_ref   AS "journalRef",
      section,
      pdf_page      AS "pdfPage",
      tags,
      chunk_text    AS "chunkText",
      ROUND(
        CAST(1 - (embedding <=> $1::vector) AS numeric), 4
      )::float       AS similarity
    FROM rag_chunks
    WHERE embedding IS NOT NULL
      AND 1 - (embedding <=> $1::vector) >= $2
      ${tagFilter}
    ORDER BY similarity DESC
    LIMIT $3
  `;

  try {
    const result = await pool.query(sql, [vecStr, minSimilarity, topK]);
    return result.rows;
  } catch (err) {
    // If rag_chunks table doesn't exist yet (before migration), return empty
    if (err.code === '42P01') {
      console.warn('[RAG] rag_chunks table not found — run npm run rag:migrate');
      return [];
    }
    throw err;
  }
}

/**
 * Format retrieved chunks into a numbered context block for the Claude prompt.
 * @param {Array} chunks
 * @returns {string}
 */
export function formatContext(chunks) {
  if (!chunks.length) {
    return 'No specific ADA 2026 excerpts retrieved. Base response on general ADA guidelines.';
  }

  return chunks
    .map((c, i) => {
      const simPct = ((c.similarity ?? 0) * 100).toFixed(1);
      const tags   = Array.isArray(c.tags) ? c.tags.join(', ') : '';
      return [
        `[REF ${i + 1}] ${c.source}`,
        `Document: ${c.document}`,
        `Citation: ${c.journalRef ?? 'Diabetes Care 2026;49(Suppl. 1)'}, ${c.section ?? ''}, PDF p.${c.pdfPage ?? '?'}`,
        `Tags: ${tags} | Similarity: ${simPct}%`,
        '---',
        c.chunkText,
      ].join('\n');
    })
    .join('\n\n');
}
