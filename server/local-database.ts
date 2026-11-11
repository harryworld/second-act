import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  randomUUID,
  createHash,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { now, uid } from "./store.ts";
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function connect(path: string) {
  if (path !== ":memory:")
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys=ON;
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS members(id TEXT PRIMARY KEY, profile TEXT NOT NULL, login TEXT UNIQUE, password TEXT);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, member TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE, expiry INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS ventures(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES members(id), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS team(venture TEXT REFERENCES ventures(id) ON DELETE CASCADE, member TEXT REFERENCES members(id), PRIMARY KEY(venture,member));
    CREATE TABLE IF NOT EXISTS invites(code TEXT PRIMARY KEY, venture TEXT REFERENCES ventures(id) ON DELETE CASCADE, expiry INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, scope TEXT NOT NULL, role TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS messages_timeline ON messages(scope,created);
    CREATE TABLE IF NOT EXISTS voice_sessions(id TEXT PRIMARY KEY, member TEXT NOT NULL REFERENCES members(id), scope TEXT NOT NULL, started INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY, member TEXT REFERENCES members(id), title TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS introductions(id TEXT PRIMARY KEY, sender TEXT REFERENCES members(id), recipient TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL, UNIQUE(sender,recipient));
    CREATE TABLE IF NOT EXISTS memberships(circle TEXT, member TEXT REFERENCES members(id), PRIMARY KEY(circle,member));
    CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY,circle TEXT NOT NULL,member TEXT REFERENCES members(id),body TEXT NOT NULL,created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS circles(id TEXT PRIMARY KEY, host TEXT REFERENCES members(id), name TEXT, topic TEXT, city TEXT, summary TEXT);
    CREATE TABLE IF NOT EXISTS meetings(id TEXT PRIMARY KEY, circle TEXT, title TEXT, start TEXT, place TEXT);
    CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY, circle TEXT, post TEXT, reporter TEXT REFERENCES members(id), reason TEXT, status TEXT);
    CREATE TABLE IF NOT EXISTS blocks(member TEXT REFERENCES members(id), other TEXT REFERENCES members(id), PRIMARY KEY(member,other));
    CREATE TABLE IF NOT EXISTS public_versions(venture TEXT REFERENCES ventures(id), version INTEGER, package TEXT NOT NULL, approved_by TEXT REFERENCES members(id), PRIMARY KEY(venture,version));
    CREATE TABLE IF NOT EXISTS ledger_batches(venture TEXT REFERENCES ventures(id), batch TEXT, PRIMARY KEY(venture,batch));
    CREATE TABLE IF NOT EXISTS agreements(venture TEXT REFERENCES ventures(id),member TEXT REFERENCES members(id),revision INTEGER,PRIMARY KEY(venture,member));
  `);
  return db;
}
type DB = ReturnType<typeof connect>;
export function session(db: DB, token: string) {
  return db
    .prepare("SELECT member FROM sessions WHERE token=? AND expiry>?")
    .get(digest(token), Date.now())?.member as string | undefined;
}
export function issueSession(db: DB, member: string) {
  const token = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
    digest(token),
    member,
    Date.now() + 90 * 86400000,
  );
  return token;
}
export function revoke(db: DB, token: string) {
  db.prepare("DELETE FROM sessions WHERE token=?").run(digest(token));
}
export function hashPassword(
  value: string,
  salt = randomBytes(16).toString("hex"),
) {
  return salt + "." + scryptSync(value, salt, 64).toString("hex");
}
export function validPassword(value: string, stored: string) {
  const test = hashPassword(value, stored.split(".")[0]);
  return timingSafeEqual(Buffer.from(test), Buffer.from(stored));
}
