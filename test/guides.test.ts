import { connect } from "../server/local-database.ts";
import { installGuides } from "../server/local-guides.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  freshProfile,
  recordVoice,
  history,
  addMessage,
} from "../server/store.ts";
import { liveHistory } from "../server/ai.ts";
import {
  guideState,
  changeSettings,
  forget,
  reconcile,
  processMemory,
  processExchange,
} from "../server/guides.ts";
function setup() {
  const db = connect(":memory:");
  installGuides(db);
  for (const [id, name, skills] of [
    ["a", "Anne", "Sewing"],
    ["b", "Bea", "Retail"],
  ])
    db.prepare("INSERT INTO members(id,profile) VALUES(?,?)").run(
      id,
      JSON.stringify({
        ...freshProfile(),
        name,
        skills,
        listed: true,
        city: "Portland",
      }),
    );
  return db;
}
test("mixed conversation keeps voice timeline, speaker, whitespace and retry identity", async () => {
  const db = setup();
  const scope = "personal:a",
    run = "run-a";
  await addMessage(db, scope, "user", { text: "We named it Loom." });
  db.prepare("INSERT INTO voice_sessions VALUES(?,?,?,?)").run(
    run,
    "a",
    scope,
    Date.now(),
  );
  const input = {
    id: "in-1",
    role: "user",
    delta: "I make",
    start: 10,
    end: 110,
  };
  const more = { ...input, id: "in-2", delta: " bags.", start: 111, end: 230 };
  const out = {
    id: "out-1",
    role: "assistant",
    delta: "Let's price one.",
    start: 300,
    end: 520,
  };
  await recordVoice(db, "a", run, [more, out]);
  await recordVoice(db, "a", run, [input, more]);
  assert.deepEqual(
    (await history(db, scope)).map((x) => x.text),
    ["We named it Loom.", "I make bags.", "Let's price one."],
  );
  const seed = liveHistory(await history(db, scope));
  assert.equal(seed[2].content[0].type, "output_text");
  assert.equal(seed[1].content[0].text, "I make bags.");
  assert.deepEqual(await history(db, "personal:b"), []);
  await assert.rejects(
    async () => await recordVoice(db, "b", run, [input]),
    /unavailable/,
  );
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM memory_inbox WHERE member='a'").get()
      .n,
    3,
  );
  db.close();
});
test("background memory accepts sourced member facts, ignores venture conversations and respects pause/forget", async () => {
  const db = setup();
  const words = "I can mend on Tuesdays.";
  await addMessage(db, "personal:a", "user", { text: words });
  await addMessage(db, "personal:a", "assistant", {
    text: "You could teach on Fridays.",
  });
  await addMessage(db, "venture:one", "user", {
    text: "Team budget is confidential.",
  });
  db.prepare("UPDATE memory_work SET due=0").run();
  const providers = {
    memory: async (_old, text) => {
      assert.equal(text.trim(), words);
      return [
        {
          topic: "availability",
          fact: "Available on Tuesdays",
          evidence: "on Tuesdays",
        },
        { topic: "interests", fact: "Teaching", evidence: "teach on Fridays" },
      ];
    },
    discuss: async () => {
      throw Error("unexpected");
    },
  };
  await processMemory(db, providers);
  assert.equal((await guideState(db, "a")).memories.length, 1);
  assert.equal((await guideState(db, "b")).memories.length, 0);
  await addMessage(db, "personal:a", "user", { text: "I now work Mondays." });
  db.prepare("UPDATE memory_work SET due=0").run();
  await processMemory(db, {
    ...providers,
    memory: async () => {
      await forget(db, "a", "availability");
      return [{ topic: "availability", fact: "Monday", evidence: "Mondays" }];
    },
  });
  assert.deepEqual((await guideState(db, "a")).memories, []);
  await changeSettings(db, "a", false, false);
  await addMessage(db, "personal:a", "user", { text: "I work Saturdays." });
  assert.equal((await guideState(db, "a")).memoryStatus, "idle");
  db.close();
});
test("two consenting guides exchange actual messages using only listed profiles, and revoke in-flight results", async () => {
  const db = setup();
  db.prepare("INSERT INTO guide_memories VALUES(?,?,?,?,?)").run(
    "a",
    "goal",
    "Never disclose this private plan",
    "private",
    "today",
  );
  await changeSettings(db, "a", true, true);
  assert.deepEqual((await guideState(db, "a")).exchanges, []);
  await changeSettings(db, "b", true, true);
  let turns = 0;
  const providers = {
    memory: async () => [],
    discuss: async (own, peer, incoming) => {
      turns++;
      assert.equal(
        JSON.stringify([own, peer, incoming]).includes("private plan"),
        false,
      );
      assert.equal(own.name, turns === 1 ? "Anne" : "Bea");
      if (turns === 1) {
        assert.equal(incoming, null);
        return {
          message: "Can your member test demand?",
          fit: "explore",
          idea: "Test a bag",
        };
      }
      assert.equal(incoming.message, "Can your member test demand?");
      return {
        message: "A small survey could work.",
        fit: "uncertain",
        idea: "Ask five buyers",
      };
    },
  };
  await processExchange(db, providers);
  await processExchange(db, providers);
  assert.equal(turns, 2);
  assert.equal(
    (await guideState(db, "b")).exchanges[0].response.idea,
    "Ask five buyers",
  );
  assert.equal((await guideState(db, "b")).exchanges[0].first, false);
  db.prepare(
    "UPDATE members SET profile=json_set(profile,'$.goal','Make totes') WHERE id='a'",
  ).run();
  await reconcile(db, "a");
  await processExchange(db, {
    ...providers,
    discuss: async () => {
      await changeSettings(db, "b", true, false);
      return { message: "outdated", idea: "outdated", fit: "explore" };
    },
  });
  assert.deepEqual((await guideState(db, "a")).exchanges, []);
  await changeSettings(db, "b", true, true);
  db.prepare("INSERT INTO blocks VALUES('a','b')").run();
  await reconcile(db, "a");
  assert.deepEqual((await guideState(db, "b")).exchanges, []);
  db.close();
});
test("a privately remembered interest helps shortlist listed peers without appearing in the outreach", async () => {
  const db = setup();
  for (const [id, skills] of [
    ["c", "Repairs"],
    ["d", "Sales"],
    ["e", "Bookbinding"],
  ]) {
    db.prepare("INSERT INTO members(id,profile) VALUES(?,?)").run(
      id,
      JSON.stringify({
        ...freshProfile(),
        name: id,
        skills,
        city: "Portland",
        listed: true,
      }),
    );
  }
  for (const id of ["b", "c", "d", "e"])
    await changeSettings(db, id, true, true);
  db.prepare("INSERT INTO guide_memories VALUES(?,?,?,?,?)").run(
    "a",
    "interests",
    "Bookbinding is my private goal.",
    "bookbinding",
    "today",
  );
  await changeSettings(db, "a", true, true);
  const matches = (await guideState(db, "a")).exchanges;
  assert.equal(matches.length, 3);
  assert.ok(matches.some((x) => x.peer === "e"));
  assert.equal(
    JSON.stringify((await guideState(db, "e")).exchanges).includes(
      "my private goal",
    ),
    false,
  );
  db.close();
});
