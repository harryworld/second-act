CREATE TABLE IF NOT EXISTS members(id TEXT PRIMARY KEY, profile TEXT NOT NULL, login TEXT UNIQUE, password TEXT);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, member TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE, expiry INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ventures(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES members(id), data TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS team(venture TEXT REFERENCES ventures(id) ON DELETE CASCADE, member TEXT REFERENCES members(id), PRIMARY KEY(venture,member));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS invites(code TEXT PRIMARY KEY, venture TEXT REFERENCES ventures(id) ON DELETE CASCADE, expiry INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, scope TEXT NOT NULL, role TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS messages_timeline ON messages(scope,created);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS voice_sessions(id TEXT PRIMARY KEY, member TEXT NOT NULL REFERENCES members(id), scope TEXT NOT NULL, started INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY, member TEXT REFERENCES members(id), title TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS introductions(id TEXT PRIMARY KEY, sender TEXT REFERENCES members(id), recipient TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL, UNIQUE(sender,recipient));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS memberships(circle TEXT, member TEXT REFERENCES members(id), PRIMARY KEY(circle,member));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY,circle TEXT NOT NULL,member TEXT REFERENCES members(id),body TEXT NOT NULL,created TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS circles(id TEXT PRIMARY KEY, host TEXT REFERENCES members(id), name TEXT, topic TEXT, city TEXT, summary TEXT);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS meetings(id TEXT PRIMARY KEY, circle TEXT, title TEXT, start TEXT, place TEXT);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY, circle TEXT, post TEXT, reporter TEXT REFERENCES members(id), reason TEXT, status TEXT);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS blocks(member TEXT REFERENCES members(id), other TEXT REFERENCES members(id), PRIMARY KEY(member,other));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public_versions(venture TEXT REFERENCES ventures(id), version INTEGER, package TEXT NOT NULL, approved_by TEXT REFERENCES members(id), PRIMARY KEY(venture,version));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ledger_batches(venture TEXT REFERENCES ventures(id), batch TEXT, PRIMARY KEY(venture,batch));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agreements(venture TEXT REFERENCES ventures(id),member TEXT REFERENCES members(id),revision INTEGER,PRIMARY KEY(venture,member));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS guide_settings(member TEXT PRIMARY KEY REFERENCES members(id), memory INTEGER NOT NULL DEFAULT 1, outreach INTEGER NOT NULL DEFAULT 0, generation INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS guide_memories(member TEXT REFERENCES members(id),topic TEXT,fact TEXT NOT NULL,evidence TEXT NOT NULL,updated TEXT NOT NULL,PRIMARY KEY(member,topic));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS memory_inbox(seq INTEGER PRIMARY KEY AUTOINCREMENT, member TEXT REFERENCES members(id), message TEXT UNIQUE REFERENCES messages(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS memory_work(member TEXT PRIMARY KEY REFERENCES members(id),due INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS guide_exchanges(id TEXT PRIMARY KEY,a TEXT REFERENCES members(id),b TEXT REFERENCES members(id),fingerprint TEXT,status TEXT,pitch TEXT,response TEXT,due INTEGER,attempts INTEGER DEFAULT 0, UNIQUE(a,b));
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS remember_private_turn AFTER INSERT ON messages
    WHEN new.role='user' AND new.scope LIKE 'personal:%' AND coalesce((SELECT memory FROM guide_settings WHERE member=substr(new.scope,10)),1)=1
    BEGIN
      INSERT INTO memory_inbox(member,message) VALUES(substr(new.scope,10),new.id);
      INSERT INTO memory_work(member,due) VALUES(substr(new.scope,10),CAST(unixepoch('subsec')*1000 AS INTEGER)+2200)
        ON CONFLICT(member) DO UPDATE SET due=excluded.due,attempts=0;
    END;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS host_jobs(name TEXT PRIMARY KEY, token TEXT NOT NULL, until_ms INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS host_limits(key TEXT PRIMARY KEY, bucket INTEGER NOT NULL, count INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS receipt_parts(venture TEXT NOT NULL REFERENCES ventures(id), entry TEXT NOT NULL, part INTEGER NOT NULL, content TEXT NOT NULL, PRIMARY KEY(venture,entry,part));
