import { test } from "node:test";
import assert from "node:assert/strict";
import { connect } from "../server/local-database.ts";
import { database } from "../server/local-driver.ts";
import { installGuides } from "../server/local-guides.ts";
import { addMessage, freshProfile } from "../server/store.ts";
import {
  shareExperience,
  withdrawExperience,
  findExperiences,
  founderMessages,
  ownShares,
  voiceExperiences,
} from "../server/shared-experiences.ts";
test("a founder guide can use only another member's explicitly shared excerpt, with revocation and blocks", async (t) => {
  const native = connect(":memory:");
  t.after(() => native.close());
  installGuides(native);
  const db = database(native);
  for (const id of ["baker", "reader", "outsider"])
    native
      .prepare("INSERT INTO members(id,profile) VALUES(?,?)")
      .run(id, JSON.stringify(freshProfile()));
  const privateFact = "A private supplier and budget that must stay private.";
  native
    .prepare("INSERT INTO guide_memories VALUES(?,?,?,?,?)")
    .run(
      "baker",
      "experience",
      privateFact,
      "Original confidential transcript.",
      "today",
    );
  const b = {
    origin: "fact",
    key: "experience",
    original: privateFact,
    title: "Pricing bread workshops",
    excerpt: "Three advance bookings covered the room rental.",
  };
  assert.deepEqual(await findExperiences(db, "reader", "bread pricing"), []);
  await assert.rejects(shareExperience(db, "outsider", b), /own remembered/);
  await shareExperience(db, "baker", b);
  const [note] = await findExperiences(
    db,
    "reader",
    "How should I price my bread workshop?",
  );
  assert.equal(note.excerpt, b.excerpt);
  assert.ok(!("member" in note || "source_key" in note));
  assert.ok(!JSON.stringify(note).includes("supplier"));
  assert.deepEqual(await findExperiences(db, "baker", "bread pricing"), []);
  assert.deepEqual(await findExperiences(db, "reader", "welding helmets"), []);
  assert.equal(
    (await findExperiences(db, "reader", "What have other members learned?"))
      .length,
    1,
  );
  await addMessage(db, "personal:reader", "assistant", {
    text: "Advice based on a shared experience.",
    peerSourceIds: [note.id],
  });
  assert.equal(
    (await founderMessages(db, "reader"))[0].peerSources[0].title,
    b.title,
  );
  native
    .prepare(
      "INSERT INTO voice_sessions VALUES('run','reader','personal:reader',?)",
    )
    .run(Date.now());
  assert.equal(
    (await voiceExperiences(db, "reader", "run", "bread workshops")).length,
    1,
  );
  await assert.rejects(
    voiceExperiences(db, "outsider", "run", "bread workshops"),
    /unavailable/,
  );
  native.prepare("INSERT INTO blocks VALUES('baker','reader')").run();
  assert.deepEqual(await findExperiences(db, "reader", "bread pricing"), []);
  assert.deepEqual(await founderMessages(db, "reader", true), []);
  native.prepare("DELETE FROM blocks").run();
  await shareExperience(db, "baker", {
    ...b,
    expectedId: note.id,
    excerpt: "We now ask for four bookings.",
  });
  assert.equal((await founderMessages(db, "reader"))[0].peerSources.length, 0);
  const current = (await ownShares(db, "baker"))[0];
  await assert.rejects(
    withdrawExperience(db, "reader", current.id),
    /unavailable/,
  );
  await withdrawExperience(db, "baker", current.id);
  await assert.rejects(
    shareExperience(db, "baker", { ...b, expectedId: current.id }),
    /Sharing changed/,
  );
  assert.deepEqual(await findExperiences(db, "reader", "bread pricing"), []);
  await shareExperience(db, "baker", b);
  native.prepare("DELETE FROM guide_memories WHERE member='baker'").run();
  assert.deepEqual(await ownShares(db, "baker"), []);
});
