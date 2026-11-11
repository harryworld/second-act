// A guide's private memory and its public outreach have separate inputs and storage.
import { type DB, type Profile, profile, Problem, now, uid } from "./store.ts";
import type { rememberFacts, writeGuideMessage } from "./ai.ts";
export const topics = [
  "preferred name",
  "location",
  "role",
  "experience",
  "interests",
  "goal",
  "availability",
  "working style",
  "learning",
  "work constraints",
] as const;
export async function settings(db: DB, member: string) {
  const r = await db
    .prepare("SELECT * FROM guide_settings WHERE member=?")
    .get(member);
  return {
    memory: r ? !!r.memory : true,
    outreach: !!r?.outreach,
    generation: Number(r?.generation || 0),
  };
}
export async function memories(db: DB, member: string) {
  return await db
    .prepare(
      "SELECT topic,fact,evidence,updated FROM guide_memories WHERE member=? ORDER BY updated DESC,topic",
    )
    .all(member);
}
export async function resetInbox(db: DB, member: string) {
  await db
    .prepare(
      "INSERT INTO guide_settings(member,generation) VALUES(?,1) ON CONFLICT(member) DO UPDATE SET generation=generation+1",
    )
    .run(member);
  await db.prepare("DELETE FROM memory_work WHERE member=?").run(member);
  await db.prepare("DELETE FROM memory_inbox WHERE member=?").run(member);
}
export async function changeSettings(
  db: DB,
  member: string,
  memory: boolean,
  outreach: boolean,
) {
  if (outreach && !(await profile(db, member)).listed)
    throw new Problem(
      400,
      "List your profile before enabling guide introductions.",
    );
  if (!memory) await resetInbox(db, member);
  await db
    .prepare(
      "INSERT INTO guide_settings(member,memory,outreach) VALUES(?,?,?) ON CONFLICT(member) DO UPDATE SET memory=excluded.memory,outreach=excluded.outreach",
    )
    .run(member, Number(memory), Number(outreach));
  await reconcile(db, member);
}
export async function forget(db: DB, member: string, topic: string) {
  await resetInbox(db, member);
  await db
    .prepare("DELETE FROM guide_memories WHERE member=? AND topic=?")
    .run(member, topic);
}
function shareable(p: Profile) {
  return {
    name: p.name,
    skills: p.skills,
    goal: p.goal,
    city: p.city,
    days: p.days,
  };
}
async function pair(db: DB, a: string, b: string) {
  const pa = await profile(db, a),
    pb = await profile(db, b);
  if (
    !pa.listed ||
    !pb.listed ||
    !(await settings(db, a)).outreach ||
    !(await settings(db, b)).outreach
  )
    return null;
  if (
    await db
      .prepare(
        "SELECT 1 FROM blocks WHERE (member=? AND other=?) OR (member=? AND other=?)",
      )
      .get(a, b, b, a)
  )
    return null;
  const left = shareable(pa),
    right = shareable(pb);
  return {
    left,
    right,
    fingerprint: Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify([left, right])),
        ),
      ),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join(""),
  };
}
export async function reconcile(db: DB, member: string) {
  // Clear stale proposals immediately, including a conversation still awaiting its second reply.
  if (!(await profile(db, member)).listed)
    await db
      .prepare("UPDATE guide_settings SET outreach=0 WHERE member=?")
      .run(member);
  for (const row of await db
    .prepare("SELECT * FROM guide_exchanges WHERE a=? OR b=?")
    .all(member, member)) {
    if (
      (await pair(db, String(row.a), String(row.b)))?.fingerprint !==
      row.fingerprint
    )
      await db.prepare("DELETE FROM guide_exchanges WHERE id=?").run(row.id);
  }
  if (!(await settings(db, member)).outreach) return;
  const p = await profile(db, member);
  const candidates = await db
    .prepare(
      `SELECT m.id,m.profile FROM members m JOIN guide_settings g ON g.member=m.id WHERE m.id<>? AND g.outreach=1 AND json_extract(m.profile,'$.listed')=1
    AND NOT EXISTS (SELECT 1 FROM blocks WHERE (member=? AND other=m.id) OR (member=m.id AND other=?))
    ORDER BY m.rowid`,
    )
    .all(member, member, member);
  // Private alignment selects whom to approach locally. The exchange itself sees only listed fields.
  const words = (value: string) =>
    new Set(value.toLowerCase().match(/[a-z]{3,}/g) || []);
  const privateFacts = (await settings(db, member)).memory
    ? (await memories(db, member)).map((m) => m.fact).join(" ")
    : "";
  const interests = words([p.goal, p.skills, p.days, privateFacts].join(" "));
  const ignore = new Set([
    "the",
    "and",
    "with",
    "from",
    "work",
    "would",
    "want",
    "like",
    "have",
    "that",
    "for",
    "member",
    "their",
  ]);
  const ranked = candidates
    .map((c) => {
      const other = JSON.parse(String(c.profile));
      const tokens = words([other.skills, other.goal, other.days].join(" "));
      const overlap = [...tokens].filter(
        (t) => interests.has(t) && !ignore.has(t),
      ).length;
      const local =
        p.city && other.city.toLowerCase() === p.city.toLowerCase() ? 2 : 0;
      return { id: c.id, score: overlap + local };
    })
    .sort((a, b) => b.score - a.score);
  for (const candidate of ranked.slice(0, 3)) {
    const [a, b] = [member, String(candidate.id)].sort();
    const context = await pair(db, a, b);
    if (context)
      await db
        .prepare(
          "INSERT OR IGNORE INTO guide_exchanges(id,a,b,fingerprint,status,due) VALUES(?,?,?,?,'pending',?)",
        )
        .run(uid(), a, b, context.fingerprint, Date.now());
  }
}
export async function guideState(db: DB, member: string) {
  const pref = await settings(db, member);
  const exchanges = await Promise.all(
    (
      await db
        .prepare(
          "SELECT id,a,b,status,pitch,response,attempts FROM guide_exchanges WHERE a=? OR b=? ORDER BY rowid DESC",
        )
        .all(member, member)
    ).map(async (row) => {
      const peer = String(row.a === member ? row.b : row.a);
      return {
        id: row.id,
        peer,
        name: (await profile(db, peer)).name,
        first: row.a === member,
        status: row.status,
        pitch: row.pitch ? JSON.parse(String(row.pitch)) : null,
        response: row.response ? JSON.parse(String(row.response)) : null,
      };
    }),
  );
  const work = await db
    .prepare("SELECT attempts FROM memory_work WHERE member=?")
    .get(member);
  const brief = await db
    .prepare("SELECT revision,brief FROM profile_briefs WHERE member=?")
    .get(member);
  return {
    brief: {
      revision: Number(brief?.revision || 0),
      text: pref.memory ? brief?.brief || null : null,
    },
    memoryEnabled: pref.memory,
    outreach: pref.outreach,
    memories: await memories(db, member),
    memoryStatus: !work
      ? "idle"
      : Number(work.attempts) >= 3
        ? "failed"
        : "pending",
    exchanges,
  };
}
export async function retryGuides(db: DB, member: string) {
  await db
    .prepare(
      "UPDATE memory_work SET due=?,attempts=0 WHERE member=? AND attempts>=3",
    )
    .run(Date.now(), member);
  await db
    .prepare(
      "UPDATE guide_exchanges SET status='pending',due=?,attempts=0 WHERE (a=? OR b=?) AND status='failed'",
    )
    .run(Date.now(), member, member);
}
type Providers = {
  memory: typeof rememberFacts;
  discuss: typeof writeGuideMessage;
};
export async function processMemory(
  db: DB,
  providers: Providers,
  admit: (id: string) => void = () => {},
) {
  const job = await db
    .prepare(
      "SELECT member,attempts FROM memory_work WHERE due<=? AND attempts<3 ORDER BY due LIMIT 1",
    )
    .get(Date.now());
  if (!job) return;
  const me = String(job.member),
    pref = await settings(db, me);
  const pendingRows = await db
    .prepare(
      `SELECT i.seq,m.body,m.created,m.rowid FROM memory_inbox i JOIN messages m ON m.id=i.message WHERE i.member=? ORDER BY i.seq LIMIT 200`,
    )
    .all(me);
  const rows = [];
  let chars = 0;
  for (const row of pendingRows) {
    const size = JSON.parse(String(row.body)).text.length + 1;
    if (rows.length && chars + size > 24000) break;
    rows.push(row);
    chars += size;
  }
  if (!rows.length || !pref.memory) {
    await resetInbox(db, me);
    return;
  }
  const source = rows
    .slice()
    .sort(
      (a, b) =>
        String(a.created).localeCompare(String(b.created)) ||
        Number(a.rowid) - Number(b.rowid),
    )
    .reduce(
      (state, r) => {
        const m = JSON.parse(String(r.body));
        state.text +=
          (m.voiceRun && state.run === m.voiceRun ? "" : "\n") + m.text;
        state.run = m.voiceRun;
        return state;
      },
      { text: "", run: null },
    ).text;
  const limit = rows.at(-1)!.seq;
  try {
    await admit(me);
    const changes = await providers.memory(
      await memories(db, me),
      source,
      topics,
    );
    if ((await settings(db, me)).generation !== pref.generation) return;
    await db.exec("BEGIN");
    try {
      await db
        .prepare(
          "SELECT json(CASE WHEN coalesce((SELECT generation FROM guide_settings WHERE member=?),0)=? THEN 'true' ELSE 'write conflict' END)",
        )
        .run(me, pref.generation);
      const upsert = db.prepare(
        "INSERT INTO guide_memories VALUES(?,?,?,?,?) ON CONFLICT(member,topic) DO UPDATE SET fact=excluded.fact,evidence=excluded.evidence,updated=excluded.updated",
      );
      const normalize = (x: string) =>
        x.toLowerCase().replace(/\s+/gu, " ").trim();
      for (const c of changes) {
        if (
          topics.includes(c.topic) &&
          typeof c.fact === "string" &&
          typeof c.evidence === "string" &&
          c.fact.trim() &&
          c.fact.length <= 600 &&
          c.evidence.trim() &&
          normalize(source).includes(normalize(c.evidence))
        )
          await upsert.run(
            me,
            c.topic,
            c.fact,
            c.evidence.slice(0, 400),
            now(),
          );
      }
      await db
        .prepare("DELETE FROM memory_inbox WHERE member=? AND seq<=?")
        .run(me, limit);
      await db
        .prepare(
          "DELETE FROM memory_work WHERE member=? AND NOT EXISTS(SELECT 1 FROM memory_inbox WHERE member=?)",
        )
        .run(me, me);
      await db.exec("COMMIT");
    } catch (e) {
      await db.exec("ROLLBACK");
      throw e;
    }
    if (changes.length && pref.outreach) await reconcile(db, me);
  } catch {
    if ((await settings(db, me)).generation === pref.generation)
      await db
        .prepare(
          "UPDATE memory_work SET due=?, attempts=attempts+1 WHERE member=?",
        )
        .run(Date.now() + 60000 * (Number(job.attempts) + 1), me);
  }
}
export async function processExchange(
  db: DB,
  providers: Providers,
  admit: (id: string) => void = () => {},
) {
  const x = await db
    .prepare(
      "SELECT * FROM guide_exchanges WHERE status='pending' AND due<=? ORDER BY due LIMIT 1",
    )
    .get(Date.now());
  if (!x) return;
  const a = String(x.a),
    b = String(x.b);
  const data = await pair(db, a, b);
  if (!data || data.fingerprint !== x.fingerprint) {
    await db.prepare("DELETE FROM guide_exchanges WHERE id=?").run(x.id);
    return;
  }
  try {
    const responding = !!x.pitch;
    await admit(responding ? b : a);
    const msg = await providers.discuss(
      responding ? data.right : data.left,
      responding ? data.left : data.right,
      responding ? JSON.parse(String(x.pitch)) : null,
    );
    // IDs change on revocation or edits; an outdated in-flight reply cannot resurrect an exchange.
    if (responding)
      await db
        .prepare(
          "UPDATE guide_exchanges SET response=?,status='ready',attempts=0 WHERE id=?",
        )
        .run(JSON.stringify(msg), x.id);
    else
      await db
        .prepare(
          "UPDATE guide_exchanges SET pitch=?,attempts=0,due=? WHERE id=?",
        )
        .run(JSON.stringify(msg), Date.now(), x.id);
  } catch {
    await db
      .prepare(
        "UPDATE guide_exchanges SET attempts=attempts+1,status=CASE WHEN attempts>=2 THEN 'failed' ELSE 'pending' END,due=? WHERE id=?",
      )
      .run(Date.now() + 60000 * (Number(x.attempts) + 1), x.id);
  }
}
