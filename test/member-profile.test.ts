import assert from "node:assert/strict";
import { test } from "node:test";
import { chatGPTAccount } from "../sites/account.ts";
import { buildPrivateBrief } from "../server/member-profile.ts";
import { connect } from "../server/local-database.ts";
import { database } from "../server/local-driver.ts";
import { installGuides } from "../server/local-guides.ts";
import { freshProfile } from "../server/store.ts";
import { forget, guideState } from "../server/guides.ts";

test("ChatGPT identity requires a trusted member ID and safely decodes the account name", () => {
  const h = new Headers({
    "oai-authenticated-user-email": "owner@example.test",
    "oai-authenticated-user-full-name": encodeURIComponent("Ari 林"),
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  });
  assert.equal(chatGPTAccount(h), null);
  h.set("oai-authenticated-user-id", "site-member");
  assert.equal(chatGPTAccount(h)?.details.name, "Ari 林");
  assert.equal(chatGPTAccount(h)?.details.email, "owner@example.test");
  h.set("oai-authenticated-user-full-name", "%broken");
  assert.equal(chatGPTAccount(h)?.details.name, "");
});
test("a profile brief uses only its member’s facts, reuses a current brief, and discards an outdated one", async (t) => {
  const sqlite = connect(":memory:");
  t.after(() => sqlite.close());
  installGuides(sqlite);
  const db = database(sqlite);
  for (const member of ["a", "b"])
    sqlite
      .prepare("INSERT INTO members(id,profile) VALUES(?,?)")
      .run(member, JSON.stringify(freshProfile()));
  const save = (member: string, fact: string) =>
    sqlite
      .prepare("INSERT INTO guide_memories VALUES(?,?,?,?,?)")
      .run(member, "goal", fact, fact, "2026-11-11");
  save("a", "You want to open a café.");
  save("b", "You want to sell lamps.");
  let calls = 0;
  const write = async (source) => {
    calls++;
    assert.match(JSON.stringify(source), /café/);
    assert.doesNotMatch(JSON.stringify(source), /lamps/);
    return "You’re exploring a café.";
  };
  const brief = await buildPrivateBrief(db, "a", write);
  assert.equal(brief.text, "You’re exploring a café.");
  assert.deepEqual(await buildPrivateBrief(db, "a", write), brief);
  assert.equal(calls, 1);
  await forget(db, "a", "goal");
  assert.equal((await guideState(db, "a")).brief.text, null);
  assert.equal((await buildPrivateBrief(db, "a", write)).text, null);
  assert.equal(calls, 1);
  save("a", "You want to open a bakery.");
  const stale = await buildPrivateBrief(db, "a", async () => {
    await forget(db, "a", "goal");
    return "You want to open a bakery.";
  });
  assert.equal(stale.text, null);
  assert.equal((await guideState(db, "a")).brief.text, null);
  sqlite
    .prepare("UPDATE members SET profile=? WHERE id=?")
    .run(JSON.stringify({ ...freshProfile(), skills: "Sewing" }), "a");
  const refreshed = await buildPrivateBrief(db, "a", async (source) => {
    assert.match(JSON.stringify(source), /Sewing/);
    return "You sew.";
  });
  assert.equal(refreshed.text, "You sew.");
});
