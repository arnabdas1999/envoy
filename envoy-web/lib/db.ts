import postgres from 'postgres';

// For Vercel serverless: max:1 is critical to prevent connection exhaustion.
// Supabase's pooler URL (transaction mode) handles the actual pooling.
const sql = postgres(process.env.POSTGRES_URL!, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
});

export default sql;
