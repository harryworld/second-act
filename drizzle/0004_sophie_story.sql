CREATE TABLE IF NOT EXISTS sophie_sessions(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,expires_ms INTEGER NOT NULL,text_calls INTEGER NOT NULL DEFAULT 0,voice_calls INTEGER NOT NULL DEFAULT 0,introduction TEXT);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sophie_expiry ON sophie_sessions(expires_ms);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sophie_voice_runs(id TEXT PRIMARY KEY,session TEXT NOT NULL REFERENCES sophie_sessions(id) ON DELETE CASCADE,started INTEGER NOT NULL,batches INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sophie_story_memories(id TEXT PRIMARY KEY,author TEXT NOT NULL,title TEXT NOT NULL,excerpt TEXT NOT NULL);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS clear_sophie_transcript AFTER DELETE ON sophie_sessions BEGIN DELETE FROM messages WHERE scope='story:'||OLD.id; END;
