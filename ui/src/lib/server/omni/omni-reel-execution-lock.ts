import pool from "@/lib/db";

const OMNI_REEL_EXECUTION_LOCK_NAMESPACE = 54_107;

export async function withOmniReelExecutionLock<T>(reelId: number, input: {
  onLocked: () => Promise<T>;
  run: () => Promise<T>;
}) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1::int, $2::int) AS locked",
      [OMNI_REEL_EXECUTION_LOCK_NAMESPACE, reelId]
    );
    if (!rows[0]?.locked) return input.onLocked();

    try {
      return await input.run();
    } finally {
      await client.query("SELECT pg_advisory_unlock($1::int, $2::int)", [OMNI_REEL_EXECUTION_LOCK_NAMESPACE, reelId]);
    }
  } finally {
    client.release();
  }
}
