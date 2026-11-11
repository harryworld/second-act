import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, dirname, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { Problem, str, uid, freshProfile } from "./store.ts";
import {
  connect,
  session,
  issueSession,
  revoke,
  validPassword,
  hashPassword,
} from "./local-database.ts";
import { database } from "./local-driver.ts";
import { createAI } from "./ai.ts";
import { application } from "./application.ts";
import { installGuides, startGuides } from "./local-guides.ts";
const provider = createAI(() => process.env.OPENAI_API_KEY);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = resolve(root, "public");
const localPreview = process.env.SECOND_ACT_LOCAL_PREVIEW === "1";
const db = localPreview
  ? connect(
      process.env.SECOND_ACT_DB || resolve(root, ".data/workbench.sqlite"),
    )
  : null;
if (db) installGuides(db);
const port = Number(process.env.PORT || 4317);
const hosts = new Set(["127.0.0.1:" + port, "localhost:" + port]);
const mime = {
  ".js": "text/javascript",
  ".html": "text/html",
  ".css": "text/css",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};
const rate = new Map<string, { n: number; until: number }>();
function limit(key: string, max: number, interval: number) {
  const entry = rate.get(key);
  if (!entry || entry.until < Date.now()) {
    rate.set(key, { n: 1, until: Date.now() + interval });
    return;
  }
  if (++entry.n > max)
    throw new Problem(429, "Please wait a little before trying again.");
}
setInterval(() => {
  for (const [key, v] of rate) if (v.until < Date.now()) rate.delete(key);
}, 60000).unref();
const busy = new Set<string>();
async function aiWork(member: string, scope: string, fn: () => Promise<any>) {
  if (busy.has(scope))
    throw new Problem(409, "A request is already in progress here.");
  limit("ai:" + member, 40, 3600000);
  limit("ai:server", 150, 3600000);
  busy.add(scope);
  try {
    return await fn();
  } finally {
    busy.delete(scope);
  }
}
async function input(req: http.IncomingMessage) {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json")
    throw new Problem(415, "Send JSON to this endpoint.");
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 1650000)
      throw new Problem(
        413,
        "The attachment is too large. Use a file under 1 MB.",
      );
    chunks.push(chunk);
  }
  try {
    const b = JSON.parse(Buffer.concat(chunks).toString());
    if (!b || Array.isArray(b) || typeof b !== "object") throw Error();
    return b;
  } catch {
    throw new Problem(400, "Invalid request.");
  }
}
function setSession(res: http.ServerResponse, id: string) {
  res.setHeader(
    "Set-Cookie",
    "sa_session=" +
      issueSession(db, id) +
      "; HttpOnly; SameSite=Strict; Path=/; Max-Age=7776000",
  );
}
function json(res: http.ServerResponse, value: any, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || "";
    if (!hosts.has(host))
      throw new Problem(403, "Use the local workspace address.");
    if (!db) {
      if (req.url?.startsWith("/api/"))
        return json(
          res,
          { error: "Sign in with ChatGPT on the Second Act Site." },
          401,
        );
      res.writeHead(302, {
        Location: "https://second-act-workbench.harryworld.chatgpt.site/",
        "Cache-Control": "no-store",
      });
      res.end();
      return;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    const url = new URL(req.url || "/", "http://" + host);
    const path = url.pathname;
    if (!path.startsWith("/api/")) {
      if (req.method !== "GET" && req.method !== "HEAD")
        throw new Problem(405, "Method not allowed.");
      const file = resolve(
        publicDir,
        "." + (path === "/" ? "/index.html" : decodeURIComponent(path)),
      );
      if (!file.startsWith(publicDir + sep) || !mime[extname(file)])
        throw new Problem(404, "File unavailable.");
      const data = await readFile(file).catch(() => {
        throw new Problem(404, "File unavailable.");
      });
      res.writeHead(200, {
        "Content-Type": mime[extname(file)],
        "Cache-Control": "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : data);
      return;
    }
    const write = req.method === "POST";
    if (!write && req.method !== "GET")
      throw new Problem(405, "Method not allowed.");
    if (write && req.headers.origin !== "http://" + host)
      throw new Problem(403, "Please reopen the workspace and try again.");
    const token =
      req.headers.cookie?.match(/(?:^|;\s*)sa_session=([A-Za-z0-9_-]+)/)?.[1] ||
      "";
    let member = session(db, token);
    const b = write ? await input(req) : {};
    if (path === "/api/open" && write) {
      if (!member) {
        limit("guests", 60, 60000);
        member = uid();
        db.prepare("INSERT INTO members(id,profile) VALUES(?,?)").run(
          member,
          JSON.stringify(freshProfile()),
        );
        setSession(res, member);
      }
      return json(
        res,
        (
          await application(database(db), false, provider, aiWork)(
            member,
            url,
            write,
            b,
            new AbortController().signal,
          )
        ).body,
      );
    }
    if (!member) throw new Problem(401, "Reopen your workspace to continue.");
    const me = member;
    if (path === "/api/account") {
      limit("account", 24, 60000);
      const login = str(b.login, 80, true).toLowerCase();
      const pw = str(b.password, 160, true);
      if (b.mode === "signin") {
        const row = db
          .prepare("SELECT id,password FROM members WHERE login=?")
          .get(login);
        if (!row?.password || !validPassword(pw, String(row.password)))
          throw new Problem(403, "That username and passphrase did not match.");
        revoke(db, token);
        setSession(res, String(row.id));
        return json(res, { ok: true });
      }
      if (b.mode === "register") {
        if (pw.length < 10)
          throw new Problem(
            400,
            "Use a passphrase with at least 10 characters.",
          );
        if (db.prepare("SELECT login FROM members WHERE id=?").get(me)?.login)
          throw new Problem(409, "This account is already registered.");
        if (db.prepare("SELECT id FROM members WHERE login=?").get(login))
          throw new Problem(409, "Choose another username.");
        db.prepare("UPDATE members SET login=?,password=? WHERE id=?").run(
          login,
          hashPassword(pw),
          me,
        );
        return json(res, { ok: true });
      }
    }
    if (path === "/api/signout") {
      revoke(db, token);
      res.setHeader(
        "Set-Cookie",
        "sa_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict",
      );
      return json(res, { ok: true });
    }
    const ctrl = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) ctrl.abort();
    });
    const result = await application(database(db), false, provider, aiWork)(
      me,
      url,
      write,
      b,
      ctrl.signal,
    );
    return json(res, result.body, result.status);
  } catch (e) {
    if (!(e instanceof Problem)) console.error("Local error:", e.name);
    if (!res.headersSent && !res.destroyed)
      json(
        res,
        {
          error:
            e instanceof Problem
              ? e.message
              : "The workspace could not finish that change.",
        },
        e instanceof Problem ? e.status : 500,
      );
  }
});
if (db)
  startGuides(db, (member) => {
    limit("background:" + member, 30, 3600000);
    limit("ai:server", 150, 3600000);
  });
server.listen(port, "127.0.0.1", () =>
  console.log("Second Act is ready at http://127.0.0.1:" + port),
);
