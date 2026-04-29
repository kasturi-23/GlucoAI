import pg from 'pg';
const { Pool } = pg;

// Shared pg pool — used for raw pgvector queries that Prisma can't express.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[pg pool] Unexpected error:', err.message);
});

export { pool };
