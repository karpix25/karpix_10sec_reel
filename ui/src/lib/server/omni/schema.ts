import pool from "@/lib/db";

let schemaReady: Promise<void> | null = null;

const statements = [
  `CREATE TABLE IF NOT EXISTS omni_projects (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    telegram_chat_id TEXT,
    telegram_topic_id TEXT,
    created_by_telegram_id BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS omni_products (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES omni_projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    product_reference_notes TEXT,
    avatar_reference_notes TEXT,
    target_duration_seconds INTEGER NOT NULL DEFAULT 30,
    product_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
    avatar_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS omni_client_avatars (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES omni_projects(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    reference_url TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    provider TEXT NOT NULL DEFAULT 'kie_omni',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS omni_telegram_topic_bindings (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES omni_projects(id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL,
    topic_id TEXT NOT NULL,
    title TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_id, topic_id)
  )`,
  `CREATE TABLE IF NOT EXISTS omni_legacy_scenario_links (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES omni_projects(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES omni_products(id) ON DELETE CASCADE,
    legacy_source TEXT NOT NULL DEFAULT 'old_db',
    legacy_scenario_id BIGINT NOT NULL,
    note TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, product_id, legacy_source, legacy_scenario_id)
  )`,
  `CREATE TABLE IF NOT EXISTS omni_legacy_library_links (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES omni_projects(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES omni_products(id) ON DELETE CASCADE,
    legacy_client_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, product_id, legacy_client_id)
  )`,
  `CREATE TABLE IF NOT EXISTS omni_reels (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES omni_projects(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES omni_products(id) ON DELETE CASCADE,
    source_legacy_scenario_id BIGINT,
    target_duration_seconds INTEGER NOT NULL,
    segment_count INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    brief TEXT,
    final_video_url TEXT,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS omni_reel_segments (
    id SERIAL PRIMARY KEY,
    reel_id INTEGER NOT NULL REFERENCES omni_reels(id) ON DELETE CASCADE,
    segment_index INTEGER NOT NULL,
    duration_seconds INTEGER NOT NULL DEFAULT 10,
    prompt TEXT,
    kie_task_id TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    video_url TEXT,
    error_message TEXT,
    request_payload JSONB,
    response_payload JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(reel_id, segment_index)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_omni_products_project ON omni_products(project_id)",
  "CREATE INDEX IF NOT EXISTS idx_omni_client_avatars_project ON omni_client_avatars(project_id, updated_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_omni_links_project ON omni_legacy_scenario_links(project_id)",
  "CREATE INDEX IF NOT EXISTS idx_omni_links_product ON omni_legacy_scenario_links(product_id)",
  "CREATE INDEX IF NOT EXISTS idx_omni_library_links_project ON omni_legacy_library_links(project_id)",
  "CREATE INDEX IF NOT EXISTS idx_omni_library_links_product ON omni_legacy_library_links(product_id)",
  "CREATE INDEX IF NOT EXISTS idx_omni_reels_project_product ON omni_reels(project_id, product_id)",
  "CREATE INDEX IF NOT EXISTS idx_omni_segments_reel ON omni_reel_segments(reel_id, segment_index)",
];

export async function ensureOmniSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const statement of statements) {
        await pool.query(statement);
      }
    })();
  }

  return schemaReady;
}
