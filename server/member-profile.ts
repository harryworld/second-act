import { profile, type DB } from "./store.ts";
import { memories, settings } from "./guides.ts";

export async function buildPrivateBrief(
  db: DB,
  member: string,
  summarize: (source: object) => Promise<string>,
) {
  await db
    .prepare("INSERT OR IGNORE INTO profile_briefs(member) VALUES(?)")
    .run(member);
  const initial = await db
    .prepare("SELECT revision,brief FROM profile_briefs WHERE member=?")
    .get(member);
  const revision = Number(initial.revision);
  if (!(await settings(db, member)).memory) return { revision, text: null };
  if (initial.brief) return { revision, text: String(initial.brief) };
  const { skills, goal, days, city } = await profile(db, member);
  const facts = (await memories(db, member)).map(({ topic, fact }) => ({
    topic,
    fact,
  }));
  if (![skills, goal, days, city].some(Boolean) && !facts.length)
    return { revision, text: null };
  const text = await summarize({
    memberProfile: { skills, goal, days, city },
    rememberedFacts: facts,
  });
  // A forgotten fact or concurrent profile edit invalidates the in-flight brief.
  const update = await db
    .prepare(
      `UPDATE profile_briefs SET brief=? WHERE member=? AND revision=? AND coalesce((SELECT memory FROM guide_settings WHERE member=?),1)=1`,
    )
    .run(text, member, revision, member);
  return { revision, text: update.changes ? text : null };
}
