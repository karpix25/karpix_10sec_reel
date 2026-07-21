import pool from "@/lib/db";

let schemaReady: Promise<void> | null = null;

const statements = [
  `CREATE TABLE IF NOT EXISTS audio_tracks (
    id SERIAL PRIMARY KEY,
    mood TEXT NOT NULL,
    title TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    storage_key TEXT,
    content_type TEXT,
    duration_seconds NUMERIC,
    status TEXT NOT NULL DEFAULT 'active',
    play_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS idx_audio_tracks_mood_status ON audio_tracks(mood, status, last_used_at)",
  "CREATE INDEX IF NOT EXISTS idx_audio_tracks_status ON audio_tracks(status, updated_at DESC)",
];

export async function ensureAudioLibrarySchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const statement of statements) {
        await pool.query(statement);
      }
    })();
  }

  return schemaReady;
}
