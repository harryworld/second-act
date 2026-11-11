import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { connect } from "../server/local-database.ts";
import { database } from "../server/local-driver.ts";
import { installGuides } from "../server/local-guides.ts";
import { storyRequest, STORY_END } from "../server/sophie-story.ts";
test("each Sophie visit has an isolated guide, Harry's recorded sources, and a delayed practice introduction", async (t) => {
  const sqlite = connect(":memory:");
  t.after(() => sqlite.close());
  installGuides(sqlite);
  sqlite.exec(
    readFileSync(
      new URL("../drizzle/0004_sophie_story.sql", import.meta.url),
      "utf8",
    ),
  );
  const db = database(sqlite),
    stages = [];
  const opts = {
    db,
    nowMs: STORY_END - 3600000,
    limit: async () => {},
    locked: async (k, fn) => fn(),
    provider: {
      reply: async (context, prior, msg) => {
        assert.equal(context.memberName, "Sophie");
        assert.match(context.profile.goal, /pet care/);
        assert.equal(context.communityExperiences.length, 3);
        assert.ok(
          context.communityExperiences.every((n) => n.author === "Harry"),
        );
        assert.match(context.story.mentor, /five years/);
        stages.push(context.story.mayIntroduce);
        return { text: "A test reply", usedExperiences: ["S1"] };
      },
    },
  };
  const call = (route, cookie = "", b = null, options = opts) =>
    storyRequest(
      new Request("https://test.invalid/api/story/" + route, {
        method: b ? "POST" : "GET",
        headers: { cookie },
      }),
      b || {},
      options,
    );
  const a = await call("start", "", {}),
    b = await call("start", "", {});
  const ca = a.cookie.split(";")[0],
    cb = b.cookie.split(";")[0];
  assert.notEqual(ca, cb);
  assert.match(a.cookie, /HttpOnly/);
  assert.equal(a.body.mentor, null);
  await assert.rejects(
    call("chat", "", { message: "my plan" }),
    /Enter Sophie/,
  );
  await assert.rejects(call("intro", ca, { message: "Hi Harry" }), /Talk with/);
  await call("chat", ca, { message: "How should I test demand?" });
  await call("chat", ca, { message: "Which supplies should I stock?" });
  const third = await call("chat", ca, {
    message: "How should I plan my cash?",
  });
  assert.deepEqual(stages, [false, false, true]);
  assert.ok(third.body.mentor);
  assert.ok(third.body.messages[1].storySources.length);
  assert.equal((await call("session", cb)).body.messages.length, 0);
  await call("intro", ca, { message: "Can we compare first orders?" });
  assert.match((await call("session", ca)).body.introduction, /first orders/);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM members").get().n, 0);
  await call("exit", ca, {});
  assert.equal((await call("session", ca)).body.active, false);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM messages").get().n, 0);
  await assert.rejects(
    call("session", cb, null, { ...opts, nowMs: STORY_END }),
    /has ended/,
  );
});
