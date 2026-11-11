import {
  uid,
  addMessage,
  history,
  storeVoiceFragments,
  Problem,
  str,
  type DB,
} from "./store.ts";
import type { createAI } from "./ai.ts";

export const STORY_END = Date.parse("2026-11-18T12:00:00Z");
const SESSION_LIFE = 24 * 60 * 60 * 1000;
const COOKIE = "__Host-second-act-sophie";
const examples = [
  [
    "harry-demand",
    "Test demand before buying stock",
    "When I opened my flower shop, I kept a notebook of things customers asked for that I didn't stock. I tried a small order only after the same request came up several times.",
  ],
  [
    "harry-cash",
    "Plan for slow weeks",
    "I put rent, supplier payment dates and expected receipts on one weekly cash sheet. That helped me see how much I could spend on new stock without running short in a slow week.",
  ],
  [
    "harry-repeat",
    "Make repeat orders easier",
    "I asked regular customers whether they wanted to reserve their usual bouquet a week ahead. Their reservations gave me a better starting point for the next order.",
  ],
];
export function storyAvailable(at = Date.now()) {
  return at < STORY_END;
}
function cookie(token: string, seconds: number) {
  return (
    COOKIE +
    "=" +
    token +
    "; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=" +
    seconds
  );
}
async function digest(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function substantiveExchanges(turns: any[]) {
  let answered = 0,
    pending = false;
  for (const t of turns) {
    if (t.role === "user" && t.text.trim().length >= 6) pending = true;
    else if (t.role === "assistant" && pending && t.text.trim()) {
      answered++;
      pending = false;
    }
  }
  return answered;
}
const mentor = {
  name: "Harry",
  role: "Flower-shop owner for five years",
  why: "Harry has spent five years deciding what to stock and how to keep a small shop’s cash flowing. He could help you design your first pet-care retail test.",
  question:
    "How did you decide which requests were worth turning into a first order?",
};
type Options = {
  nowMs?: number;
  db: DB;
  provider: ReturnType<typeof createAI>;
  limit: (key: string, max: number) => Promise<void>;
  locked: (key: string, fn: () => Promise<any>) => Promise<any>;
};
export async function storyRequest(
  request: Request,
  b: Record<string, any>,
  options: Options,
) {
  const { db, provider, limit, locked } = options;
  const path = new URL(request.url).pathname;
  const at = options.nowMs ?? Date.now();
  if (!storyAvailable(at))
    throw new Problem(410, "Sophie’s temporary story has ended.");
  const token = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)__Host-second-act-sophie=([0-9a-f]{64})(?:;|$)/)?.[1];
  const session = token
    ? await db
        .prepare(
          "SELECT id,expires_ms,introduction FROM sophie_sessions WHERE token_hash=? AND expires_ms>?",
        )
        .get(await digest(token), at)
    : null;
  const scope = session ? "story:" + session.id : "";
  const write = request.method === "POST";
  async function memories() {
    return db
      .prepare(
        "SELECT id,author,title,excerpt FROM sophie_story_memories ORDER BY id",
      )
      .all();
  }
  async function state(id: string, introduction: string | null) {
    const turns = await history(db, "story:" + id);
    const usage = await db
      .prepare("SELECT voice_calls FROM sophie_sessions WHERE id=?")
      .get(id);
    const ready = substantiveExchanges(turns) >= 3;
    return {
      active: true,
      voiceUsed: Number(usage?.voice_calls) > 0,
      persona: "Sophie",
      goal: "Start a pet care store",
      messages: turns,
      memories: await memories(),
      mentor: ready ? mentor : null,
      introduction: ready ? introduction : null,
    };
  }
  if (path === "/api/story/session" && !write)
    return {
      body: session
        ? await state(session.id, session.introduction)
        : { active: false },
    };
  if (!write) throw new Problem(405, "Use a story action.");
  if (path === "/api/story/start") {
    if (session) return { body: await state(session.id, session.introduction) };
    await limit("story:starts", 60);
    const ip = request.headers.get("cf-connecting-ip");
    if (ip)
      await limit(
        "story:visitor:" +
          (await digest(new Date().toISOString().slice(0, 10) + ":" + ip)),
        8,
      );
    const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join(""),
      id = uid(),
      expires = Math.min(STORY_END, at + SESSION_LIFE);
    await db.exec("BEGIN");
    try {
      await db
        .prepare("DELETE FROM sophie_sessions WHERE expires_ms<=?")
        .run(at);
      for (const [ref, title, excerpt] of examples)
        await db
          .prepare(
            "INSERT OR IGNORE INTO sophie_story_memories VALUES(?,?,?,?)",
          )
          .run(ref, "Harry", title, excerpt);
      await db
        .prepare(
          "INSERT INTO sophie_sessions(id,token_hash,expires_ms) VALUES(?,?,?)",
        )
        .run(id, await digest(key), expires);
      await db.exec("COMMIT");
    } catch (e) {
      await db.exec("ROLLBACK");
      throw e;
    }
    return {
      body: await state(id, null),
      cookie: cookie(key, Math.floor((expires - at) / 1000)),
    };
  }
  if (path === "/api/story/exit") {
    if (session)
      await db
        .prepare("DELETE FROM sophie_sessions WHERE id=?")
        .run(session.id);
    return { body: { active: false }, cookie: cookie("", 0) };
  }
  if (!session) throw new Problem(401, "Enter Sophie’s story to continue.");
  const id = String(session.id);
  if (path === "/api/story/voice/captions") {
    const runId = str(b.runId, 90, true);
    if (
      !Array.isArray(b.fragments) ||
      b.fragments.reduce((n, f) => n + String(f?.delta || "").length, 0) > 24000
    )
      throw new Problem(400, "Invalid story caption batch.");
    const run = await db
      .prepare("SELECT started FROM sophie_voice_runs WHERE id=? AND session=?")
      .get(runId, id);
    if (!run || at - run.started > 5 * 60000)
      throw new Problem(404, "This story call has ended.");
    const batch = await db
      .prepare(
        "UPDATE sophie_voice_runs SET batches=batches+1 WHERE id=? AND session=? AND batches<500",
      )
      .run(runId, id);
    if (!batch.changes)
      throw new Problem(429, "This story call has reached its caption limit.");
    await storeVoiceFragments(
      db,
      scope,
      runId,
      Number(run.started),
      b.fragments,
    );
    return {
      body: {
        mentorReady: substantiveExchanges(await history(db, scope)) >= 3,
      },
    };
  }
  if (path === "/api/story/intro") {
    if (substantiveExchanges(await history(db, scope)) < 3)
      throw new Problem(409, "Talk with your guide about the store first.");
    const draft = str(b.message, 1200, true);
    await db
      .prepare("UPDATE sophie_sessions SET introduction=? WHERE id=?")
      .run(draft, id);
    return { body: await state(id, draft) };
  }
  if (path !== "/api/story/chat" && path !== "/api/story/voice")
    throw new Problem(404, "Story action unavailable.");
  const voice = path.endsWith("/voice"),
    message = voice ? "" : str(b.message, 2000, true);
  if (voice) str(b.sdp, 80000, true);
  return {
    body: await locked("story:" + id, async () => {
      await limit(voice ? "story:live" : "story:text", voice ? 3 : 65);
      const col = voice ? "voice_calls" : "text_calls",
        max = voice ? 1 : 12;
      const reserved = await db
        .prepare(
          `UPDATE sophie_sessions SET ${col}=${col}+1 WHERE id=? AND expires_ms>? AND ${col}<?`,
        )
        .run(id, at, max);
      if (!reserved.changes)
        throw new Problem(
          429,
          voice
            ? "This visit includes one live call. You can continue by typing."
            : "You’ve reached the message limit for this story visit.",
        );
      const prior = await history(db, scope),
        notes = await memories(),
        mayIntroduce =
          substantiveExchanges(prior) >= 3 ||
          (!voice &&
            substantiveExchanges(prior) >= 2 &&
            message.trim().length >= 6);
      const context = {
        scope: "Sophie story",
        memberName: "Sophie",
        profile: { goal: "Start a pet care store" },
        story: {
          fictional: true,
          mentor:
            "Harry opened his flower shop five years ago and runs it today.",
          mayIntroduce,
        },
        communityExperiences: notes.map((r, i) => ({
          key: "S" + (i + 1),
          topic: r.title,
          excerpt: r.excerpt,
          author: "Harry",
        })),
      };
      if (voice) {
        const answer = await provider.startVoice(
          context,
          b.sdp,
          prior,
          request.signal,
        );
        const runId = uid();
        await db
          .prepare(
            "INSERT INTO sophie_voice_runs(id,session,started) VALUES(?,?,?)",
          )
          .run(runId, id, at);
        return {
          ...answer,
          runId,
          mentorReady: substantiveExchanges(prior) >= 3,
        };
      }
      const answer = await provider.reply(
        context,
        prior,
        message,
        request.signal,
      );
      const used = new Set(answer.usedExperiences || []);
      const storySources = notes
        .filter((_, i) => used.has("S" + (i + 1)))
        .map((r) => r.id);
      await db.exec("BEGIN");
      try {
        await db
          .prepare(
            "SELECT json(CASE WHEN EXISTS(SELECT 1 FROM sophie_sessions WHERE id=? AND expires_ms>?) THEN 'true' ELSE 'story expired' END)",
          )
          .run(id, at);
        await addMessage(db, scope, "user", { text: message });
        await addMessage(db, scope, "assistant", {
          text: answer.text,
          storySources,
          sources: answer.sources || [],
        });
        await db.exec("COMMIT");
      } catch (e) {
        await db.exec("ROLLBACK");
        throw e;
      }
      return await state(id, session.introduction);
    }),
  };
}
