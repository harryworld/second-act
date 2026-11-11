import { test } from "node:test";
import assert from "node:assert/strict";
import { connect } from "../server/local-database.ts";
import { database } from "../server/local-driver.ts";
import { installGuides } from "../server/local-guides.ts";
import {
  addMessage,
  freshProfile,
  history,
  recordVoice,
} from "../server/store.ts";
import { changeSettings, processMemory } from "../server/guides.ts";
import {
  changeItem,
  memoryItems,
  recallItems,
  recallPassages,
  saveFromTurn,
  searchHistory,
  sourceTurn,
} from "../server/conversation-memory.ts";
test("conversation sources, adopted instructions and reference excerpts survive a fresh chat and stay private", async (t) => {
  const sql = connect(":memory:");
  t.after(() => sql.close());
  installGuides(sql);
  const db = database(sql);
  for (const m of ["a", "b"])
    sql
      .prepare("INSERT INTO members(id,profile) VALUES(?,?)")
      .run(m, JSON.stringify(freshProfile()));
  const statement =
    "Please use metric units in every plan. Our Indigo Fair trial allows seven bookings.";
  await addMessage(db, "personal:a", "user", { text: statement });
  await addMessage(db, "personal:a", "assistant", {
    text: "Consider a blue awning.",
  });
  await addMessage(db, "personal:b", "user", { text: "Other member’s log." });
  await addMessage(db, "venture:shared", "user", { text: "Shared figures." });
  sql.prepare("UPDATE memory_work SET due=0 WHERE member='a'").run();
  await processMemory(db, {
    memory: async (_, topics, turns) => {
      assert.equal(turns.length, 1);
      return {
        changes: [],
        items: [
          {
            kind: "instruction",
            turn: 0,
            quote: "Please use metric units in every plan.",
          },
          {
            kind: "reference",
            turn: 0,
            quote: "Our Indigo Fair trial allows seven bookings.",
          },
          { kind: "reference", turn: 0, quote: "Invented fact" },
        ],
      };
    },
    discuss: async () => {
      throw Error();
    },
  });
  const items = await memoryItems(db, "a");
  assert.equal(items.length, 2);
  assert.deepEqual(await memoryItems(db, "b"), []);
  const instruction = items.find((x) => x.kind === "instruction");
  assert.equal(instruction.state, "suggested");
  assert.equal(recallItems(items, "Indigo").memberInstructions.length, 0);
  await changeItem(db, "a", instruction.id, "use", instruction.content);
  assert.match(
    recallItems(await memoryItems(db, "a"), "").memberInstructions[0],
    /metric/,
  );
  await assert.rejects(
    changeItem(db, "b", instruction.id, "forget", null),
    /unavailable/,
  );
  const notes = await searchHistory(
    db,
    "a",
    "blue awning",
    Number.MAX_SAFE_INTEGER,
  );
  assert.equal(notes.turns.length, 1);
  const reply = notes.turns[0];
  await saveFromTurn(db, "a", {
    sourceId: reply.id,
    quote: "blue awning",
    content: "Optional awning idea",
    kind: "reference",
  });
  await assert.rejects(
    saveFromTurn(db, "b", {
      sourceId: reply.id,
      quote: "blue awning",
      content: "x",
      kind: "reference",
    }),
    /no longer available/,
  );
  await assert.rejects(
    saveFromTurn(db, "a", {
      sourceId: reply.id,
      quote: "never said",
      content: "x",
      kind: "instruction",
    }),
    /exact passage/,
  );
  await changeSettings(db, "a", false, false);
  await addMessage(db, "personal:a", "user", {
    text: "Orchid-only paused detail",
  });
  await changeSettings(db, "a", true, false);
  sql
    .prepare(
      "INSERT INTO founder_chat_boundaries(member,last_row) VALUES('a',(SELECT max(rowid) FROM messages))",
    )
    .run();
  assert.deepEqual(await history(db, "personal:a"), []);
  assert.equal((await searchHistory(db, "a", "Indigo", 999)).turns.length, 1);
  assert.ok((await recallPassages(db, "a", "Indigo")).length);
  assert.equal((await recallPassages(db, "a", "Orchid")).length, 0);
  await changeItem(
    db,
    "a",
    items.find((x) => x.kind === "reference").id,
    "forget",
    null,
  );
  assert.equal((await recallPassages(db, "a", "Indigo")).length, 0);
  sql.prepare("DELETE FROM messages WHERE scope='personal:a'").run();
  assert.equal(
    (await memoryItems(db, "a")).find(
      (x) => x.content === "Optional awning idea",
    ).quote,
    "blue awning",
  );
});
test("spoken passages can be searched across caption fragments, cited and browsed past a page", async (t) => {
  const sql = connect(":memory:");
  t.after(() => sql.close());
  installGuides(sql);
  const db = database(sql);
  sql
    .prepare("INSERT INTO members(id,profile) VALUES('a',?)")
    .run(JSON.stringify(freshProfile()));
  sql
    .prepare("INSERT INTO voice_sessions VALUES('run','a','personal:a',?)")
    .run(Date.now() - 1000);
  await recordVoice(db, "a", "run", [
    { id: "1", role: "user", delta: "Blue", start: 1, end: 80 },
    {
      id: "2",
      role: "user",
      delta: " Quay is our supplier.",
      start: 81,
      end: 200,
    },
    { id: "3", role: "assistant", delta: "Got it.", start: 250, end: 300 },
  ]);
  for (let i = 0; i < 15; i++)
    await addMessage(db, "personal:a", "user", { text: "Later turn " + i });
  const p = await searchHistory(db, "a", "", Number.MAX_SAFE_INTEGER);
  assert.equal(p.turns.length, 12);
  assert.ok(p.next);
  const older = await searchHistory(db, "a", "", p.next);
  assert.ok(older.turns.some((x) => x.text === "Blue Quay is our supplier."));
  const match = await searchHistory(
    db,
    "a",
    "Blue Quay",
    Number.MAX_SAFE_INTEGER,
  );
  assert.equal(match.turns.length, 1);
  assert.equal((await sourceTurn(db, "a", "run:2")).id, match.turns[0].id);
});
