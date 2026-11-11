import type { DatabaseSync } from "node:sqlite";
import { database } from "./local-driver.ts";
import { rememberFacts, writeGuideMessage } from "./ai.ts";
import { processMemory, processExchange } from "./guides.ts";
export function installGuides(db: DatabaseSync) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS guide_settings(member TEXT PRIMARY KEY REFERENCES members(id), memory INTEGER NOT NULL DEFAULT 1, outreach INTEGER NOT NULL DEFAULT 0, generation INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS guide_memories(member TEXT REFERENCES members(id),topic TEXT,fact TEXT NOT NULL,evidence TEXT NOT NULL,updated TEXT NOT NULL,PRIMARY KEY(member,topic));
  CREATE TABLE IF NOT EXISTS memory_inbox(seq INTEGER PRIMARY KEY AUTOINCREMENT, member TEXT REFERENCES members(id), message TEXT UNIQUE REFERENCES messages(id) ON DELETE CASCADE);
  CREATE TABLE IF NOT EXISTS memory_work(member TEXT PRIMARY KEY REFERENCES members(id),due INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS guide_exchanges(id TEXT PRIMARY KEY,a TEXT REFERENCES members(id),b TEXT REFERENCES members(id),fingerprint TEXT,status TEXT,pitch TEXT,response TEXT,due INTEGER,attempts INTEGER DEFAULT 0, UNIQUE(a,b));
  CREATE TRIGGER IF NOT EXISTS remember_private_turn AFTER INSERT ON messages
    WHEN new.role='user' AND new.scope LIKE 'personal:%' AND coalesce((SELECT memory FROM guide_settings WHERE member=substr(new.scope,10)),1)=1
    BEGIN
      INSERT INTO memory_inbox(member,message) VALUES(substr(new.scope,10),new.id);
      INSERT INTO memory_work(member,due) VALUES(substr(new.scope,10),CAST(unixepoch('subsec')*1000 AS INTEGER)+2200)
        ON CONFLICT(member) DO UPDATE SET due=excluded.due,attempts=0;
    END;
  `);
}
export function startGuides(db: DatabaseSync, admit: (id: string) => void) {
  const providers = { memory: rememberFacts, discuss: writeGuideMessage };
  for (const work of [processMemory, processExchange]) {
    let running = false;
    setInterval(async () => {
      if (running) return;
      running = true;
      try {
        await work(database(db), providers, admit);
      } catch {
        console.warn("Guide background task interrupted.");
      } finally {
        running = false;
      }
    }, 850).unref();
  }
}
