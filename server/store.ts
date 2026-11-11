import type { Database as DB } from "./database.ts";
export type { Database as DB } from "./database.ts";
import { templates } from "../public/catalog.js";
export class Problem extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export function str(value: unknown, max = 800, required = false): string {
  if (value == null) value = "";
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new Problem(400, "Check the text and try again.");
  return value.trim();
}
export function number(value: unknown, max: number, integer = false): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new Problem(400, "Enter a number within the allowed range.");
  return value;
}
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export type Profile = {
  name: string;
  skills: string;
  city: string;
  days: string;
  goal: string;
  listed: boolean;
};
export const freshProfile = (): Profile => ({
  name: "",
  skills: "",
  city: "",
  days: "",
  goal: "",
  listed: false,
});
export async function profile(db: DB, id: string): Promise<Profile> {
  const row = await db
    .prepare("SELECT profile FROM members WHERE id=?")
    .get(id);
  if (!row) throw new Problem(404, "Member unavailable.");
  return JSON.parse(String(row.profile));
}
const originalData = Symbol("stored venture");
export async function venture(db: DB, member: string, id: string) {
  const row = await db
    .prepare(
      "SELECT v.* FROM ventures v JOIN team t ON t.venture=v.id WHERE v.id=? AND t.member=?",
    )
    .get(id, member);
  if (!row)
    throw new Problem(404, "This venture is unavailable in your workspace.");
  return {
    ...JSON.parse(String(row.data)),
    id: row.id,
    owner: row.owner,
    [originalData]: row.data,
  };
}
export async function saveVenture(db: DB, v: any) {
  const { id, owner, ...data } = v;
  await db.requireChange({
    sql: "UPDATE ventures SET data=? WHERE id=? AND data=?",
    args: [JSON.stringify(data), id, v[originalData]],
  });
}
export async function newVenture(
  db: DB,
  member: string,
  id: string,
  title: string,
  question: string,
) {
  const t = templates.find((t) => t.id === id) ?? templates[0],
    vid = uid();
  const model = Object.fromEntries(
    ["price", "materials", "hours", "wage", "fixed", "units"].map((k) => [
      k,
      t[k],
    ]),
  );
  const data = {
    title: title || t.title,
    question: question || t.question,
    template: t.id,
    status: "Planning",
    model,
    budget: 50,
    deadline: "",
    evidence: "",
    agreement: "",
    revision: 0,
    publicDraft: null,
    entries: [],
    tasks: t.steps.map((text) => ({ id: uid(), text, done: false })),
    created: now(),
  };
  await db.exec("BEGIN");
  try {
    await db
      .prepare("INSERT INTO ventures VALUES(?,?,?)")
      .run(vid, member, JSON.stringify(data));
    await db.prepare("INSERT INTO team VALUES(?,?)").run(vid, member);
    await db.exec("COMMIT");
  } catch (e) {
    await db.exec("ROLLBACK");
    throw e;
  }
  return vid;
}
export async function history(db: DB, scope: string) {
  // A Live caption is a timestamped fragment; the UI and both models consume turns.
  // Walk backwards so the limit applies to turns, even during a long spoken answer.
  const turns: any[] = [];
  let before = "9999",
    lastRow = Number.MAX_SAFE_INTEGER;
  page: while (true) {
    const rows = await db
      .prepare(
        "SELECT rowid,id,role,body,created FROM messages WHERE scope=? AND (created,rowid)<(?,?) ORDER BY created DESC,rowid DESC LIMIT 256",
      )
      .all(scope, before, lastRow);
    for (const row of rows) {
      const body = JSON.parse(String(row.body));
      const last = turns.at(-1);
      if (
        body.voiceRun &&
        last?.voiceRun === body.voiceRun &&
        last.role === row.role
      ) {
        last.parts.push(body.text);
        last.id = row.id;
        last.created = row.created;
      } else {
        if (turns.length === 60) break page;
        turns.push({
          id: row.id,
          role: row.role,
          created: row.created,
          ...body,
          parts: [body.text],
        });
      }
    }
    if (rows.length < 256) break;
    before = String(rows.at(-1).created);
    lastRow = Number(rows.at(-1).rowid);
  }
  return turns
    .reverse()
    .map(({ parts, ...turn }) => ({ ...turn, text: parts.reverse().join("") }));
}
export async function recordVoice(
  db: DB,
  member: string,
  runId: string,
  fragments: any[],
) {
  const run = await db
    .prepare("SELECT scope,started FROM voice_sessions WHERE id=? AND member=?")
    .get(runId, member);
  if (!run || Date.now() - Number(run.started) > 86400000)
    throw new Problem(404, "This voice session is unavailable.");
  const scope = String(run.scope);
  if (scope.startsWith("venture:")) await venture(db, member, scope.slice(8));
  if (!Array.isArray(fragments) || !fragments.length || fragments.length > 64)
    throw new Problem(400, "Invalid caption batch.");
  const insert = db.prepare(
    "INSERT INTO messages VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
  );
  await db.exec("BEGIN");
  try {
    for (const f of fragments) {
      if (
        !f ||
        !["user", "assistant"].includes(f.role) ||
        typeof f.delta !== "string" ||
        !f.delta.length ||
        f.delta.length > 16000
      )
        throw new Problem(400, "Invalid voice caption.");
      const key = str(f.id, 160, true);
      const start = number(f.start, 86400000);
      const end = number(f.end, 86400000);
      if (end < start) throw new Problem(400, "Invalid caption timing.");
      const body = { text: f.delta, voiceRun: runId, endMs: end };
      await insert.run(
        runId + ":" + key,
        scope,
        f.role,
        JSON.stringify(body),
        new Date(Number(run.started) + start).toISOString(),
      );
    }
    await db.exec("COMMIT");
  } catch (e) {
    await db.exec("ROLLBACK");
    throw e;
  }
}
export async function addMessage(
  db: DB,
  scope: string,
  role: string,
  body: object,
) {
  await db
    .prepare("INSERT INTO messages VALUES(?,?,?,?,?)")
    .run(uid(), scope, role, JSON.stringify(body), now());
}
export function economics(m: any) {
  const gross = Math.round(m.price * 100),
    cost = Math.round(m.materials * 100),
    labor = Math.round(m.hours * m.wage * 100);
  const contribution = gross - cost - labor,
    fixed = Math.round(m.fixed * 100);
  return {
    labor: labor / 100,
    contribution: contribution / 100,
    result: (contribution * m.units - fixed) / 100,
    breakEven: contribution > 0 ? Math.ceil(fixed / contribution) : null,
  };
}
