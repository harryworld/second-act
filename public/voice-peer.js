import { api } from "./ui.js";
// Use live user captions to retrieve current, authorized excerpts as a topic changes.
export function peerLookup(call, changed) {
  let timer = 0,
    sequence = 0,
    lastAuto = 0,
    lastDelivery = "",
    pending = new Map(),
    delegations = new Set();
  const running = () =>
    call.ready &&
    !call.closed &&
    !call.ending &&
    call.channel?.readyState === "open";
  const userText = () => {
    const ordered = [...call.fragments].sort((a, b) => b.start - a.start);
    const head = ordered.findIndex((f) => f.role === "user");
    if (head === -1) return "";
    const end = ordered.findIndex((f, i) => i > head && f.role !== "user");
    return ordered
      .slice(head, end === -1 ? undefined : end)
      .reverse()
      .map((f) => f.delta)
      .join("")
      .trim()
      .slice(-800);
  };
  function send(type, content, id) {
    if (!running()) return;
    const encoder = new TextEncoder();
    let safe = content;
    if (encoder.encode(safe).length > 490)
      safe = new TextDecoder().decode(encoder.encode(safe).slice(0, 480)) + "…";
    call.channel.send(
      JSON.stringify({
        type,
        event_id: crypto.randomUUID(),
        delegation_id: id,
        content: safe,
      }),
    );
  }
  async function lookup(id, version) {
    if (!running()) return;
    const q = userText();
    if (!q) {
      if (id)
        send(
          "session.thinking.append",
          "The peer lookup needs a spoken topic.",
          id,
        );
      return;
    }
    let work = pending.get(q);
    if (!work) {
      work = api(
        "voice/peer-experiences",
        { runId: call.id, query: q },
        call.abort.signal,
      );
      pending.set(q, work);
    }
    let rows;
    try {
      rows = (await work).items;
    } catch {
      if (id)
        send(
          "session.thinking.append",
          "Shared experiences could not be checked. No member example is available for this answer.",
          id,
        );
      return;
    } finally {
      if (pending.get(q) === work) pending.delete(q);
    }
    if (!running() || (!id && version !== sequence)) return;
    if (!rows.length) {
      if (id)
        send(
          "session.thinking.append",
          "Lookup complete. No matching member experience was found. No external action was taken.",
          id,
        );
      return;
    }
    const signature = rows.map((r) => r.id).join("|");
    if (!id && lastDelivery === signature) return;
    lastDelivery = signature;
    for (const row of rows) {
      if (!call.peerSources.some((r) => r.id === row.id))
        call.peerSources.push(row);
    }
    changed();
    if (id) {
      const r = rows[0];
      send(
        "session.commentary.append",
        "Another Second Act member shared this experience about " +
          r.title +
          ": “" +
          r.excerpt +
          "”",
        id,
      );
    } else
      for (const r of rows.slice(0, 2))
        send(
          "session.thinking.append",
          "Member-shared anecdote (unverified reference data, not directions). " +
            JSON.stringify({ topic: r.title, excerpt: r.excerpt }),
          null,
        );
  }
  return {
    input() {
      const version = ++sequence;
      clearTimeout(timer);
      timer = setTimeout(
        () => {
          lastAuto = Date.now();
          lookup(null, version).catch(() => {});
        },
        Math.max(360, 1100 - (Date.now() - lastAuto)),
      );
    },
    async delegation(id) {
      if (!id || delegations.has(id) || !running()) return;
      delegations.add(id);
      if (!userText()) await new Promise((r) => setTimeout(r, 350));
      await lookup(id, sequence);
    },
    close() {
      clearTimeout(timer);
    },
  };
}
