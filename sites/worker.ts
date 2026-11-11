import { chatGPTAccount } from "./account.ts";
import type { D1Database, ExecutionContext } from "@cloudflare/workers-types";
import assets from "site:assets";
import { application } from "../server/application.ts";
import { connection, WriteConflict } from "../server/database.ts";
import { createAI } from "../server/ai.ts";
import { freshProfile, Problem } from "../server/store.ts";
import { processMemory, processExchange } from "../server/guides.ts";

type Bindings = { DB: D1Database; OPENAI_API_KEY?: string };
function database(binding: D1Database) {
  const session = binding.withSession("first-primary");
  const statement = ({ sql, args }) => session.prepare(sql).bind(...args);
  return connection({
    first: (q) => statement(q).first(),
    rows: async (q) => (await statement(q).all()).results,
    run: async (q) => ({ changes: (await statement(q).run()).meta.changes }),
    batch: (qs) => session.batch(qs.map(statement)),
  });
}
const sec = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'",
};
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { ...sec, "Cache-Control": "no-store" },
  });
async function input(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    throw new Problem(415, "Send JSON to this endpoint.");
  const reader = request.body?.getReader();
  if (!reader) throw new Problem(400, "Missing request.");
  const decoder = new TextDecoder();
  let body = "",
    size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 1650000) {
      await reader.cancel();
      throw new Problem(413, "Use a file under 1 MB.");
    }
    body += decoder.decode(value, { stream: true });
  }
  try {
    const result = JSON.parse(body + decoder.decode());
    if (!result || Array.isArray(result) || typeof result !== "object")
      throw Error();
    return result;
  } catch {
    throw new Problem(400, "Invalid request.");
  }
}
async function admit(db: D1Database, key: string, max: number) {
  const bucket = Math.floor(Date.now() / 3600000);
  const r = await db
    .prepare(
      "INSERT INTO host_limits(key,bucket,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET bucket=excluded.bucket,count=CASE WHEN host_limits.bucket=excluded.bucket THEN host_limits.count+1 ELSE 1 END RETURNING count",
    )
    .bind(key, bucket)
    .first<{ count: number }>();
  if (!r || r.count > max)
    throw new Problem(429, "Please wait before making another guide request.");
}
async function withLease(
  db: D1Database,
  name: string,
  run: () => Promise<unknown>,
  background = false,
) {
  const token = crypto.randomUUID(),
    now = Date.now();
  const lease = await db
    .prepare(
      "INSERT INTO host_jobs VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET token=excluded.token,until_ms=excluded.until_ms WHERE host_jobs.until_ms<=? RETURNING token",
    )
    .bind(name, token, now + 115000, now)
    .first();
  if (!lease) {
    if (background) return;
    throw new Problem(409, "A request is already in progress here.");
  }
  try {
    return await run();
  } finally {
    await db
      .prepare("DELETE FROM host_jobs WHERE name=? AND token=?")
      .bind(name, token)
      .run();
  }
}
async function runBackground(env: Bindings, delay: boolean) {
  if (!env.OPENAI_API_KEY) return;
  if (delay) await new Promise((r) => setTimeout(r, 2300));
  const ai = createAI(() => env.OPENAI_API_KEY);
  const providers = { memory: ai.rememberFacts, discuss: ai.writeGuideMessage };
  const budget = async (member: string) => {
    await admit(env.DB, "background:" + member, 30);
    await admit(env.DB, "ai:server", 150);
  };
  await Promise.all(
    [
      ["memory", "memory_work", processMemory],
      ["connections", "guide_exchanges", processExchange],
    ].map(async ([name, table, work]) => {
      const sql =
        table === "memory_work"
          ? "SELECT 1 FROM memory_work WHERE due<=? AND attempts<3 LIMIT 1"
          : "SELECT 1 FROM guide_exchanges WHERE status='pending' AND due<=? LIMIT 1";
      if (!(await env.DB.prepare(sql).bind(Date.now()).first())) return;
      await withLease(
        env.DB,
        "worker:" + name,
        async () => {
          const db = database(env.DB);
          for (let i = 0; i < 3; i++) {
            if (!(await env.DB.prepare(sql).bind(Date.now()).first())) break;
            await work(db, providers, budget);
          }
        },
        true,
      );
    }),
  );
}
export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    const url = new URL(request.url);
    try {
      if (!url.pathname.startsWith("/api/")) {
        if (request.method !== "GET" && request.method !== "HEAD")
          throw new Problem(405, "Method not allowed.");
        const asset =
          assets[url.pathname === "/" ? "/index.html" : url.pathname];
        if (!asset) throw new Problem(404, "File unavailable.");
        const headers = {
          ...sec,
          "Content-Type": asset.mime,
          "Cache-Control": "private, no-cache",
          ETag: asset.etag,
        };
        if (request.headers.get("if-none-match") === asset.etag)
          return new Response(null, { status: 304, headers });
        return new Response(
          request.method === "HEAD"
            ? null
            : Uint8Array.from(atob(asset.base64), (c) => c.charCodeAt(0)),
          { headers },
        );
      }
      const identity = chatGPTAccount(request.headers);
      if (!identity)
        throw new Problem(
          401,
          "Sign in to this Site with ChatGPT to open your workspace.",
        );
      const member = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(identity.id),
          ),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      const write = request.method === "POST";
      if (!write && request.method !== "GET")
        throw new Problem(405, "Method not allowed.");
      if (write && request.headers.get("origin") !== url.origin)
        throw new Problem(403, "Reopen the Site and try again.");
      const data = write ? await input(request) : {};
      if (url.pathname === "/api/open" && write) {
        await env.DB.prepare(
          "INSERT OR IGNORE INTO members(id,profile) VALUES(?,?)",
        )
          .bind(member, JSON.stringify(freshProfile()))
          .run();
      }
      const provider = createAI(() => env.OPENAI_API_KEY);
      const aiWork = async (me, scope, fn) =>
        withLease(env.DB, "ai:" + scope, async () => {
          await admit(env.DB, "ai:" + me, 40);
          await admit(env.DB, "ai:server", 150);
          return fn();
        });
      const { body, status } = await application(
        database(env.DB),
        true,
        provider,
        aiWork,
        identity.details,
      )(member, url, write, data, request.signal);
      if (
        [
          "/api/open",
          "/api/chat",
          "/api/voice/captions",
          "/api/guide",
          "/api/guide/settings",
          "/api/guide/retry",
          "/api/profile",
        ].includes(url.pathname)
      ) {
        ctx.waitUntil(
          runBackground(
            env,
            write &&
              (url.pathname === "/api/chat" ||
                url.pathname === "/api/voice/captions"),
          ).catch(() =>
            console.warn("Background work will resume on the next visit."),
          ),
        );
      }
      return json(body, status);
    } catch (error) {
      if (error instanceof Problem)
        return json({ error: error.message }, error.status);
      if (
        error instanceof WriteConflict ||
        /malformed JSON|UNIQUE constraint failed/.test(String(error))
      )
        return json(
          { error: "The workspace changed. Reopen it and try again." },
          409,
        );
      console.error("Worker request failed", url.pathname, error?.name);
      return json(
        { error: "The workspace could not finish that operation." },
        500,
      );
    }
  },
};
