CREATE TABLE IF NOT EXISTS shared_experiences(id TEXT PRIMARY KEY,member TEXT NOT NULL REFERENCES members(id),origin TEXT NOT NULL,source_key TEXT NOT NULL,title TEXT NOT NULL,excerpt TEXT NOT NULL,updated TEXT NOT NULL,terms TEXT NOT NULL,UNIQUE(member,origin,source_key));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS voice_experience_lookups(member TEXT NOT NULL REFERENCES members(id),run TEXT NOT NULL,experience TEXT NOT NULL,PRIMARY KEY(member,run,experience));
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS withdraw_forgotten_fact AFTER DELETE ON guide_memories BEGIN DELETE FROM shared_experiences WHERE member=OLD.member AND origin='fact' AND source_key=OLD.topic; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS withdraw_changed_fact AFTER UPDATE ON guide_memories WHEN OLD.fact<>NEW.fact OR OLD.evidence<>NEW.evidence BEGIN DELETE FROM shared_experiences WHERE member=OLD.member AND origin='fact' AND source_key=OLD.topic; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS withdraw_changed_reference AFTER UPDATE ON conversation_memories WHEN NEW.state<>'active' OR OLD.content<>NEW.content OR OLD.quote<>NEW.quote BEGIN DELETE FROM shared_experiences WHERE member=OLD.member AND origin='reference' AND source_key=OLD.id; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS withdraw_deleted_reference AFTER DELETE ON conversation_memories BEGIN DELETE FROM shared_experiences WHERE member=OLD.member AND origin='reference' AND source_key=OLD.id; END;
