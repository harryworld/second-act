import { shareActions } from "./peer-memory.js";
import { api, button, esc, field, form, modal, icon } from "./ui.js";

const speaker = (role) => (role === "assistant" ? "Guide" : "You");
const stamp = (date) =>
  new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
const sourceAction = (act, id, label) =>
  `<button type="button" class="link" data-act="${act}" data-source="${esc(id)}">${esc(label)}</button>`;
export function rememberTurn(id) {
  return sourceAction("memory-from-turn", id, "Remember this turn");
}
export function memoryPanel(guide) {
  const items = guide.conversationItems || [];
  return `<section class="panel stack"><div class="between"><h2>Conversation memory</h2>${icon("book-open", 22)}</div>
 <p class="fine">Search your private voice and text history. Save a passage as a reference or tell your guide how to help in future conversations.</p><div>${button("memory-browse", "Browse conversations", "message-circle")}</div>
 ${[
   ["instruction", "Guide instructions"],
   ["reference", "References"],
 ]
   .map(([kind, title]) => {
     const list = items.filter((x) => x.kind === kind);
     return `<div class="knowledge-group"><h3>${title}</h3>${list.length ? list.map((x) => `<article class="memory-item"><p>${esc(x.content)}</p>${x.state === "suggested" ? '<span class="tag">Suggested · review before use</span>' : ""}<details><summary>Source · ${speaker(x.source_role)} · ${esc(stamp(x.source_date))}</summary><blockquote>${esc(x.quote)}</blockquote>${sourceAction("memory-source", x.source_id, "View conversation turn")}</details><div class="row">${button("memory-edit:" + x.id, x.state === "suggested" ? "Review instruction" : "Edit", "", "link")}${button("memory-forget:" + x.id, x.state === "suggested" ? "Dismiss" : "Forget", "", "link")}</div>${x.kind === "reference" && x.state === "active" && x.source_role === "user" ? shareActions(guide, "reference", x.id) : ""}</article>`).join("") : `<p class="fine">${kind === "instruction" ? "Your guide can suggest standing instructions when you describe how you want it to help." : "Named resources and decisions you share can appear here with their original wording."}</p>`}</div>`;
   })
   .join("")}</section>`;
}
let searchTerm = "",
  pages = [null],
  serial = 0;
export async function browseMemory(query = "", page = 0) {
  const ticket = ++serial;
  if (page === 0) {
    searchTerm = query;
    pages = [null];
  }
  const params = new URLSearchParams({ q: searchTerm });
  if (pages[page]) params.set("before", pages[page]);
  const result = await api("memory/history?" + params);
  if (ticket !== serial) return;
  if (result.next) pages[page + 1] = result.next;
  modal(
    "Conversation history",
    `<div class="stack">${form("search-memory", field("q", "Search founder conversations", searchTerm, { max: 160 }), "Search")}<div class="stack">${result.turns.length ? result.turns.map((t) => `<article class="panel"><strong class="legend">${speaker(t.role)} · ${esc(stamp(t.created))}${t.voiceRun ? " · Voice" : ""}</strong><p class="chat-text">${esc(t.text)}</p>${sourceAction("memory-source", t.id, "Open turn")}</article>`).join("") : '<p class="muted">No matching turns.</p>'}</div><div class="row">${page > 0 ? button("memory-page:" + (page - 1), "Newer turns") : ""}${result.next ? button("memory-page:" + (page + 1), "Older turns") : ""}</div></div>`,
  );
}
export function memoryPage(page) {
  return browseMemory(searchTerm, page);
}
export async function showTurn(id) {
  const t = await api("memory/source?id=" + encodeURIComponent(id));
  modal(
    "Conversation turn",
    `<div class="stack"><span class="meta">${speaker(t.role)} · ${esc(stamp(t.created))}</span><p class="saved-note">${esc(t.text)}</p><div class="row">${sourceAction("memory-from-turn", t.id, "Save as instruction or reference")}${button("memory-browse", "Back to history", "", "link")}</div></div>`,
  );
}
export async function promoteTurn(id) {
  const t = await api("memory/source?id=" + encodeURIComponent(id)),
    excerpt = t.text.trim().slice(0, 1200);
  modal(
    "Remember this turn",
    form(
      "save-turn-memory",
      `<input type="hidden" name="sourceId" value="${esc(t.id)}"><label class="field"><span>Use as</span><select name="kind"><option value="reference">Reference for future replies</option><option value="instruction">Instruction for my guide</option></select></label><details><summary>Original turn · ${speaker(t.role)}</summary><p class="saved-note">${esc(t.text)}</p></details>${field("quote", "Supporting passage (exact words)", excerpt, { area: true, required: true, max: 1400 })}${field("content", "What should your guide remember?", excerpt, { area: true, required: true, max: 1200 })}`,
      "Save memory",
    ),
  );
}
export function editItem(x) {
  modal(
    x.state === "suggested" ? "Review guide instruction" : "Edit memory",
    form(
      "change-turn-memory",
      `<input type="hidden" name="id" value="${esc(x.id)}"><blockquote class="saved-note">${esc(x.quote)}</blockquote>${field("content", x.kind === "instruction" ? "Instruction for your guide" : "Reference", x.content, { area: true, required: true, max: 1200 })}`,
      x.state === "suggested" ? "Use this instruction" : "Save change",
    ),
  );
}
