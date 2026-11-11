import { button, esc, field, form, heading, icon, initials } from "./ui.js";
import { guidePanel } from "./member-guide.js";

const labels = {
  name: "Display name",
  skills: "Skills",
  goal: "Goal",
  days: "Working days",
  city: "Location",
};
export const memberName = (s) =>
  s.profile.name || s.account?.name || s.account?.email || "Studio member";

export function editProfileForm(s) {
  const p = s.profile;
  return form(
    "profile",
    field("name", "Display name", p.name || s.account?.name || "", {
      max: 80,
    }) +
      field("skills", "Skills you bring", p.skills, { area: true, max: 600 }) +
      field("goal", "What would you enjoy working on?", p.goal, {
        area: true,
        max: 800,
      }) +
      `<div class="cols">${field("city", "City and state", p.city, { max: 140 })}${field("days", "Preferred working days", p.days, { max: 140 })}</div>
    <label class="tick"><input name="listed" type="checkbox" ${p.listed ? "checked" : ""}>List these fields in People & circles</label>
    <p class="fine">Only the fields in this form are listed when you share your profile.</p>`,
    "Save profile",
  );
}
const briefTopics = [
  "goal",
  "experience",
  "interests",
  "role",
  "availability",
  "working style",
  "learning",
  "work constraints",
  "location",
  "preferred name",
];
export function hasBriefSource(s) {
  return (
    ["skills", "goal", "days", "city"].some((k) => s.profile[k]?.trim()) ||
    s.guide.memories.length > 0
  );
}
export function aboutYou(s, failed = false) {
  const g = s.guide,
    p = s.profile;
  const factSummary = briefTopics
    .map((t) => g.memories.find((m) => m.topic === t)?.fact)
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");
  const manual = p.goal
    ? `You described your goal as “${p.goal}”.`
    : p.skills
      ? `You listed these skills: ${p.skills}.`
      : p.days
        ? `Your preferred working days are ${p.days}.`
        : p.city
          ? `You’re based in ${p.city}.`
          : "";
  const text = g.brief.text || factSummary || manual;
  return `<div class="between"><h2>About you</h2>${icon("notebook-pen", 23)}</div>${text ? `<p class="brief-copy">${esc(text)}</p>` : `<p class="brief-copy">What would you like to do with your experience?</p><p>Tell your guide about your work or an idea you’d like to try. Your personal brief will take shape here.</p>`}
  <div class="row"><a class="link" href="#guide">Talk with my guide ${icon("arrow-right", 16)}</a>${failed ? button("retry-brief", "Retry brief", "", "link") : ""}</div>`;
}
export function knowledge(s) {
  const g = s.guide;
  const added = Object.entries(labels).filter(([key]) =>
    Boolean(s.profile[key]),
  );
  return `${added.length ? `<div class="knowledge-group"><h3>Details you added</h3><dl class="profile-fields">${added.map(([key, label]) => `<div><dt>${label}</dt><dd>${esc(s.profile[key])}</dd></div>`).join("")}</dl></div>` : ""}
  <div class="knowledge-group"><h3>From your conversations</h3>${g.memories.length ? g.memories.map((m) => `<article class="memory-item"><div class="between"><strong>${esc(m.topic)}</strong>${button("forget-memory:" + m.topic, "Forget", "", "link")}</div><p>${esc(m.fact)}</p><details><summary>What you said</summary><blockquote>${esc(m.evidence)}</blockquote></details></article>`).join("") : '<p class="muted">No conversation details saved yet.</p>'}</div>
  ${!g.memoryEnabled ? '<p class="fine">Memory is paused. Your guide leaves saved memories out of replies.</p>' : g.memoryStatus === "pending" ? '<p class="fine" role="status">Updating your profile from your conversation…</p>' : g.memoryStatus === "failed" ? button("retry-guides", "Retry memory update") : ""}`;
}
export function profilePage(s) {
  const a = s.account,
    p = s.profile,
    display = a?.name || p.name || a?.email || "Studio member";
  const signOut = s.hosted
    ? '<a class="link" href="/signout-with-chatgpt?return_to=%2F" target="_top">Sign out</a>'
    : s.registered
      ? button("signout", "Sign out", "", "link")
      : button("register", "Create preview sign-in", "", "link") +
        button("signin", "Sign in", "", "link");
  return (
    heading("Personal workspace", "My profile", "") +
    `<div class="profile-identity"><div class="avatar profile-avatar">${esc(initials(display))}</div><div class="identity-details"><h2>${esc(display)}</h2>${a?.email && display !== a.email ? `<p>${esc(a.email)}</p>` : ""}<span class="meta">${icon("lock-keyhole", 14)} ${s.hosted ? "Signed in with ChatGPT" : "Local development profile"}</span></div>${signOut}</div>
    <div class="profile-layout"><div class="stack"><section id="profile-brief" class="panel profile-brief">${aboutYou(s)}</section>
    <section class="panel stack"><div class="between"><h2>What your guide knows</h2>${icon("audio-lines", 21)}</div><div id="guide-memories" class="stack">${knowledge(s)}</div></section></div>
    <aside class="stack profile-aside"><section class="panel stack"><h3>Member profile</h3><p class="fine">${p.listed ? "Your chosen profile fields are listed in People & circles." : "Your member profile is private."}</p>${button("edit-profile", "Edit profile details", "pencil")}</section>
    ${guidePanel(s)}<section class="panel stack"><h3>Private data</h3>${button("export-data", "Export my workspace", "download")}${button("clear-chat", "Clear private conversation", "trash-2", "quiet")}${s.blocked.length ? "<h3>Blocked members</h3>" + s.blocked.map((p) => button("unblock:" + p.id, "Unblock " + p.name)).join("") : ""}</section></aside></div>`
  );
}
