// Database access. Every API request runs inside ONE transaction that first
// tells Postgres who is asking (staff / student / system). The row-level
// security policies in db/schema.sql use that to fence off student data.
import pg from 'pg';

let pool;

export function getPool() {
  if (!pool) {
    // APP_DATABASE_URL is the restricted cic_app role (row-level security applies).
    // DATABASE_URL is the owner role, used only by scripts/db-setup.js.
    const connectionString = process.env.APP_DATABASE_URL;
    if (!connectionString) throw new Error('APP_DATABASE_URL is not set (see .env.example)');
    // Serverless: keep the pool tiny and use Neon's pooled connection string.
    pool = new pg.Pool({ connectionString, max: 3, idleTimeoutMillis: 10_000 });
  }
  return pool;
}

export const dbConfigured = () => Boolean(process.env.APP_DATABASE_URL);

/**
 * Run fn(q) inside a transaction as the given actor.
 * actor = { kind: 'staff' | 'student' | 'system', studentId?: number }
 * q(sql, params) -> rows; q.one(sql, params) -> first row or null
 */
export async function withActor(actor, fn, pool_ = getPool()) {
  const client = await pool_.connect();
  try {
    await client.query('begin');
    await client.query(
      "select set_config('app.actor_kind', $1, true), set_config('app.student_id', $2, true)",
      [actor.kind, actor.studentId ? String(actor.studentId) : '']
    );
    const q = async (text, params = []) => (await client.query(text, params)).rows;
    q.one = async (text, params = []) => (await q(text, params))[0] ?? null;
    const result = await fn(q);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export const asSystem = (fn, pool_) => withActor({ kind: 'system' }, fn, pool_);

/** Record a privileged change. Call inside the same transaction as the change. */
export const audit = (q, actorId, action, entity, entityId = null, detail = {}) =>
  q('insert into audit_log (actor_id, action, entity, entity_id, detail) values ($1, $2, $3, $4, $5)',
    [actorId ?? null, action, entity, entityId === null ? null : String(entityId), detail]);

/** True when the connected role cannot bypass row-level security. Shown on /api/health. */
export async function rlsEnforced() {
  const r = await getPool().query('select not (rolsuper or rolbypassrls) as ok from pg_roles where rolname = current_user');
  return r.rows[0]?.ok === true;
}
