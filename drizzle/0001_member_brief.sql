CREATE TABLE IF NOT EXISTS profile_briefs(member TEXT PRIMARY KEY REFERENCES members(id), revision INTEGER NOT NULL DEFAULT 0, brief TEXT);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS invalidate_brief_created AFTER INSERT ON guide_memories
BEGIN
  INSERT INTO profile_briefs(member, revision, brief) VALUES(NEW.member, 1, NULL)
  ON CONFLICT(member) DO UPDATE SET revision=revision+1, brief=NULL;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS invalidate_brief_revised AFTER UPDATE ON guide_memories
BEGIN
  INSERT INTO profile_briefs(member, revision, brief) VALUES(NEW.member, 1, NULL)
  ON CONFLICT(member) DO UPDATE SET revision=revision+1, brief=NULL;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS invalidate_brief_forgotten AFTER DELETE ON guide_memories
BEGIN
  INSERT INTO profile_briefs(member, revision, brief) VALUES(OLD.member, 1, NULL)
  ON CONFLICT(member) DO UPDATE SET revision=revision+1, brief=NULL;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS invalidate_brief_edited AFTER UPDATE OF profile ON members WHEN NEW.profile <> OLD.profile
BEGIN
  INSERT INTO profile_briefs(member, revision, brief) VALUES(NEW.id, 1, NULL)
  ON CONFLICT(member) DO UPDATE SET revision=revision+1, brief=NULL;
END;
