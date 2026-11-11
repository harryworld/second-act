import {
  shareExperience,
  withdrawExperience,
  findExperiences,
  founderMessages,
  voiceExperiences,
  requireExperiences,
} from "./shared-experiences.ts";
import {
  recallItems,
  recallPassages,
  saveFromTurn,
  changeItem,
  searchHistory,
  sourceTurn,
} from "./conversation-memory.ts";
import { buildPrivateBrief } from "./member-profile.ts";
import {
  uid,
  now,
  profile,
  venture,
  saveVenture,
  history,
  addMessage,
  recordVoice,
  newVenture,
  economics,
  Problem,
  str,
  number,
} from "./store.ts";
import {
  guideState,
  changeSettings,
  forget,
  retryGuides,
  reconcile,
  resetInbox,
} from "./guides.ts";
import { circles, samples } from "../public/catalog.js";
import type { Database } from "./database.ts";
import type { createAI } from "./ai.ts";
const json = (body: unknown, status = 200) => ({ body, status });
export function application(
  db: Database,
  hosted: boolean,
  provider: ReturnType<typeof createAI>,
  aiWork: (me: string, scope: string, fn: () => Promise<any>) => Promise<any>,
  account: { provider: string; name: string; email: string } | null = null,
) {
  const { reply, decide, startVoice, customerPreview } = provider;
  async function circleList() {
    return [
      ...circles.map((c) => ({ ...c, host: null })),
      ...(
        await db.prepare("SELECT * FROM circles ORDER BY rowid DESC").all()
      ).map((c) => ({ ...c, image: "circle.webp" })),
    ];
  }
  async function visiblePeople(member: string) {
    return (
      await db
        .prepare(
          `SELECT id,profile FROM members m WHERE id<>? AND json_extract(profile,'$.listed')=1
    AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.member=? AND b.other=m.id) OR (b.member=m.id AND b.other=?))`,
        )
        .all(member, member, member)
    ).map((r) => ({ id: r.id, ...JSON.parse(String(r.profile)) }));
  }
  async function workspace(member: string) {
    const p = await profile(db, member);
    const ventures = (
      await db
        .prepare(
          "SELECT v.id,v.owner,v.data FROM ventures v JOIN team t ON t.venture=v.id WHERE t.member=? ORDER BY v.rowid DESC",
        )
        .all(member)
    ).map((r) => ({ id: r.id, owner: r.owner, ...JSON.parse(String(r.data)) }));
    const people = await visiblePeople(member);
    const intros = await Promise.all(
      (
        await db
          .prepare(
            "SELECT * FROM introductions WHERE sender=? OR recipient=? ORDER BY rowid DESC",
          )
          .all(member, member)
      ).map(async (r) => ({
        ...r,
        senderName:
          (await profile(db, String(r.sender))).name || "Studio member",
        recipientName:
          samples.find((s) => s.id === r.recipient)?.name ||
          (await profile(db, String(r.recipient))).name ||
          "Studio member",
      })),
    );
    return {
      member,
      account,
      guide: await guideState(db, member),
      profile: p,
      circles: await circleList(),
      blocked: await Promise.all(
        (
          await db
            .prepare("SELECT other FROM blocks WHERE member=?")
            .all(member)
        ).map(async (r) => ({
          id: r.other,
          name: (await profile(db, String(r.other))).name || "Member",
        })),
      ),
      hosted,
      registered:
        hosted ||
        !!(await db.prepare("SELECT login FROM members WHERE id=?").get(member))
          ?.login,
      ventures,
      people,
      intros,
      messages: await founderMessages(db, member),
      notes: await db
        .prepare("SELECT * FROM notes WHERE member=? ORDER BY rowid DESC")
        .all(member),
      memberships: (
        await db
          .prepare("SELECT circle FROM memberships WHERE member=?")
          .all(member)
      ).map((r) => r.circle),
    };
  }
  async function viewVenture(member: string, id: string) {
    const v = await venture(db, member, id);
    const team = await Promise.all(
      (
        await db
          .prepare(
            "SELECT t.member,a.revision FROM team t LEFT JOIN agreements a ON a.venture=t.venture AND a.member=t.member WHERE t.venture=?",
          )
          .all(id)
      ).map(async (r) => ({
        id: r.member,
        name: (await profile(db, String(r.member))).name || "Studio member",
        accepted: !!v.agreement && r.revision === v.revision,
      })),
    );
    return {
      venture: v,
      team,
      messages: await history(db, "venture:" + id),
      economics: economics(v.model),
    };
  }
  async function agentContext(member: string, vid: string, question: string) {
    if (vid) {
      const v = await venture(db, member, vid);
      return {
        scope: "Shared venture",
        title: v.title,
        question: v.question,
        tasks: v.tasks,
        status: v.status,
        budget: v.budget,
        evidence: v.evidence,
        pricing: v.model,
        summary: economics(v.model),
        deadline: v.deadline,
        agreement: v.agreement,
        ledger: v.entries.map(({ kind, cents, label }) => ({
          kind,
          cents,
          label,
        })),
      };
    }
    const p = await profile(db, member);
    const guide = await guideState(db, member);
    const visible = (await visiblePeople(member))
      .slice(0, 40)
      .map((p) => ({ ...p, example: false }));
    return {
      scope: "Private founder guide",
      ...(guide.memoryEnabled
        ? recallItems(guide.conversationItems, question)
        : {}),
      earlierPassages: guide.memoryEnabled
        ? await recallPassages(db, member, question)
        : [],
      memberName: p.name || account?.name || "",
      privateMemory: guide.memoryEnabled
        ? guide.memories.map(({ topic, fact }) => ({ topic, fact }))
        : [],
      guideConnections: guide.exchanges
        .filter((x) => x.status === "ready")
        .map((x) => ({ name: x.name, proposal: x.pitch, reply: x.response })),
      profile: p,
      people: [
        ...visible,
        ...samples.map((person) => ({ ...person, example: true })),
      ],
      circles: (await circleList()).map((c) => ({
        name: c.name,
        city: c.city,
        topic: c.topic,
      })),
      ventures: await db
        .prepare(
          "SELECT json_extract(v.data,'$.title') AS title FROM ventures v JOIN team t ON t.venture=v.id WHERE t.member=?",
        )
        .all(member),
    };
  }
  return async function request(
    me: string,
    url: URL,
    write: boolean,
    b: Record<string, any>,
    signal: AbortSignal,
  ) {
    const path = url.pathname;
    if (
      (path === "/api/open" && write) ||
      (path === "/api/workspace" && !write)
    )
      return json(await workspace(me));
    if (path === "/api/receipt" && !write) {
      const v = await venture(db, me, url.searchParams.get("id") || "");
      const entry = v.entries.find(
        (r) => r.id === url.searchParams.get("entry"),
      );
      if (!entry?.receipt) throw new Problem(404, "Receipt unavailable.");
      if (entry.receipt !== "attached") return json({ receipt: entry.receipt });
      const parts = await db
        .prepare(
          "SELECT content FROM receipt_parts WHERE venture=? AND entry=? ORDER BY part",
        )
        .all(v.id, entry.id);
      if (!parts.length) throw new Problem(404, "Receipt unavailable.");
      return json({ receipt: parts.map((r) => r.content).join("") });
    }
    if (path === "/api/memory/history" && !write) {
      const before = url.searchParams.get("before");
      return json(
        await searchHistory(
          db,
          me,
          str(url.searchParams.get("q"), 160),
          before
            ? number(Number(before), Number.MAX_SAFE_INTEGER, true)
            : Number.MAX_SAFE_INTEGER,
          url.searchParams.get("full") === "1",
        ),
      );
    }
    if (path === "/api/memory/source" && !write)
      return json(
        await sourceTurn(db, me, str(url.searchParams.get("id"), 260, true)),
      );
    if (path === "/api/me/profile" && !write) {
      return json({
        account,
        profile: await profile(db, me),
        guide: await guideState(db, me),
      });
    }
    if (path === "/api/guide" && !write) return json(await guideState(db, me));
    if (path === "/api/workspace" && !write) return json(await workspace(me));
    if (path === "/api/venture" && !write)
      return json(await viewVenture(me, url.searchParams.get("id") || ""));
    if (path === "/api/circle" && !write) {
      const id = url.searchParams.get("id") || "";
      if (
        !(await db
          .prepare("SELECT 1 FROM memberships WHERE member=? AND circle=?")
          .get(me, id))
      )
        throw new Problem(403, "Join this circle to read its discussion.");
      const posts = await Promise.all(
        (
          await db
            .prepare(
              "SELECT * FROM posts WHERE circle=? ORDER BY rowid DESC LIMIT 100",
            )
            .all(id)
        ).map(async (r) => ({
          ...r,
          name: (await profile(db, String(r.member))).name || "Studio member",
        })),
      );
      const host = (
        await db.prepare("SELECT host FROM circles WHERE id=?").get(id)
      )?.host;
      const meetings = await db
        .prepare("SELECT * FROM meetings WHERE circle=? ORDER BY start")
        .all(id);
      const reports =
        host === me
          ? await db
              .prepare(
                "SELECT r.id,r.reason,p.body FROM reports r LEFT JOIN posts p ON p.id=r.post WHERE r.circle=? AND r.status='Open'",
              )
              .all(id)
          : [];
      return json({ posts, meetings, reports, host: host || null });
    }
    if (!write) throw new Problem(404, "Unavailable.");
    if (path === "/api/memory/share") {
      await shareExperience(db, me, b);
      return json({ ok: true });
    }
    if (path === "/api/memory/withdraw") {
      await withdrawExperience(db, me, str(b.id, 100, true));
      return json({ ok: true });
    }
    if (path === "/api/voice/peer-experiences") {
      return json({
        items: await voiceExperiences(
          db,
          me,
          str(b.runId, 90, true),
          str(b.query, 800, true),
        ),
      });
    }
    if (path === "/api/memory/save") {
      await saveFromTurn(db, me, b);
      return json({ ok: true });
    }
    if (path === "/api/memory/change") {
      await changeItem(
        db,
        me,
        str(b.id, 90, true),
        str(b.action, 20, true),
        b.content,
      );
      return json({ ok: true });
    }
    if (path === "/api/chat/new") {
      await db.exec("BEGIN");
      try {
        await db
          .prepare(
            "INSERT INTO founder_chat_boundaries(member,last_row) VALUES(?,(SELECT coalesce(max(rowid),0) FROM messages)) ON CONFLICT(member) DO UPDATE SET last_row=excluded.last_row,revision=revision+1",
          )
          .run(me);
        await db
          .prepare("DELETE FROM voice_sessions WHERE scope=?")
          .run("personal:" + me);
        await db.exec("COMMIT");
      } catch (e) {
        await db.exec("ROLLBACK");
        throw e;
      }
      return json({ ok: true });
    }
    if (path === "/api/profile/brief") {
      return json(
        await buildPrivateBrief(db, me, (source) =>
          aiWork(me, "profile-brief:" + me, () =>
            provider.summarizeMember(source),
          ),
        ),
      );
    }
    if (path === "/api/guide/settings") {
      if (typeof b.memory !== "boolean" || typeof b.outreach !== "boolean")
        throw new Problem(400, "Choose guide settings.");
      await changeSettings(db, me, b.memory, b.outreach);
    } else if (path === "/api/guide/forget") {
      await forget(db, me, str(b.topic, 80, true));
    } else if (path === "/api/guide/retry") {
      await retryGuides(db, me);
    } else if (path === "/api/profile") {
      const p = {
        name: str(b.name, 80),
        skills: str(b.skills, 600),
        goal: str(b.goal, 800),
        days: str(b.days, 140),
        city: str(b.city, 140),
        listed: b.listed === true,
      };
      if (p.listed && !p.name)
        throw new Problem(400, "Enter a display name to list your profile.");
      await db
        .prepare("UPDATE members SET profile=? WHERE id=?")
        .run(JSON.stringify(p), me);
      await reconcile(db, me);
    } else if (path === "/api/intro") {
      const recipient = str(b.recipient, 90, true),
        demo = samples.some((p) => p.id === recipient);
      if (recipient === me || (!demo && !(await profile(db, recipient)).listed))
        throw new Problem(404, "This member is unavailable.");
      if (
        !demo &&
        (await db
          .prepare(
            "SELECT 1 FROM blocks WHERE (member=? AND other=?) OR (member=? AND other=?)",
          )
          .get(me, recipient, recipient, me))
      )
        throw new Problem(403, "This introduction is unavailable.");
      if (!(await profile(db, me)).name)
        throw new Problem(
          400,
          "Add a display name to your profile before requesting an introduction.",
        );
      const body = str(b.body, 1400, true);
      await db
        .prepare(
          "INSERT INTO introductions VALUES(?,?,?,?,?) ON CONFLICT(sender,recipient) DO NOTHING",
        )
        .run(uid(), me, recipient, body, demo ? "Demo draft" : "Pending");
    } else if (path === "/api/intro/respond") {
      const status = b.accept === true ? "Accepted" : "Declined";
      if (
        !(
          await db
            .prepare(
              "UPDATE introductions SET status=? WHERE id=? AND recipient=? AND status='Pending'",
            )
            .run(status, str(b.id, 90, true), me)
        ).changes
      )
        throw new Problem(404, "Invitation unavailable.");
    } else if (path === "/api/member/block") {
      const other = str(b.other, 90, true);
      if (other === me) throw new Problem(400, "Choose another member.");
      await profile(db, other);
      if (b.block === true) {
        await db
          .prepare("INSERT OR IGNORE INTO blocks VALUES(?,?)")
          .run(me, other);
        await db
          .prepare(
            "UPDATE introductions SET status='Closed' WHERE status='Pending' AND ((sender=? AND recipient=?) OR (sender=? AND recipient=?))",
          )
          .run(me, other, other, me);
      } else
        await db
          .prepare("DELETE FROM blocks WHERE member=? AND other=?")
          .run(me, other);
      await reconcile(db, me);
    } else if (path === "/api/circle/create") {
      const id = uid();
      const name = str(b.name, 100, true),
        topic = str(b.topic, 120, true),
        city = str(b.city, 140, true),
        summary = str(b.summary, 1000, true);
      await db.exec("BEGIN");
      try {
        await db
          .prepare("INSERT INTO circles VALUES(?,?,?,?,?,?)")
          .run(id, me, name, topic, city, summary);
        await db.prepare("INSERT INTO memberships VALUES(?,?)").run(id, me);
        await db.exec("COMMIT");
      } catch (e) {
        await db.exec("ROLLBACK");
        throw e;
      }
      return json({ id }, 201);
    } else if (
      path === "/api/circle/meeting" ||
      path === "/api/circle/moderate"
    ) {
      const id = str(b.id, 90, true);
      if (
        (await db.prepare("SELECT host FROM circles WHERE id=?").get(id))
          ?.host !== me
      )
        throw new Problem(403, "This action is for the circle host.");
      if (path.endsWith("/meeting")) {
        const start = str(b.start, 40, true);
        if (!Number.isFinite(Date.parse(start)))
          throw new Problem(400, "Choose a date and time.");
        await db
          .prepare("INSERT INTO meetings VALUES(?,?,?,?,?)")
          .run(
            uid(),
            id,
            str(b.title, 160, true),
            start,
            str(b.place, 260, true),
          );
      } else {
        const report = await db
          .prepare(
            "SELECT post FROM reports WHERE id=? AND circle=? AND status='Open'",
          )
          .get(str(b.report, 90), id);
        if (!report) throw new Problem(404, "Report unavailable.");
        if (b.hide === true)
          await db
            .prepare(
              "UPDATE posts SET body='[Removed by the circle host]' WHERE id=? AND circle=?",
            )
            .run(report.post, id);
        await db
          .prepare("UPDATE reports SET status='Reviewed' WHERE id=?")
          .run(b.report);
      }
    } else if (path === "/api/circle/report") {
      const id = str(b.id, 90, true),
        post = str(b.post, 90, true);
      if (
        !(await db
          .prepare("SELECT 1 FROM memberships WHERE member=? AND circle=?")
          .get(me, id)) ||
        !(await db
          .prepare("SELECT 1 FROM posts WHERE id=? AND circle=?")
          .get(post, id)) ||
        !(await db.prepare("SELECT 1 FROM circles WHERE id=?").get(id))
      )
        throw new Problem(404, "Report unavailable.");
      await db
        .prepare("INSERT INTO reports VALUES(?,?,?,?,?,'Open')")
        .run(uid(), id, post, me, str(b.reason, 600, true));
    } else if (path === "/api/circle/join") {
      if (!(await circleList()).some((c) => c.id === b.id))
        throw new Problem(404, "Unknown circle.");
      if (b.join)
        await db
          .prepare("INSERT OR IGNORE INTO memberships VALUES(?,?)")
          .run(b.id, me);
      else {
        if (
          (await db.prepare("SELECT host FROM circles WHERE id=?").get(b.id))
            ?.host === me
        )
          throw new Problem(409, "You host this circle.");
        await db
          .prepare("DELETE FROM memberships WHERE circle=? AND member=?")
          .run(b.id, me);
      }
    } else if (path === "/api/circle/post") {
      if (
        !(await db
          .prepare("SELECT 1 FROM memberships WHERE circle=? AND member=?")
          .get(str(b.id, 80), me))
      )
        throw new Problem(403, "Join this circle first.");
      await db
        .prepare("INSERT INTO posts VALUES(?,?,?,?,?)")
        .run(uid(), b.id, me, str(b.body, 1400, true), now());
    } else if (path === "/api/note") {
      await db
        .prepare("INSERT INTO notes VALUES(?,?,?,?,?)")
        .run(
          uid(),
          me,
          str(b.title, 160, true),
          str(b.body, 18000, true),
          now(),
        );
    } else if (path === "/api/note/remove") {
      await db
        .prepare("DELETE FROM notes WHERE id=? AND member=?")
        .run(str(b.id, 90), me);
    } else if (path === "/api/venture/new") {
      return json(
        {
          id: await newVenture(
            db,
            me,
            str(b.template, 40),
            str(b.title, 160),
            str(b.question, 2400),
          ),
        },
        201,
      );
    } else if (path === "/api/venture/join") {
      const code = str(b.code, 100, true);
      const row = await db
        .prepare("SELECT venture FROM invites WHERE code=? AND expiry>?")
        .get(code, Date.now());
      if (!row)
        throw new Problem(
          404,
          "This invitation has expired or was already used.",
        );
      await db.exec("BEGIN");
      try {
        await db
          .prepare("INSERT OR IGNORE INTO team VALUES(?,?)")
          .run(row.venture, me);
        await db.requireChange({
          sql: "DELETE FROM invites WHERE code=? AND expiry>?",
          args: [code, Date.now()],
        });
        await db.exec("COMMIT");
      } catch (e) {
        await db.exec("ROLLBACK");
        throw e;
      }
      return json({ id: row.venture });
    } else if (path.startsWith("/api/venture/")) {
      const v = await venture(db, me, str(b.id, 90, true));
      if (path.endsWith("/check")) {
        const check = await aiWork(me, "check:" + v.id, () =>
          decide(v, economics(v.model)),
        );
        const latest = await venture(db, me, v.id);
        if (JSON.stringify(v) !== JSON.stringify(latest))
          throw new Problem(
            409,
            "The venture changed during the check. Check the updated plan.",
          );
        v.check = check;
      } else if (path.endsWith("/invite")) {
        if (v.owner !== me)
          throw new Problem(403, "The venture owner can invite members.");
        const code = crypto.randomUUID();
        await db
          .prepare("INSERT INTO invites VALUES(?,?,?)")
          .run(code, v.id, Date.now() + 7 * 86400000);
        return json({ code });
      } else if (path.endsWith("/task")) {
        if (b.taskId) {
          const t = v.tasks.find((t) => t.id === b.taskId);
          if (!t) throw new Problem(404, "Task unavailable.");
          t.done = b.done === true;
        } else
          v.tasks.push({
            id: uid(),
            text: str(b.text, 400, true),
            done: false,
          });
        delete v.check;
      } else if (path.endsWith("/plan")) {
        v.title = str(b.title, 160, true);
        v.question = str(b.question, 2400, true);
        v.evidence = str(b.evidence, 4000);
        v.deadline = str(b.deadline, 10);
        v.budget = number(b.budget, 1000000);
        if (
          ![
            "Planning",
            "Testing",
            "Continue",
            "Revise",
            "Paused",
            "Finished",
          ].includes(b.status)
        )
          throw new Problem(400, "Choose a valid status.");
        v.status = b.status;
        delete v.check;
      } else if (path.endsWith("/model")) {
        const m = b.model || {};
        v.model = {
          price: number(m.price, 1e6),
          materials: number(m.materials, 1e6),
          hours: number(m.hours, 2000),
          wage: number(m.wage, 1e5),
          fixed: number(m.fixed, 1e7),
          units: number(m.units, 1e6, true),
        };
        delete v.check;
      } else if (path.endsWith("/ledger")) {
        const batch = str(b.batch, 90);
        if (
          batch &&
          (await db
            .prepare("SELECT 1 FROM ledger_batches WHERE venture=? AND batch=?")
            .get(v.id, batch))
        )
          return json(await viewVenture(me, v.id));
        const list = Array.isArray(b.rows) ? b.rows : [];
        if (!list.length || list.length > 100)
          throw new Problem(400, "Review between 1 and 100 entries.");
        const rows = list.map((r) => {
          if (!["Income", "Expense"].includes(r.kind))
            throw new Problem(400, "Choose income or expense.");
          const amount = number(r.amount, 1e7);
          if (amount <= 0)
            throw new Problem(400, "Enter an amount greater than zero.");
          const date = str(r.date, 10, true);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
            throw new Problem(400, "Enter a date.");
          const receipt = str(r.receipt, 1450000);
          if (
            receipt &&
            !/^data:(image\/(png|jpeg)|application\/pdf);base64,[a-zA-Z0-9+/=]+$/.test(
              receipt,
            )
          )
            throw new Problem(400, "Use a JPEG, PNG, or PDF receipt.");
          return {
            id: uid(),
            kind: r.kind,
            cents: Math.round(amount * 100),
            label: str(r.label, 300, true),
            date,
            receipt,
            reviewer: me,
            accepted: now(),
          };
        });
        v.entries.push(...rows);
        await db.exec("BEGIN");
        try {
          if (hosted) {
            for (const row of rows) {
              if (!row.receipt) continue;
              for (let i = 0; i < row.receipt.length; i += 32000)
                await db
                  .prepare("INSERT INTO receipt_parts VALUES(?,?,?,?)")
                  .run(
                    v.id,
                    row.id,
                    Math.floor(i / 32000),
                    row.receipt.slice(i, i + 32000),
                  );
              row.receipt = "attached";
            }
          }
          if (batch)
            await db
              .prepare("INSERT INTO ledger_batches VALUES(?,?)")
              .run(v.id, batch);
          await saveVenture(db, v);
          await db.exec("COMMIT");
        } catch (e) {
          await db.exec("ROLLBACK");
          throw e;
        }
        return json(await viewVenture(me, v.id));
      } else if (path.endsWith("/agreement")) {
        const agreement = str(b.text, 6000, true);
        if (v.agreement !== agreement) {
          v.agreement = agreement;
          v.revision++;
        }
      } else if (path.endsWith("/accept")) {
        if (!v.agreement || v.revision !== b.revision)
          throw new Problem(409, "Review the latest agreement first.");
        await db
          .prepare(
            "INSERT INTO agreements VALUES(?,?,?) ON CONFLICT(venture,member) DO UPDATE SET revision=excluded.revision",
          )
          .run(v.id, me, v.revision);
      } else if (path.endsWith("/public-preview")) {
        if (!v.publicDraft)
          throw new Problem(409, "Approve the public information first.");
        const question = str(b.question, 1200, true);
        return json(
          await aiWork(me, "preview:" + me, () =>
            customerPreview(v.publicDraft, question),
          ),
        );
      } else if (path.endsWith("/public")) {
        if (v.owner !== me)
          throw new Problem(
            403,
            "Only the owner can approve public information.",
          );
        v.publicDraft = {
          name: str(b.name, 160, true),
          offer: str(b.offer, 1200, true),
          price: str(b.price, 160),
          policy: str(b.policy, 1400),
          contact: str(b.contact, 400),
          website: str(b.website, 500),
          version: (v.publicDraft?.version || 0) + 1,
          approvedAt: now(),
          faq: str(b.faq, 2000),
        };
        await db.exec("BEGIN");
        try {
          await db
            .prepare("INSERT INTO public_versions VALUES(?,?,?,?)")
            .run(
              v.id,
              v.publicDraft.version,
              JSON.stringify(v.publicDraft),
              me,
            );
          await saveVenture(db, v);
          await db.exec("COMMIT");
        } catch (e) {
          await db.exec("ROLLBACK");
          throw e;
        }
        return json(await viewVenture(me, v.id));
      } else throw new Problem(404, "Unknown venture action.");
      await saveVenture(db, v);
      return json(await viewVenture(me, v.id));
    } else if (path === "/api/chat" || path === "/api/voice") {
      const vid = str(b.venture, 90);
      const scope = vid ? "venture:" + vid : "personal:" + me;
      const message = path === "/api/chat" ? str(b.message, 4000, true) : "";
      const context = await agentContext(me, vid, message);
      if (path === "/api/voice") {
        // SDP is a line protocol. Even the last attribute must retain its CRLF.
        str(b.sdp, 80000, true);
        const answer = await aiWork(me, "voice:" + me, async () =>
          startVoice(
            context,
            b.sdp,
            vid
              ? await history(db, scope)
              : await founderMessages(db, me, true),
            signal,
          ),
        );
        const runId = uid();
        await db
          .prepare("INSERT INTO voice_sessions VALUES(?,?,?,?)")
          .run(runId, me, scope, Date.now());
        return json({ ...answer, runId });
      }

      const result = await aiWork(me, scope, async () => {
        const revision = vid
          ? 0
          : (
              await db
                .prepare(
                  "SELECT revision FROM founder_chat_boundaries WHERE member=?",
                )
                .get(me)
            )?.revision || 0;
        const prior = vid
          ? await history(db, scope)
          : await founderMessages(db, me, true);
        const previous =
          prior.filter((t) => t.role === "user").at(-1)?.text || "";
        const shared = vid
          ? []
          : await findExperiences(
              db,
              me,
              message,
              previous + " " + (context.profile?.goal || ""),
            );
        const suggestions = shared.map((s, i) => ({
          key: "S" + (i + 1),
          topic: s.title,
          excerpt: s.excerpt,
          date: s.updated.slice(0, 10),
        }));
        const raw = await reply(
          { ...context, communityExperiences: suggestions },
          prior,
          message,
          signal,
        );
        const used = new Set(raw.usedExperiences || []);
        const peerSources = shared.filter((_, i) => used.has("S" + (i + 1)));
        const { usedExperiences, ...body } = raw;
        const answer = { ...body, peerSourceIds: peerSources.map((s) => s.id) };
        await db.exec("BEGIN");
        try {
          if (!vid)
            await db
              .prepare(
                "SELECT json(CASE WHEN coalesce((SELECT revision FROM founder_chat_boundaries WHERE member=?),0)=? THEN 'true' ELSE 'conversation changed' END)",
              )
              .run(me, revision);
          await requireExperiences(
            db,
            me,
            shared.map((s) => s.id),
          );
          await addMessage(db, scope, "user", { text: message });
          await addMessage(db, scope, "assistant", answer);
          await db.exec("COMMIT");
        } catch (e) {
          await db.exec("ROLLBACK");
          throw e;
        }
        return { ...answer, peerSources };
      });
      return json(result);
    } else if (path === "/api/voice/captions") {
      await recordVoice(db, me, str(b.runId, 90, true), b.fragments);
    } else if (path === "/api/chat/clear") {
      await db.exec("BEGIN");
      try {
        await resetInbox(db, me);
        await db
          .prepare("DELETE FROM voice_experience_lookups WHERE member=?")
          .run(me);
        await db
          .prepare(
            "INSERT INTO founder_chat_boundaries(member,last_row) VALUES(?,0) ON CONFLICT(member) DO UPDATE SET last_row=0,revision=revision+1",
          )
          .run(me);
        await db
          .prepare("DELETE FROM voice_sessions WHERE scope=?")
          .run("personal:" + me);
        await db
          .prepare("DELETE FROM messages WHERE scope=?")
          .run("personal:" + me);
        await db.exec("COMMIT");
      } catch (e) {
        await db.exec("ROLLBACK");
        throw e;
      }
    } else throw new Problem(404, "Unknown action.");
    return json({ ok: true });
  };
}
