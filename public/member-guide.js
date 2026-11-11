import { esc, button, form, tag, empty } from "./ui.js";

export function memoryList(g) {
  const items = g.memories
    .map(
      (m) =>
        `<div class="memory-item"><div class="between"><strong>${esc(m.topic)}</strong>${button("forget-memory:" + m.topic, "Forget", "", "link")}</div><p>${esc(m.fact)}</p><details><summary>What you said</summary><p>“${esc(m.evidence)}”</p></details></div>`,
    )
    .join("");
  const status =
    g.memoryStatus === "pending"
      ? "Updating from your conversation…"
      : g.memoryStatus === "failed"
        ? "The last update could not finish."
        : "";
  return `${items || '<p class="fine">As you talk, your guide can remember skills, goals, working hours and preferences you mention.</p>'}${status ? `<p class="fine" role="status">${status}</p>` : ""}${g.memoryStatus === "failed" ? button("retry-guides", "Retry update") : ""}`;
}
export function guidePanel(s) {
  const g = s.guide;
  return `<section class="panel stack"><h2>Your personal guide</h2>${form("guide-settings", `<label class="tick"><input name="memory" type="checkbox" ${g.memoryEnabled ? "checked" : ""}> Remember details from my private conversations</label><p class="fine">Your guide uses these memories in future voice and text replies. Pausing stops new memories and leaves saved ones out of replies.</p><label class="tick"><input name="outreach" type="checkbox" ${g.outreach ? "checked" : ""} ${s.profile.listed ? "" : "disabled"}> Let my guide talk with other members’ guides</label><p class="fine">${s.profile.listed ? "Guides use your listed skills, interests, location and working days. Your chats, private memories and venture records stay private." : "List your profile above to enable guide introductions."} You review any introduction.</p>`, "Save guide preferences")}<h3>Private memory</h3><div class="stack" id="guide-memories">${memoryList(g)}</div></section>`;
}
export function connections(g) {
  if (!g.outreach)
    return empty(
      "handshake",
      "Let your guide look for collaborators",
      "List your profile and enable guide introductions in My profile. Your guide can then discuss a trial with another member’s guide.",
      '<a class="secondary" href="#profile">Open my profile</a>',
    );
  if (!g.exchanges.length)
    return empty(
      "users",
      "Waiting for another participating member",
      "Your guide will look for a connection when another member enables guide introductions on this server.",
    );
  return `<div class="stack">${g.exchanges.map((x) => `<article class="panel stack"><div class="between"><h3>${esc(x.name)}</h3>${tag(x.status === "ready" ? "Guides have compared notes" : x.status === "failed" ? "Needs retry" : "In discussion")}</div>${x.pitch ? `<div><strong>${esc(x.first ? "Your guide" : x.name + "’s guide")}</strong><p>${esc(x.pitch.message)}</p></div>` : ""}${x.response ? `<div><strong>${esc(x.first ? x.name + "’s guide" : "Your guide")}</strong><p>${esc(x.response.message)}</p></div><div class="check-result"><strong>${x.response.fit === "pass" ? "Why the guides suggest waiting" : "An idea to consider"}</strong>${esc(x.response.idea)}</div>${button("person:" + x.peer, "Review member & introduction", "arrow-right")}` : x.status === "failed" ? button("retry-guides", "Retry discussion") : '<p class="fine">The guides are exploring a fit using your shared profiles.</p>'}</article>`).join("")}</div>`;
}
