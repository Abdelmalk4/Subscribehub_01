-- =============================================
-- Session Storage Table for grammY Bots
-- Persists conversation state across restarts
-- =============================================

CREATE TABLE IF NOT EXISTS bot_sessions (
  id TEXT PRIMARY KEY,
  session JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups and cleanup
CREATE INDEX idx_bot_sessions_updated ON bot_sessions(updated_at);

-- Auto-update timestamp trigger
CREATE TRIGGER update_bot_sessions_updated_at
  BEFORE UPDATE ON bot_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Enable RLS (service role only - no anon access)
ALTER TABLE bot_sessions ENABLE ROW LEVEL SECURITY;

-- Optional: Cleanup old sessions (run periodically)
-- DELETE FROM bot_sessions WHERE updated_at < NOW() - INTERVAL '7 days';

COMMENT ON TABLE bot_sessions IS 'Session storage for Telegram bots - service role only';
