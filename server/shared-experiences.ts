import { type DB, Problem, uid, str, now, history } from "./store.ts";

const ignore = new Set(
  "am be been being to of on in an as at by if or so why where which who with would will was were it its their then from us me users user founders peers peer community advice have has much any anybody anybody doing tips lessons insights experiences everyone others ask per their by had some there a an the and or is are my our your i me we for with that this from have when what how can could would should tell more other others another anyone someone members member founders founder guide please about these those some shared share experiences experience tried learn learned help advice example examples people first second act next want looking small business trial start new practical plan do does did it has works well doing learn some use need".split(
    " ",
  ),
);
const aliases: Record<string, string> = {
  tickets: "ticket",
  pickups: "pickup",
  garments: "garment",
  pricing: "price",
  prices: "price",
  priced: "price",
  charging: "price",
  charge: "price",
  charges: "price",
  mending: "mend",
  repairs: "repair",
  repairing: "repair",
  alterations: "alteration",
  booking: "book",
  bookings: "book",
  booked: "book",
  reservations: "book",
  deposit: "deposit",
  deposits: "deposit",
  customers: "customer",
  buyers: "customer",
  clients: "customer",
  workshops: "workshop",
  classes: "class",
  sewing: "sew",
  materials: "material",
  selling: "sell",
  preorders: "preorder",
  interviews: "interview",
  surveying: "survey",
};
function tokens(text: string) {
  return [
    ...new Set(
      (
        text
          .normalize("NFKC")
          .toLowerCase()
          .match(/[\p{L}\p{N}]+/gu) || []
      )
        .filter((t) => t.length > 1 && !ignore.has(t))
        .map((t) => aliases[t] || t),
    ),
  ].slice(0, 100);
}
// Projection available to other guides. Never select the member ID, private source, or evidence.
const access = `s.member<>? AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.member=? AND b.other=s.member) OR (b.member=s.member AND b.other=?))`;
export async function ownShares(db: DB, me: string) {
  return db
    .prepare(
      "SELECT id,origin,source_key,title,excerpt,updated FROM shared_experiences WHERE member=? ORDER BY updated DESC",
    )
    .all(me);
}
export async function shareExperience(
  db: DB,
  me: string,
  b: Record<string, any>,
) {
  const origin = str(b.origin, 16, true),
    key = str(b.key, 120, true),
    title = str(b.title, 90, true),
    excerpt = str(b.excerpt, 600, true);
  const source =
    origin === "fact"
      ? await db
          .prepare(
            "SELECT fact AS content FROM guide_memories WHERE member=? AND topic=?",
          )
          .get(me, key)
      : origin === "reference"
        ? await db
            .prepare(
              "SELECT content FROM conversation_memories WHERE member=? AND id=? AND kind='reference' AND state='active' AND source_role='user'",
            )
            .get(me, key)
        : null;
  if (!source)
    throw new Problem(
      404,
      "Choose one of your own remembered facts or member-authored references.",
    );
  if (str(b.original, 1200, true) !== source.content)
    throw new Problem(
      409,
      "This memory changed. Open the current version before sharing it.",
    );
  const titleTerms = new Set(tokens(title));
  const terms = JSON.stringify(
    Object.fromEntries(
      tokens(title + " " + excerpt).map((t) => [t, titleTerms.has(t) ? 3 : 1]),
    ),
  );
  if (terms === "{}")
    throw new Problem(
      400,
      "Include a specific topic so other guides can find this experience.",
    );
  const existing = await db
    .prepare(
      "SELECT id,title,excerpt FROM shared_experiences WHERE member=? AND origin=? AND source_key=?",
    )
    .get(me, origin, key);
  const expectedId = str(b.expectedId, 100);
  if ((existing?.id || "") !== expectedId)
    throw new Problem(
      409,
      "Sharing changed. Reopen the excerpt before editing it.",
    );
  if (existing?.title === title && existing.excerpt === excerpt) return;
  const verified =
    origin === "fact"
      ? "SELECT 1 FROM guide_memories WHERE member=? AND topic=? AND fact=?"
      : "SELECT 1 FROM conversation_memories WHERE member=? AND id=? AND content=? AND kind='reference' AND state='active' AND source_role='user'";
  await db.exec("BEGIN");
  try {
    await db
      .prepare(
        "SELECT json(CASE WHEN coalesce((SELECT id FROM shared_experiences WHERE member=? AND origin=? AND source_key=?),'')=? THEN 'true' ELSE 'sharing changed' END)",
      )
      .run(me, origin, key, expectedId);
    await db
      .prepare(
        `SELECT json(CASE WHEN EXISTS(${verified}) THEN 'true' ELSE 'source changed' END)`,
      )
      .run(me, key, source.content);
    await db
      .prepare(
        "DELETE FROM shared_experiences WHERE member=? AND origin=? AND source_key=?",
      )
      .run(me, origin, key);
    await db
      .prepare("INSERT INTO shared_experiences VALUES(?,?,?,?,?,?,?,?)")
      .run(uid(), me, origin, key, title, excerpt, now(), terms);
    await db.exec("COMMIT");
  } catch (e) {
    await db.exec("ROLLBACK");
    throw e;
  }
}
export async function withdrawExperience(db: DB, me: string, id: string) {
  const r = await db
    .prepare("DELETE FROM shared_experiences WHERE member=? AND id=?")
    .run(me, id);
  if (!r.changes)
    throw new Problem(404, "This shared experience is unavailable.");
}
export async function findExperiences(
  db: DB,
  me: string,
  query: string,
  context = "",
) {
  const input = tokens(query).slice(0, 24),
    list = input.length ? input : tokens(context).slice(0, 16);
  const asksForExamples =
    /\b(other|fellow|another|peers?|community|members)\b/i.test(query) &&
    /\b(experiences?|shared?|learned|doing|examples?|founders?|members|tips|lessons|users)\b/i.test(
      query,
    );
  if (!list.length && !asksForExamples) return [];
  if (!list.length) {
    return db
      .prepare(
        `WITH peers AS (SELECT s.id,s.title,s.excerpt,s.updated,row_number() OVER(PARTITION BY s.member ORDER BY s.updated DESC,s.id) AS pick FROM shared_experiences s WHERE ${access}) SELECT id,title,excerpt,updated FROM peers WHERE pick=1 ORDER BY updated DESC,id LIMIT 3`,
      )
      .all(me, me, me);
  }
  const rows = await db
    .prepare(
      `WITH matches AS (
 SELECT s.id,s.member,s.title,s.excerpt,s.updated,sum(term.value) AS hits FROM shared_experiences s
 JOIN json_each(s.terms) term ON term.key IN (SELECT value FROM json_each(?))
 WHERE ${access} GROUP BY s.id
 ), ranked AS (SELECT *,row_number() OVER(PARTITION BY member ORDER BY hits DESC,updated DESC,id) AS pick FROM matches)
 SELECT id,title,excerpt,updated FROM ranked WHERE pick=1 ORDER BY hits DESC,updated DESC,id LIMIT 3`,
    )
    .all(JSON.stringify(list), me, me, me);
  return rows;
}
export async function visibleExperiences(db: DB, me: string, ids: string[]) {
  if (!ids.length) return [];
  return db
    .prepare(
      `SELECT s.id,s.title,s.excerpt,s.updated FROM shared_experiences s WHERE s.id IN (SELECT value FROM json_each(?)) AND ${access}`,
    )
    .all(JSON.stringify([...new Set(ids)]), me, me, me);
}
export async function requireExperiences(db: DB, me: string, ids: string[]) {
  if (!ids.length) return;
  await db
    .prepare(
      `SELECT json(CASE WHEN count(*)=? THEN 'true' ELSE 'sharing changed' END) FROM shared_experiences s WHERE s.id IN (SELECT value FROM json_each(?)) AND ${access}`,
    )
    .run(ids.length, JSON.stringify(ids), me, me, me);
}
export async function founderMessages(db: DB, me: string, forModel = false) {
  const messages = await history(db, "personal:" + me);
  const runs = [...new Set(messages.map((m) => m.voiceRun).filter(Boolean))];
  const lookups = runs.length
    ? await db
        .prepare(
          "SELECT run,experience FROM voice_experience_lookups WHERE member=? AND run IN (SELECT value FROM json_each(?))",
        )
        .all(me, JSON.stringify(runs))
    : [];
  const allIds = messages
    .flatMap((m) => m.peerSourceIds || [])
    .concat(lookups.map((l) => l.experience));
  const allowed = new Map(
    (await visibleExperiences(db, me, allIds)).map((x) => [x.id, x]),
  );
  const lastReply = new Map();
  messages.forEach((m) => {
    if (m.voiceRun && m.role === "assistant") lastReply.set(m.voiceRun, m.id);
  });
  return messages.flatMap((m) => {
    const ids: string[] = m.peerSourceIds || [];
    if (
      forModel &&
      m.role === "assistant" &&
      (ids.some((id) => !allowed.has(id)) ||
        (m.voiceRun &&
          lookups.some(
            (l) => l.run === m.voiceRun && !allowed.has(l.experience),
          )))
    )
      return [];
    const displayed =
      m.voiceRun && lastReply.get(m.voiceRun) === m.id
        ? lookups.filter((l) => l.run === m.voiceRun).map((l) => l.experience)
        : ids;
    return [
      {
        ...m,
        peerSources: displayed.map((id) => allowed.get(id)).filter(Boolean),
      },
    ];
  });
}
export async function voiceExperiences(
  db: DB,
  me: string,
  run: string,
  query: string,
) {
  const session = await db
    .prepare("SELECT scope,started FROM voice_sessions WHERE id=? AND member=?")
    .get(run, me);
  if (
    !session ||
    session.scope !== "personal:" + me ||
    Date.now() - Number(session.started) > 86400000
  )
    throw new Problem(404, "Founder voice session unavailable.");
  const rows = await findExperiences(db, me, query);
  if (rows.length) {
    await db.exec("BEGIN");
    try {
      await requireExperiences(
        db,
        me,
        rows.map((r) => r.id),
      );
      for (const r of rows)
        await db
          .prepare(
            "INSERT OR IGNORE INTO voice_experience_lookups VALUES(?,?,?)",
          )
          .run(me, run, r.id);
      await db.exec("COMMIT");
    } catch (e) {
      await db.exec("ROLLBACK");
      throw e;
    }
  }
  return rows;
}
