CREATE TABLE IF NOT EXISTS founder_chat_boundaries(member TEXT PRIMARY KEY REFERENCES members(id), last_row INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS conversation_memories(id TEXT PRIMARY KEY,member TEXT NOT NULL REFERENCES members(id),kind TEXT NOT NULL CHECK(kind IN ('instruction','reference')),state TEXT NOT NULL CHECK(state IN ('suggested','active','forgotten')),content TEXT NOT NULL,quote TEXT NOT NULL,source_id TEXT NOT NULL,source_role TEXT NOT NULL,source_date TEXT NOT NULL,updated TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS conversation_memories_owner ON conversation_memories(member,state,updated);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS guide_recall_sources(message TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS index_founder_memory AFTER INSERT ON messages
WHEN new.scope LIKE 'personal:%' AND coalesce((SELECT memory FROM guide_settings WHERE member=substr(new.scope,10)),1)=1
BEGIN
  INSERT INTO guide_recall_sources(message) VALUES(new.id);
END;
