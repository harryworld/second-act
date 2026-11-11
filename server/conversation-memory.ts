import { type DB, Problem, str, now } from "./store.ts";

type Kind = "instruction" | "reference";
export type SourceTurn = {
  id: string;
  role: string;
  text: string;
  created: string;
};
export async function memoryItems(db: DB, member: string) {
  return db
    .prepare(
      "SELECT id,kind,state,content,quote,source_id,source_role,source_date,updated FROM conversation_memories WHERE member=? AND state<>'forgotten' ORDER BY updated DESC,id",
    )
    .all(member);
}
const words = (s: string) =>
  new Set(s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
export function recallItems(items: any[], question: string) {
  const active = items.filter((x) => x.state === "active");
  const query = words(question);
  const rank = (text: string) =>
    [...words(text)].reduce((n, t) => n + (query.has(t) ? 1 : 0), 0);
  return {
    memberInstructions: active
      .filter((x) => x.kind === "instruction")
      .slice(0, 16)
      .map((x) => x.content),
    referenceNotes: active
      .filter((x) => x.kind === "reference")
      .sort((a, b) => rank(b.content) - rank(a.content))
      .slice(0, 10)
      .map((x) => ({
        text: x.content,
        source:
          x.source_role === "assistant"
            ? "prior guide reply"
            : "member statement",
        date: x.source_date.slice(0, 10),
      })),
  };
}
// Group WebRTC fragments before matching text so a search can cross caption boundaries.
// rowid breaks ties when two fragments start on the same millisecond.
function transcriptQuery(memoryOnly = false) {
  return `WITH raw AS (
 SELECT rowid AS seq,id,role,created,json_extract(body,'$.text') AS text,json_extract(body,'$.voiceRun') AS run,
 ${memoryOnly ? "EXISTS(SELECT 1 FROM guide_recall_sources WHERE message=messages.id)" : "1"} AS eligible
 FROM messages WHERE scope=?
), marked AS (
 SELECT *,CASE WHEN run IS NOT NULL AND lag(run) OVER timeline=run AND lag(role) OVER timeline=role THEN 0 ELSE 1 END AS boundary
 FROM raw WINDOW timeline AS (ORDER BY created,seq)
), numbered AS (
 SELECT *,sum(boundary) OVER (ORDER BY created,seq ROWS UNBOUNDED PRECEDING) AS n FROM marked
), turns AS (
 SELECT n,max(CASE WHEN boundary=1 THEN id END) AS id,role,min(created) AS created,run AS voiceRun,max(seq) AS lastSeq,min(eligible) AS canRecall,
 group_concat(text,'' ORDER BY created,seq) AS text FROM numbered GROUP BY n,role,run
)`;
}
const transcript = transcriptQuery();
export async function searchHistory(
  db: DB,
  member: string,
  query: string,
  before: number,
  full = false,
) {
  const rows = await db
    .prepare(
      transcript +
        ` SELECT n,id,role,created,voiceRun,${full ? "text" : "substr(text,1,1000)"} AS text FROM turns
 WHERE n<? AND instr(lower(text),lower(?))>0 ORDER BY n DESC LIMIT 13`,
    )
    .all("personal:" + member, before, query);
  return {
    turns: rows.slice(0, 12),
    next: rows.length > 12 ? rows[11].n : null,
  };
}
export async function sourceTurn(
  db: DB,
  member: string,
  id: string,
): Promise<SourceTurn> {
  const row = await db
    .prepare(
      transcript +
        " SELECT id,role,created,text FROM turns WHERE id=? OR n=(SELECT n FROM numbered WHERE id=?) LIMIT 1",
    )
    .get("personal:" + member, id, id);
  if (!row)
    throw new Problem(404, "This conversation turn is no longer available.");
  return row;
}
export async function storeItem(
  db: DB,
  member: string,
  kind: Kind,
  source: SourceTurn,
  quote: string,
  content: string,
  manual: boolean,
) {
  const bytes = new TextEncoder().encode(
    JSON.stringify([member, kind, source.id, quote]),
  );
  const id = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
  const state = kind === "instruction" && !manual ? "suggested" : "active";
  const collision = manual
    ? "DO UPDATE SET content=excluded.content,state=excluded.state,quote=excluded.quote,updated=excluded.updated"
    : "DO NOTHING";
  await db
    .prepare(
      `INSERT INTO conversation_memories(id,member,kind,state,content,quote,source_id,source_role,source_date,updated)
 VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) ${collision}`,
    )
    .run(
      id,
      member,
      kind,
      state,
      content,
      quote,
      source.id,
      source.role,
      source.created,
      now(),
    );
}
export async function saveFromTurn(
  db: DB,
  member: string,
  data: Record<string, any>,
) {
  if (!["reference", "instruction"].includes(data.kind))
    throw new Problem(400, "Choose a memory type.");
  const source = await sourceTurn(db, member, str(data.sourceId, 260, true));
  const quote = str(data.quote, 1400, true);
  if (!source.text.includes(quote))
    throw new Problem(
      400,
      "Select an exact passage from this conversation turn.",
    );
  await storeItem(
    db,
    member,
    data.kind,
    source,
    quote,
    str(data.content, 1200, true),
    true,
  );
}
export async function changeItem(
  db: DB,
  member: string,
  id: string,
  action: string,
  value: unknown,
) {
  if (action === "forget") {
    const item = await db
      .prepare(
        "SELECT source_id FROM conversation_memories WHERE member=? AND id=? AND state<>'forgotten'",
      )
      .get(member, id);
    if (item) await forgetRecall(db, member, String(item.source_id), "");
    const r = await db
      .prepare(
        "UPDATE conversation_memories SET state='forgotten',content='',quote='',updated=? WHERE member=? AND id=? AND state<>'forgotten'",
      )
      .run(now(), member, id);
    if (!r.changes) throw new Problem(404, "Memory unavailable.");
    return;
  }
  if (action !== "use" && action !== "edit")
    throw new Problem(400, "Choose a memory action.");
  const r = await db
    .prepare(
      "UPDATE conversation_memories SET content=?,state='active',updated=? WHERE member=? AND id=? AND state<>'forgotten'",
    )
    .run(str(value, 1200, true), now(), member, id);
  if (!r.changes) throw new Problem(404, "Memory unavailable.");
}
export function groupSources(rows: any[]): SourceTurn[] {
  const turns = [];
  let lastRun = null,
    previousAssistant = null;
  for (const r of [...rows].sort(
    (a, b) =>
      String(a.created).localeCompare(String(b.created)) ||
      Number(a.rowid) - Number(b.rowid),
  )) {
    const m = JSON.parse(String(r.body));
    if (
      m.voiceRun &&
      lastRun === m.voiceRun &&
      previousAssistant === r.previous_assistant
    )
      turns.at(-1).text += m.text;
    else
      turns.push({
        id: String(r.id),
        role: "user",
        created: String(r.created),
        text: m.text,
      });
    lastRun = m.voiceRun;
    previousAssistant = r.previous_assistant;
  }
  return turns;
}

export async function recallPassages(db: DB, member: string, question: string) {
  const stop = new Set(
    "about after again could from have before last please should that the this what when with would your earlier remember conversation told discussed".split(
      " ",
    ),
  );
  const terms = [...words(question)].filter((t) => !stop.has(t)).slice(0, 14);
  const scope = "personal:" + member;
  // Include prior conversations and older turns beyond the active chat's recent context.
  const eligible = transcriptQuery(true);
  const rows = await db
    .prepare(
      eligible +
        `, ranked AS (
 SELECT role,created,text,n,(SELECT count(*) FROM json_each(?) t WHERE instr(lower(text),t.value)>0) AS score FROM turns WHERE canRecall=1 AND (lastSeq<=coalesce((SELECT last_row FROM founder_chat_boundaries WHERE member=?),0) OR n<=(SELECT max(n)-10 FROM turns))
 AND NOT EXISTS (SELECT 1 FROM conversation_memories c WHERE c.member=? AND c.kind='instruction' AND c.state='suggested' AND c.source_id IN (SELECT id FROM numbered WHERE numbered.n=turns.n)))
 SELECT role,created,substr(text,1,850) AS passage FROM ranked WHERE score>0 OR ?=1 ORDER BY score DESC,n DESC LIMIT 3`,
    )
    .all(
      scope,
      JSON.stringify(terms),
      member,
      member,
      Number(
        !question ||
          /last time|previous conversation|earlier conversation/i.test(
            question,
          ),
      ),
    );
  return rows.map((r) => ({
    speaker: r.role === "user" ? "member" : "guide",
    date: String(r.created).slice(0, 10),
    passage: r.passage,
  }));
}
export async function forgetRecall(
  db: DB,
  member: string,
  sourceId: string,
  evidence: string,
) {
  if (!sourceId && !evidence) return;
  const condition = sourceId
    ? "n IN (SELECT n FROM numbered WHERE id=?)"
    : "n IN (SELECT n FROM turns WHERE instr(lower(text),lower(?))>0)";
  await db
    .prepare(
      transcript +
        ` DELETE FROM guide_recall_sources WHERE message IN (SELECT id FROM numbered WHERE ${condition})`,
    )
    .run("personal:" + member, sourceId || evidence);
}
