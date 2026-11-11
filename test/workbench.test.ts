import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import { economics } from "../server/store.ts";
import { parseLedger } from "../public/ventures.js";

test("labor-adjusted margin and an impossible break-even", () => {
  const m = {
    price: 18,
    materials: 2,
    hours: 0.5,
    wage: 20,
    fixed: 18,
    units: 6,
  };
  assert.deepEqual(economics(m), {
    labor: 10,
    contribution: 6,
    result: 18,
    breakEven: 3,
  });
  assert.equal(economics({ ...m, price: 10 }).breakEven, null);
});
test("ledger import preserves quotation and rejects malformed numbers", () => {
  assert.deepEqual(
    parseLedger(
      'date,kind,label,amount\r\n2026-01-01,Expense,"Cloth, 2 yards",12.50',
    )[0],
    {
      date: "2026-01-01",
      kind: "Expense",
      label: "Cloth, 2 yards",
      amount: 12.5,
    },
  );
  assert.throws(() =>
    parseLedger("date,kind,label,amount\n2026-01-01,Expense,Thread,missing"),
  );
});
test("members can review introductions and share a venture without sharing private notes", async (t) => {
  const socket = net.createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((cb) => socket.close(cb));
  const origin = "http://127.0.0.1:" + port;
  const proc = spawn(process.execPath, ["server/main.ts"], {
    cwd: new URL("../", import.meta.url),
    env: {
      ...process.env,
      OPENAI_API_KEY: "",
      PORT: String(port),
      SECOND_ACT_DB: ":memory:",
      SECOND_ACT_LOCAL_PREVIEW: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => proc.kill());
  await Promise.race([
    once(proc.stdout, "data"),
    once(proc, "exit").then(() => {
      throw Error("Test server exited before listening.");
    }),
  ]);
  function actor() {
    let cookie = "";
    return async (path: string, b?: object, expected = 200) => {
      const response = await fetch(origin + "/api/" + path, {
        method: b ? "POST" : "GET",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Cookie: cookie,
        },
        body: b ? JSON.stringify(b) : undefined,
      });
      if (response.headers.has("set-cookie"))
        cookie = response.headers.get("set-cookie").split(";")[0];
      const d = await response.json();
      assert.equal(response.status, expected, JSON.stringify(d));
      return d;
    };
  }
  const a = actor(),
    b = actor(),
    outsider = actor();
  const aa = await a("open", {}),
    bb = await b("open", {});
  await outsider("open", {});
  await a("profile", {
    name: "Maker A",
    goal: "Keep my plans private",
    listed: false,
  });
  await b("profile", { name: "Maker B", skills: "Sewing", listed: true });
  await a("note", { title: "Private budget", body: "Unavailable to team" });
  assert.equal(
    (await b("workspace")).people.some((p) => p.id === aa.member),
    false,
  );
  await a("intro", {
    recipient: bb.member,
    body: "Would you like to compare ideas?",
  });
  const intro = (await b("workspace")).intros[0];
  await b("intro/respond", { id: intro.id, accept: true });
  assert.equal((await a("workspace")).intros[0].status, "Accepted");
  const { id } = await a("venture/new", { template: "mending" }, 201);
  await b("venture?id=" + id, undefined, 404);
  const { code } = await a("venture/invite", { id });
  await b("venture/join", { code });
  await outsider("venture/join", { code }, 404);
  await a("member/block", { other: bb.member, block: true });
  assert.equal(
    (await a("workspace")).people.some((p) => p.id === bb.member),
    false,
  );
  await a("intro", { recipient: bb.member, body: "Blocked test" }, 403);
  await a("member/block", { other: bb.member, block: false });
  const circle = await a(
    "circle/create",
    {
      name: "Pilot circle",
      topic: "Repair",
      city: "Portland",
      summary: "Meet to share repairs.",
    },
    201,
  );
  await b("circle/join", { id: circle.id, join: true });
  await b("circle/meeting", { id: circle.id }, 403);
  await a("circle/meeting", {
    id: circle.id,
    title: "Repair workshop",
    place: "Test room",
    start: "2027-01-01T12:00:00Z",
  });
  await b("circle/post", {
    id: circle.id,
    body: "Review this synthetic post.",
  });
  const board = await b("circle?id=" + circle.id);
  assert.equal(board.meetings.length, 1);
  await b("circle/report", {
    id: circle.id,
    post: board.posts[0].id,
    reason: "Synthetic review",
  });
  const hostBoard = await a("circle?id=" + circle.id);
  assert.equal(hostBoard.reports.length, 1);
  assert.equal((await b("circle?id=" + circle.id)).reports.length, 0);
  await a("circle/moderate", {
    id: circle.id,
    report: hostBoard.reports[0].id,
    hide: true,
  });
  assert.equal(
    (await b("circle?id=" + circle.id)).posts[0].body,
    "[Removed by the circle host]",
  );
  const shared = await b("venture?id=" + id);
  assert.equal(shared.team.length, 2);
  assert.equal((await b("workspace")).notes.length, 0);
  await b("venture/invite", { id }, 403);
  await b(
    "venture/public",
    { id, name: "Public draft", offer: "Mending" },
    403,
  );
  await a("venture/agreement", { id, text: "Review who handles bookings." });
  await b("venture/accept", { id, revision: 1 });
  await a("venture/agreement", {
    id,
    text: "Review the revised schedule and pay.",
  });
  assert.equal(
    (await b("venture?id=" + id)).team.some((m) => m.accepted),
    false,
  );
  const m = await b("venture/ledger", {
    id,
    batch: "receipt-review-1",
    rows: [
      { date: "2026-01-01", kind: "Expense", amount: 12.34, label: "Thread" },
    ],
  });
  assert.equal(m.venture.entries[0].cents, 1234);
  await b("venture/ledger", { id, batch: "receipt-review-1", rows: [] });
  await b(
    "venture/ledger",
    {
      id,
      rows: [
        { date: "2026-01-02", kind: "Income", amount: 18, label: "Repair" },
        { date: "bad", kind: "Income", amount: 10, label: "Repair" },
      ],
    },
    400,
  );
  assert.equal((await b("venture?id=" + id)).venture.entries.length, 1);
  await b(
    "venture/public-preview",
    { id, question: "What do you offer?" },
    409,
  );
  const pub = await a("venture/public", {
    id,
    name: "Mend Studio",
    offer: "Clothing repairs",
    price: "$18",
  });
  assert.equal(pub.venture.publicDraft.version, 1);
  assert.ok(!JSON.stringify(pub.venture.publicDraft).includes("Thread"));
  await a("account", {
    mode: "register",
    login: "test-maker",
    password: "test-phrase-for-fixture",
  });
  const signedIn = actor();
  await signedIn("open", {});
  await signedIn("account", {
    mode: "signin",
    login: "test-maker",
    password: "test-phrase-for-fixture",
  });
  assert.equal((await signedIn("workspace")).member, aa.member);
  await a("chat", { message: "Hello" }, 503);
  assert.equal((await a("workspace")).messages.length, 0);
  assert.equal((await fetch(origin + "/.env.local")).status, 404);
  assert.equal(
    (
      await fetch(origin + "/api/note", {
        method: "POST",
        headers: {
          Origin: "https://elsewhere.invalid",
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).status,
    403,
  );
});
