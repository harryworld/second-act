import { templates, samples, circles, lessons } from "./catalog.js";
import {
  esc,
  icon,
  button,
  tag,
  field,
  form,
  heading,
  empty,
  api,
  modal,
  dlg,
  toast,
  initials,
  download,
  rich,
  money,
} from "./ui.js";
import {
  templateCard,
  openTemplate,
  venturesPage,
  venturePage,
  editPlan,
  ledgerForm,
  exportLedger,
  parseLedger,
  metrics,
} from "./ventures.js";
import { connections } from "./member-guide.js";
import {
  profilePage,
  editProfileForm,
  knowledge,
  aboutYou,
  hasBriefSource,
  memberName,
} from "./profile.js";
import {
  openVoice,
  endVoice,
  voiceTurns,
  currentVoice,
  voiceEvents,
  playVoice,
  flushOnExit,
} from "./voice.js";

const $ = (s) => document.querySelector(s);
const nav = [
  ["home", "My workbench", "layout-dashboard"],
  ["guide", "Founder guide", "audio-lines"],
  ["people", "People & circles", "users"],
  ["ventures", "My ventures", "sprout"],
  ["learn", "Learning library", "book-open"],
  ["saved", "Saved work", "bookmark"],
  ["profile", "My profile", "user-round"],
];
let s,
  detail = null,
  route = [],
  epoch = 0,
  csvRows = [],
  discussion = null,
  search = "",
  peopleTab = "people",
  pending = null,
  chatError = "";
const drafts = new Map();
const profileName = () => memberName(s);
const routeId = () => route[0] || "home";
const guideScope = () => (routeId() === "guide" ? route[1] || "" : "");
const navigate = (hash) => {
  if (location.hash === "#" + hash) render();
  else location.hash = hash;
};
const guideMsgs = () => (guideScope() ? detail?.messages || [] : s.messages);
const getPerson = (id) => [...s.people, ...samples].find((p) => p.id === id);
function sidebar(page) {
  const current = page === "venture" ? "ventures" : page;
  const links = (arr) =>
    arr
      .map(
        ([k, n, i]) =>
          `<a class="nav-link ${k === current ? "active" : ""}" ${k === current ? 'aria-current="page"' : ""} href="#${k}">${icon(i)}${n}</a>`,
      )
      .join("");
  $("#sidebar").innerHTML =
    `<a class="brand" href="#home"><img src="/mark.svg" alt=""><strong>Second Act</strong></a><div class="side-label">Workspace</div><nav class="side-nav" aria-label="Workspace">${links(nav.slice(0, 5))}</nav><div class="side-label">Personal</div><nav class="side-nav" aria-label="Personal">${links(nav.slice(5))}</nav><a class="side-footer" href="#profile"><span class="avatar">${esc(initials(profileName()))}</span><span><strong>${esc(profileName())}</strong><small>Member workspace</small></span>${icon("chevron-right", 16)}</a>`;
  const label = nav.find((n) => n[0] === current)?.[1] || "My workbench";
  $("#bar").innerHTML =
    `<div class="crumbs"><button class="menu-toggle" data-act="menu" aria-label="Open navigation">${icon("menu")}</button><span>Member studio</span>${icon("chevron-right", 13)}<strong>${label}</strong></div><div class="bar-actions"><span class="top-date">${icon("calendar-days", 16)}${new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span><button data-act="size" aria-label="Change text size" title="Change text size" class="icon-btn text-size">Aa</button></div>`;
  document.title = "Second Act · " + label;
}
function composer(home = false) {
  return `<form class="composer" data-form="chat"><label class="sr-only" for="message">Message your guide</label><input id="message" name="message" placeholder="${home ? "Ask your founder guide…" : "Write a message…"}" autocomplete="off" maxlength="4000" required value="${esc(drafts.get(guideScope()) || "")}" ${pending ? "disabled" : ""}>${!home ? '<button type="button" class="icon-btn" data-act="voice" aria-label="Start a voice conversation">' + icon("mic") + "</button>" : ""}<button class="send" aria-label="Send message" ${pending ? "disabled" : ""}>${icon("arrow-right", 23)}</button></form>`;
}
const starts = [
  [
    "people",
    "Find your people",
    "Meet collaborators with complementary skills.",
    "users",
    "",
  ],
  [
    "ventures",
    "Start a venture",
    "Shape an idea into a small, practical trial.",
    "sprout",
    "clay",
  ],
  [
    "learn",
    "Learn by doing",
    "Build a skill while you work on your idea.",
    "book-open",
    "gold",
  ],
];
function home() {
  const returning = s.ventures[0];
  return `<div class="page-head home-head"><div><div class="overline">Member workspace</div><h1>Your workbench</h1><p>${s.profile.name ? "Welcome back, " + esc(s.profile.name) + "." : "Welcome to Second Act."} Pick up an idea, a conversation, or a piece of work.</p></div></div>
 <section class="hero" aria-label="Founder guide"><div class="hero-copy"><div class="hero-label">${icon("audio-lines", 21)} Your founder guide</div><h2>What would you enjoy<br>working on?</h2><p>Let’s turn your experience into a small business you’d love to be part of.</p>${composer(true)}<button class="hero-voice" data-act="voice">${icon("mic", 16)} Talk with your guide</button></div><figure class="hero-photo"><img src="/art/portland-linen-studio.jpg" alt="Two makers review a linen tote pattern at their studio cutting table."><figcaption>${icon("map-pin", 14)} The makers’ table · Portland, OR</figcaption></figure></section>
 ${
   returning
     ? `<section class="section guide-banner"><div><span class="overline">Pick up where you left off</span><h3>${esc(returning.title)}</h3><p>${returning.tasks.filter((t) => t.done).length} of ${returning.tasks.length} trial tasks complete</p></div><a class="secondary" href="#venture/${returning.id}">Open venture ${icon("arrow-right", 16)}</a></section>`
     : s.messages.length
       ? `<section class="section guide-banner"><div><span class="overline">Last conversation</span><h3>Continue with your founder guide</h3><p>${esc(
           s.messages
             .filter((m) => m.role === "user")
             .at(-1)
             ?.text.slice(0, 130),
         )}</p></div><a href="#guide" class="secondary">Continue ${icon("arrow-right", 16)}</a></section>`
       : ""
 }
 <section class="section"><div class="section-title"><h2>Where to next?</h2></div><div class="route-grid">${starts.map(([href, title, desc, i, cl]) => `<a class="route-card" href="#${href}"><span class="tile-icon ${cl}">${icon(i, 21)}</span>${icon("arrow-up-right", 16)}<span><h3>${title}</h3><p>${desc}</p></span></a>`).join("")}</div></section>
 <section class="section"><div class="section-title"><h2>Ideas from the studio</h2><a class="link" href="#ventures">Explore ventures ${icon("arrow-right", 15)}</a></div><div class="cards">${templates.map(templateCard).join("")}</div></section>`;
}
function chat() {
  const vid = guideScope(),
    msgs = guideMsgs(),
    busy = pending?.scope === vid;
  const suggestions = vid
    ? ["Help us price this offer.", "What should we test next?"]
    : [
        "What could I do with my experience?",
        "Help me find collaborators.",
        "Plan a one-week mending trial.",
      ];
  const live = currentVoice()?.venture === vid ? currentVoice() : null;
  return `<div class="chat-wrap">${heading(vid ? "Shared venture conversation" : "Private conversation", vid ? "Venture guide" : "Founder guide", vid ? detail.venture.title + " · Visible to venture members." : "Explore an idea at your own pace. Your founder conversation is private.", "")}
 ${!vid && s.guide?.exchanges.some((x) => x.status === "ready") ? button("open-connections", "Review guide connections", "handshake", "link") : ""}
 <div class="chat-list" id="conversation-messages">${!msgs.length && !busy && !live ? `<div id="guide-welcome" class="panel stack"><span class="tile-icon">${icon("audio-lines")}</span><h2>${vid ? "What does the team need next?" : "What do you miss about your work?"}</h2><p>Tell me a little about it, or choose a question to get started.</p><div class="row">${suggestions.map((p, i) => `<button class="secondary" data-act="prompt" data-prompt="${esc(p)}">${esc(p)}</button>`).join("")}</div></div>` : ""}
 ${msgs
   .map((m, i) =>
     live?.id && live.id === m.voiceRun
       ? ""
       : `<article class="chat-message ${m.role === "assistant" ? "assistant" : "user"}"><strong class="legend">${m.role === "assistant" ? "Second Act guide" : vid ? "Team member" : "You"}${m.voiceRun ? " · Voice" : ""}</strong><p class="chat-text">${rich(m.text)}</p>${(
           m.sources || []
         )
           .filter((x) => x.url.startsWith("https://"))
           .map(
             (x) =>
               `<a class="source" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>`,
           )
           .join(
             "",
           )}${m.role === "assistant" ? `<div class="row">${m.proposal ? button("proposal:" + i, { experiment: "Review experiment", profile: "Review profile suggestion", note: "Review draft", people: "Explore collaborators", pricing: "Open pricing", task: "Review task" }[m.proposal.type] || "Review suggestion", "pencil") : ""}${button("save-message:" + i, "Save reply", "bookmark", "quiet")}</div>` : ""}${m.voiceRun && msgs[i + 1]?.voiceRun !== m.voiceRun ? button("save-transcript:" + i, "Save transcript as a note", "notebook-pen", "link") : ""}</article>`,
   )
   .join("")}
 <div id="voice-messages" class="chat-list"></div>
 ${busy ? `<div class="chat-message user"><strong class="legend">You</strong><p class="chat-text">${esc(pending.message)}</p></div><p class="pending" role="status">${icon("audio-lines")} Your guide is thinking…</p>` : ""}</div>
 <div class="chat-compose">${chatError ? `<p class="error" role="alert">${esc(chatError)}</p>` : ""}<div id="voice-bar" class="voice-bar" hidden><span class="voice-led"></span><span id="voice-status" role="status"></span><button data-act="voice-play" class="link" hidden>Play guide audio</button></div>${composer()}</div></div>`;
}
function matchReason(p) {
  const user = s.profile;
  const dayList = (x) =>
    x
      .toLowerCase()
      .split(/[,;\s]+/)
      .filter((x) =>
        [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday",
        ].includes(x),
      );
  const overlap = dayList(user.days).filter((d) => dayList(p.days).includes(d));
  return (
    [
      user.city && user.city.toLowerCase() === p.city.toLowerCase()
        ? "Same location as you."
        : "",
      overlap.length ? "Available on " + overlap.join(", ") + "." : "",
      p.skills ? "Brings " + p.skills.toLowerCase() + "." : "",
    ]
      .filter(Boolean)
      .join(" ") || "Open the profile to compare interests."
  );
}
function peopleRows() {
  const list = [
    ...s.people.map((p) => ({ ...p, demo: false })),
    ...samples.map((p) => ({ ...p, demo: true })),
  ].filter((p) =>
    [p.name, p.city, p.skills, p.days, p.goal]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const score = (p) =>
    (!p.demo ? 2 : 0) +
    (p.city && p.city.toLowerCase() === s.profile.city.toLowerCase() ? 1 : 0) +
    (matchReason(p).includes("Available on ") ? 1 : 0);
  return (
    list
      .sort((a, b) => score(b) - score(a))
      .map(
        (p) =>
          `<div class="card person"><header><span class="avatar">${esc(initials(p.name))}</span><div><h3>${esc(p.name)}</h3><span class="fine">${p.demo ? "Example member" : "Community member"}</span></div></header><p class="meta">${icon("map-pin", 15)} ${esc(p.city || "Location unlisted")}</p><p>${esc(p.goal)}</p><div class="why"><strong class="legend">What you might share</strong><p>${esc(matchReason(p))}</p></div>${button("person:" + p.id, "View profile", "arrow-right")}</div>`,
      )
      .join("") ||
    empty("search", "No matches yet", "Try another skill, city or working day.")
  );
}
function people() {
  const tabs = [
    ["people", "People"],
    ["circles", "Working circles"],
    ["intros", "Introductions"],
    ["guides", "Guide connections"],
  ];
  const shell =
    heading(
      "Community",
      "People & circles",
      "Find complementary skills and a pace that works for you.",
    ) +
    `<nav class="tabs" aria-label="Community views">${tabs.map(([k, l]) => `<button data-act="people-tab:${k}" class="tab ${peopleTab === k ? "active" : ""}">${l}</button>`).join("")}</nav>`;
  if (peopleTab === "guides")
    return shell + `<div id="guide-connections">${connections(s.guide)}</div>`;
  if (peopleTab === "circles")
    return (
      shell +
      `<div class="section-title"><h2>Working circles</h2>${button("create-circle", "Host a circle", "plus")}</div><div class="cols">${s.circles.map((c) => `<section class="card"><img class="circle-img" src="/art/${c.image}" alt=""><span class="micro">${esc(c.topic)}</span><h3>${esc(c.name)}</h3><p>${esc(c.summary)}</p><div class="row">${s.memberships.includes(c.id) ? button("discussion:" + c.id, "Open discussion", "message-circle", "primary") + (c.host === s.member ? tag("You host") : button("circle-leave:" + c.id, "Leave circle")) : button("circle-join:" + c.id, "Join circle", "plus")}</div></section>`).join("")}</div>`
    );
  if (peopleTab === "intros")
    return (
      shell +
      `<div class="stack">${s.intros.length ? s.intros.map((i) => `<div class="panel stack"><div class="between"><h3>${i.sender === s.member ? "To " + esc(i.recipientName) : "From " + esc(i.senderName)}</h3>${tag(i.status)}</div><p class="note-body">${esc(i.body)}</p>${i.status === "Pending" && i.recipient === s.member ? `<div class="row">${button("intro-accept:" + i.id, "Accept introduction", "check")}${button("intro-decline:" + i.id, "Decline")}</div>` : ""}</div>`).join("") : empty("handshake", "No introductions yet", "Review an introduction from a member profile to get started.")}</div>`
    );
  return (
    shell +
    `<label class="field"><span>Search people</span><input id="people-search" type="search" placeholder="Try a skill, city or day of the week" value="${esc(search)}"></label><p class="fine">Members choose what to share. Example profiles let you practice an introduction.</p><section class="section cards" id="people-grid">${peopleRows()}</section>`
  );
}
function library() {
  return (
    heading(
      "Learning library",
      "Learn by doing",
      "Short lessons for the work in front of you.",
    ) +
    `<div class="cards">${lessons.map((l, i) => `<article class="card stack"><span class="tile-icon ${["", "clay", "gold"][i]}">${icon(["calculator", "lightbulb", "handshake"][i])}</span><span class="micro">${l.kind} · ${l.minutes} min</span><h3>${l.name}</h3><p>${l.description}</p>${button("lesson:" + l.id, "Open lesson", "arrow-right")}</article>`).join("")}</div>`
  );
}
function saved() {
  return (
    heading(
      "Private collection",
      "Saved work",
      "Your notes, voice transcripts and saved guide replies.",
      button("new-note", "Write a note", "plus"),
    ) +
    `<div class="stack">${s.notes.length ? s.notes.map((n) => `<article class="panel stack"><div class="between"><h3>${esc(n.title)}</h3><span class="fine">${new Date(n.created).toLocaleDateString()}</span></div><p class="note-body">${rich(n.body)}</p><div class="row">${button("note-download:" + n.id, "Download", "download", "quiet")}${button("note-delete:" + n.id, "Delete", "trash-2", "quiet")}</div></article>`).join("") : empty("bookmark", "Keep your useful work here", "Save a guide reply, a voice conversation or a note of your own.")}</div>`
  );
}
async function refresh() {
  s = await api("workspace");
}
async function render() {
  const id = ++epoch,
    previous = route.join("/");
  route = location.hash.slice(1).split("/").filter(Boolean);
  const page = routeId();
  const live = currentVoice();
  if (live && (page !== "guide" || guideScope() !== live.venture))
    endVoice().catch((e) => toast(e.message));
  if (id > 1 && route.join("/") !== previous) {
    document.body.classList.remove("nav-open");
    if (dlg().open) dlg().close();
    window.scrollTo(0, 0);
  }
  sidebar(page);
  try {
    if (page === "venture" || (page === "guide" && route[1])) {
      const newDetail = await api(
        "venture?id=" + encodeURIComponent(route[1] || ""),
      );
      if (id !== epoch) return;
      detail = newDetail;
    } else detail = null;
    if (page === "profile") {
      const own = await api("me/profile");
      if (id !== epoch) return;
      Object.assign(s, own);
      sidebar(page);
    } else if (["people", "guide"].includes(page)) {
      const g = await api("guide");
      if (id !== epoch) return;
      s.guide = g;
    }
    const views = {
      home,
      guide: chat,
      people,
      ventures: () => venturesPage(s),
      venture: () => venturePage(detail, s.member, route[2] || "plan"),
      learn: library,
      saved,
      profile: () => profilePage(s),
    };
    $("#main").innerHTML = (views[page] || home)();
    if (page === "guide") drawVoice();
    if (page === "profile") updateBrief();
    if (
      page === "guide" &&
      (pending || chatError || s.messages.length || route[1])
    )
      requestAnimationFrame(() =>
        $(".chat-compose")?.scrollIntoView({ block: "nearest" }),
      );
  } catch (e) {
    if (id === epoch)
      $("#main").innerHTML = empty(
        "circle-help",
        "Workspace unavailable",
        e.message,
        '<a class="secondary" href="#home">Back to workbench</a>',
      );
  }
}
async function update(message) {
  await refresh();
  if (dlg().open) dlg().close();
  await render();
  if (message) toast(message);
}
function authorize(title, copy, label, action) {
  modal(
    title,
    `<div class="stack"><p>${esc(copy)}</p><div class="row">${button(action, label, "check", "primary")}${button("close", "Cancel")}</div></div>`,
  );
}
async function sendChat(message) {
  const scope = guideScope();
  if (pending || !message.trim()) return;
  pending = { scope, message };
  drafts.set(scope, "");
  chatError = "";
  if (routeId() !== "guide") navigate("guide");
  else await render();
  try {
    await endVoice();
    await api("chat", { message, venture: scope });
    await refresh();
  } catch (e) {
    drafts.set(scope, message);
    chatError = e.message;
  } finally {
    pending = null;
    if (routeId() === "guide") await render();
  }
}
let voiceFrame = 0;
function drawVoice() {
  const bar = $("#voice-bar"),
    mic = $('.composer [data-act="voice"]');
  if (!bar || !mic || routeId() !== "guide") return;
  const v = currentVoice(),
    active = v && v.venture === guideScope();
  const label = active
    ? v.unsaved
      ? "Retry saving voice"
      : "End voice"
    : "Start live voice";
  mic.disabled =
    !!pending || !!(v && !active) || !!(active && v.ending && !v.unsaved);
  mic.setAttribute("aria-label", label);
  mic.title = label;
  mic.setAttribute("aria-pressed", String(!!active));
  mic.innerHTML = icon(active ? "square" : "mic", 20);
  bar.hidden = !active;
  const welcome = $("#guide-welcome");
  if (welcome) welcome.hidden = !!active;
  if (!active) return;
  if ($("#voice-status").textContent !== v.status)
    $("#voice-status").textContent = v.status;
  bar.querySelector("button").hidden = !v.playBlocked;
  const target = $("#voice-messages");
  if (target) {
    const follow =
      window.innerHeight + window.scrollY >=
      document.documentElement.scrollHeight - 150;
    const lines = voiceTurns(v);
    target.innerHTML = lines
      .map(
        (m) =>
          `<article class="chat-message ${m.role}"><strong class="legend">${m.role === "assistant" ? "Second Act guide" : "You"} · Voice</strong><p class="chat-text">${esc(m.text)}</p></article>`,
      )
      .join("");
    if (follow && lines.length)
      $(".chat-compose")?.scrollIntoView({ block: "nearest" });
  }
}
voiceEvents.addEventListener("change", () => {
  if (!voiceFrame)
    voiceFrame = requestAnimationFrame(() => {
      voiceFrame = 0;
      drawVoice();
    });
});
voiceEvents.addEventListener("finished", ({ detail: v }) => {
  const messages = !v.venture
    ? s.messages
    : detail?.venture.id === v.venture
      ? detail.messages
      : null;
  if (messages)
    messages.splice(
      0,
      messages.length,
      ...messages.filter((m) => !v.id || m.voiceRun !== v.id),
      ...voiceTurns(v),
    );
  if (routeId() === "guide" && guideScope() === v.venture) {
    const focused = document.activeElement?.id === "message";
    const pos = focused ? $("#message").selectionStart : null;
    const template = document.createElement("template");
    template.innerHTML = chat();
    $("#conversation-messages")?.replaceChildren(
      ...template.content.querySelector("#conversation-messages").childNodes,
    );
    drawVoice();
    if (focused && $("#message")) $("#message").setSelectionRange(pos, pos);
    if (v.result !== "Voice ended.") toast(v.result);
  }
});
function noteForm(title = "", body = "") {
  modal(
    "Review private note",
    form(
      "note",
      field("title", "Title", title, { required: true, max: 160 }) +
        field("body", "Note", body, { area: true, required: true, max: 18000 }),
      "Save note",
    ),
  );
}
async function openDiscussion(id) {
  discussion = id;
  const { posts, meetings, reports, host } = await api(
    "circle?id=" + encodeURIComponent(id),
  );
  const isHost = host === s.member;
  modal(
    s.circles.find((c) => c.id === id).name,
    `<div class="stack"><p class="fine">Visible to members of this circle.</p>
 ${meetings.length ? "<h3>Scheduled sessions</h3>" + meetings.map((m) => `<div class="panel"><strong>${esc(m.title)}</strong><p>${esc(new Date(m.start).toLocaleString())} · ${esc(m.place)}</p></div>`).join("") : ""}
 ${isHost ? button("schedule", "Schedule a session", "calendar-days") : ""}
 ${isHost && reports.length ? "<h3>Host review</h3>" + reports.map((r) => `<div class="panel stack"><p>${esc(r.body)}</p><p class="fine">Report: ${esc(r.reason)}</p><div class="row">${button("mod-hide:" + r.id, "Remove post")}${button("mod-keep:" + r.id, "Keep post")}</div></div>`).join("") : ""}
 ${form("post", field("body", "Share with the circle", "", { area: true, required: true, max: 1400 }), "Post to circle")}
 ${posts.map((p) => `<div class="panel"><strong>${esc(p.name)}</strong><p class="note-body">${esc(p.body)}</p>${host && p.member !== s.member ? button("report:" + p.id, "Report to host", "", "link") : ""}</div>`).join("") || '<p class="muted">Start the first discussion.</p>'}</div>`,
  );
}
function acct(mode) {
  modal(
    mode === "register" ? "Create your sign-in" : "Sign in to your workspace",
    form(
      "account",
      '<input type="hidden" name="mode" value="' +
        mode +
        '">' +
        field("login", "Username", "", { required: true, max: 80 }) +
        field("password", "Passphrase (10 or more characters)", "", {
          type: "password",
          required: true,
          max: 160,
        }) +
        (mode === "signin"
          ? '<p class="fine">This browser will switch to the account you sign in to. Register your current workspace first if you want to return to it.</p>'
          : ""),
      mode === "register" ? "Create sign-in" : "Sign in",
    ),
  );
}
async function click(id, el) {
  const [act, key] = id.split(":");
  const v = detail?.venture;
  switch (act) {
    case "menu":
      document.body.classList.toggle("nav-open");
      return;
    case "edit-profile":
      modal("Edit profile details", editProfileForm(s));
      return;
    case "retry-brief":
      attemptedBrief = "";
      updateBrief();
      return;
    case "size":
      document.body.classList.toggle("large");
      localStorage.setItem(
        "sa-large",
        document.body.classList.contains("large") ? "1" : "0",
      );
      toast("Text size changed.");
      return;
    case "close":
      dlg().close();
      return;
    case "voice":
      if (currentVoice()) {
        await endVoice();
        return;
      }
      if (pending) return;
      if (routeId() !== "guide") navigate("guide");
      chatError = "";
      await openVoice(guideScope());
      return;
    case "voice-play":
      await playVoice();
      return;
    case "prompt":
      await sendChat(el.dataset.prompt);
      return;
    case "proposal": {
      const p = guideMsgs()[Number(key)]?.proposal;
      if (!p) return;
      if (p.type === "task" && v) {
        modal(
          "Review venture task",
          form(
            "new-task",
            field("text", "Task", p.title, { required: true, max: 400 }) +
              '<p class="fine">' +
              esc(p.details) +
              "</p>",
            "Add to shared checklist",
          ),
        );
      } else if (p.type === "experiment") openTemplate("mending", p);
      else if (p.type === "people") navigate("people");
      else if (p.type === "pricing")
        navigate(v ? "venture/" + v.id + "/pricing" : "ventures");
      else if (p.type === "profile") {
        modal(
          "Review your profile goal",
          form(
            "goal",
            field("goal", "Personal goal", p.details.slice(0, 800), {
              area: true,
              max: 800,
            }) +
              (s.profile.listed
                ? '<label class="tick"><input type="checkbox" name="listed"> Keep my profile listed and share this updated goal</label>'
                : '<p class="fine">Your profile is private.</p>'),
            "Save to my profile",
          ),
        );
      } else noteForm(p.title, p.details);
      return;
    }
    case "save-transcript": {
      const run = guideMsgs()[Number(key)]?.voiceRun;
      if (run)
        noteForm(
          "Voice conversation",
          guideMsgs()
            .filter((m) => m.voiceRun === run)
            .map(
              (m) =>
                (m.role === "assistant"
                  ? "Guide"
                  : guideScope()
                    ? "Team member"
                    : "You") +
                ": " +
                m.text,
            )
            .join("\n\n"),
        );
      return;
    }
    case "save-message":
      noteForm(
        "Founder guide · " + new Date().toLocaleDateString(),
        guideMsgs()[Number(key)].text,
      );
      return;
    case "template":
      openTemplate(key);
      return;
    case "open-connections":
      peopleTab = "guides";
      navigate("people");
      return;
    case "retry-guides":
      await api("guide/retry", {});
      await update("Your guide will retry.");
      return;
    case "forget-memory":
      await api("guide/forget", { topic: key });
      await update(
        "Memory forgotten. The original conversation is still in your history.",
      );
      return;
    case "people-tab":
      peopleTab = key;
      await render();
      return;
    case "person": {
      const p = getPerson(key);
      const demo = key.startsWith("sample-");
      const old = s.intros.find(
        (x) => x.recipient === key && x.sender === s.member,
      );
      modal(
        p.name,
        `<div class="stack">${tag(demo ? "Example member" : "Community member")}<p>${esc(p.goal)}</p><div><strong>Skills</strong><p>${esc(p.skills || "Unlisted")}</p></div><div><strong>Location & availability</strong><p>${esc(p.city || "Unlisted")} · ${esc(p.days || "Days unlisted")}</p></div><p class="fine">${esc(matchReason(p))} Discuss compensation and responsibilities together.</p>${old ? tag(old.status) : button("intro:" + p.id, demo ? "Practice an introduction" : "Draft introduction", "mail", "primary")}${!demo ? button("block:" + p.id, "Block this member", "", "quiet") : ""}</div>`,
      );
      return;
    }
    case "block":
      authorize(
        "Block this member?",
        "This hides you from one another in the directory and closes pending introduction requests.",
        "Block member",
        "block-confirm:" + key,
      );
      return;
    case "block-confirm":
    case "unblock":
      await api("member/block", { other: key, block: act === "block-confirm" });
      await update("Member preference saved.");
      return;
    case "create-circle":
      modal(
        "Host a working circle",
        form(
          "circle-create",
          field("name", "Circle name", "", { required: true, max: 100 }) +
            field("topic", "Shared interest", "", {
              required: true,
              max: 120,
            }) +
            field("city", "Location", "", { required: true, max: 140 }) +
            field("summary", "What will members do together?", "", {
              area: true,
              required: true,
              max: 1000,
            }) +
            '<p class="fine">Other members on this server can discover and join your circle. As host, you can schedule sessions and review reported posts.</p>',
          "Create circle",
        ),
      );
      return;
    case "schedule":
      modal(
        "Schedule a circle session",
        form(
          "meeting",
          field("title", "Session title", "", { required: true, max: 160 }) +
            field("start", "Local date and time", "", {
              type: "datetime-local",
              required: true,
            }) +
            field("place", "Meeting place or link", "", {
              required: true,
              max: 260,
            }),
          "Share with circle",
        ),
      );
      return;
    case "report":
      modal(
        "Report this post",
        form(
          "report",
          '<input name="post" type="hidden" value="' +
            esc(key) +
            '">' +
            field("reason", "What should the host review?", "", {
              area: true,
              required: true,
              max: 600,
            }),
          "Send to circle host",
        ),
      );
      return;
    case "mod-hide":
    case "mod-keep":
      await api("circle/moderate", {
        id: discussion,
        report: key,
        hide: act === "mod-hide",
      });
      await openDiscussion(discussion);
      return;
    case "intro": {
      const p = getPerson(key);
      if (!s.profile.name) {
        dlg().close();
        navigate("profile");
        toast("Add your display name, then return to the introduction.");
        return;
      }
      modal(
        "Review introduction",
        form(
          "intro",
          `<input type="hidden" name="recipient" value="${esc(key)}"><p>From <strong>${esc(profileName())}</strong> to <strong>${esc(p.name)}</strong></p>${field("body", "Message", "Hi " + p.name.split(" ")[0] + ", I’d enjoy comparing ideas for a small project. Would you like to talk?", { area: true, required: true, max: 1400 })}<p class="fine">${key.startsWith("sample-") ? "This is a practice introduction. It will be saved as a demo draft." : "This request will appear in this member’s workspace for them to accept or decline."}</p>`,
          key.startsWith("sample-") ? "Save demo draft" : "Send introduction",
        ),
      );
      return;
    }
    case "intro-accept":
    case "intro-decline":
      await api("intro/respond", { id: key, accept: act === "intro-accept" });
      await update("Introduction updated.");
      return;
    case "circle-join":
    case "circle-leave":
      await api("circle/join", { id: key, join: act === "circle-join" });
      await update(
        act === "circle-join"
          ? "You joined the circle."
          : "You left the circle.",
      );
      return;
    case "discussion":
      await openDiscussion(key);
      return;
    case "lesson": {
      const l = lessons.find((x) => x.id === key);
      modal(
        l.name,
        `<div class="stack"><span class="overline">${l.kind} · ${l.minutes} min</span><h3>Explain it</h3><p>${l.body}</p><h3>Show me</h3><p>${l.example}</p><div>${button("lesson-guide:" + l.id, "Do it with me", "audio-lines", "primary")}</div></div>`,
      );
      return;
    }
    case "lesson-guide": {
      dlg().close();
      await sendChat(lessons.find((x) => x.id === key).prompt);
      return;
    }
    case "join-venture":
      modal(
        "Join a venture",
        form(
          "join",
          field("code", "Single-use invitation code", "", {
            required: true,
            max: 100,
          }) +
            '<p class="fine">Joining gives you access to the venture’s shared conversations, agreements and records.</p>',
          "Join venture",
        ),
      );
      return;
    case "venture-chat":
      navigate("guide/" + v.id);
      return;
    case "edit-plan":
      editPlan(v);
      return;
    case "task": {
      const t = v.tasks.find((t) => t.id === key);
      await api("venture/task", { id: v.id, taskId: key, done: !t.done });
      await update();
      return;
    }
    case "check": {
      el.textContent = "Checking plan…";
      try {
        await api("venture/check", { id: v.id });
        await update("Quick judgment ready.");
      } finally {
        if (el.isConnected) el.textContent = "Check this plan";
      }
      return;
    }
    case "accept":
      await api("venture/accept", { id: v.id, revision: v.revision });
      await update("Your acceptance is recorded.");
      return;
    case "invite": {
      const data = await api("venture/invite", { id: v.id });
      modal(
        "Invite a collaborator",
        `<div class="stack"><p>Share this single-use code with someone you trust to see this venture’s plan, conversations and records. It expires in seven days.</p>${field("invite", "Invitation code", data.code)}<p class="fine">They can enter it under My ventures → Join with a code on this server.</p></div>`,
      );
      return;
    }
    case "ledger-add":
      ledgerForm();
      return;
    case "ledger-export":
      exportLedger(v);
      return;
    case "ledger-import":
      modal(
        "Import records for review",
        form(
          "import-preview",
          `<label class="field"><span>CSV file (up to 100 records)</span><input type="file" name="csv" accept=".csv,text/csv" required></label><p class="fine">Use the columns date, kind, label, amount. Use Income or Expense and dates in YYYY-MM-DD format.</p>`,
          "Preview entries",
        ),
      );
      return;
    case "receipt": {
      const r = v.entries.find((x) => x.id === key);
      if (!r?.receipt) return;
      const receipt =
        r.receipt === "attached"
          ? (
              await api(
                "receipt?id=" +
                  encodeURIComponent(v.id) +
                  "&entry=" +
                  encodeURIComponent(r.id),
              )
            ).receipt
          : r.receipt;
      const [head, data] = receipt.split(",");
      const mime = head.slice(5, -7);
      download(
        "receipt." +
          { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" }[
            mime
          ],
        Uint8Array.from(atob(data), (c) => c.charCodeAt(0)),
        mime,
      );
      return;
    }
    case "public-export":
      download(
        "approved-business-profile.json",
        JSON.stringify(v.publicDraft, null, 2),
        "application/json",
      );
      return;
    case "new-note":
      noteForm();
      return;
    case "note-download": {
      const n = s.notes.find((x) => x.id === key);
      download("second-act-note.txt", n.title + "\n\n" + n.body);
      return;
    }
    case "note-delete":
      authorize(
        "Delete this note?",
        "This removes the note from your private saved work.",
        "Delete note",
        "delete-confirm:" + key,
      );
      return;
    case "delete-confirm":
      await api("note/remove", { id: key });
      await update("Note deleted.");
      return;
    case "register":
    case "signin":
      acct(act);
      return;
    case "signout":
      await endVoice();
      await api("signout", {});
      location.hash = "home";
      location.reload();
      return;
    case "clear-chat":
      authorize(
        "Clear your founder conversation?",
        "This removes the conversation history your private founder guide uses. Saved notes are separate.",
        "Clear conversation",
        "clear-confirm",
      );
      return;
    case "clear-confirm":
      await endVoice();
      await api("chat/clear", {});
      await update("Private conversation cleared.");
      return;
    case "export-data": {
      const ventures = structuredClone(s.ventures);
      for (const v of ventures)
        for (const e of v.entries)
          if (e.receipt === "attached")
            e.receipt = (
              await api(
                "receipt?id=" +
                  encodeURIComponent(v.id) +
                  "&entry=" +
                  encodeURIComponent(e.id),
              )
            ).receipt;
      download(
        "second-act-workspace.json",
        JSON.stringify(
          {
            account: s.account,
            profile: s.profile,
            messages: s.messages,
            guide: s.guide,
            notes: s.notes,
            ventures,
          },
          null,
          2,
        ),
        "application/json",
      );
      return;
    }
  }
}
async function submit(type, f) {
  const fd = new FormData(f),
    b = Object.fromEntries(fd),
    v = detail?.venture;
  switch (type) {
    case "chat":
      await sendChat(String(b.message));
      return;
    case "new-venture": {
      const r = await api("venture/new", b);
      await refresh();
      dlg().close();
      navigate("venture/" + r.id);
      return;
    }
    case "join": {
      const r = await api("venture/join", b);
      await refresh();
      dlg().close();
      navigate("venture/" + r.id);
      return;
    }
    case "guide-settings":
      await api("guide/settings", {
        memory: fd.has("memory"),
        outreach: fd.has("outreach"),
      });
      await update("Guide preferences saved.");
      return;
    case "profile":
      await api("profile", { ...b, listed: fd.has("listed") });
      await update("Profile saved.");
      return;
    case "goal":
      await api("profile", {
        ...s.profile,
        goal: b.goal,
        listed: fd.has("listed"),
      });
      await update("Goal saved to your profile.");
      return;
    case "account":
      await endVoice();
      await api("account", b);
      await update(
        b.mode === "register" ? "Your sign-in is ready." : "Signed in.",
      );
      return;
    case "intro":
      await api("intro", b);
      peopleTab = "intros";
      await update("Introduction saved.");
      return;
    case "circle-create": {
      const r = await api("circle/create", b);
      await update("Circle created.");
      await openDiscussion(r.id);
      return;
    }
    case "meeting":
      await api("circle/meeting", {
        ...b,
        id: discussion,
        start: new Date(b.start).toISOString(),
      });
      await openDiscussion(discussion);
      toast("Session added.");
      return;
    case "report":
      await api("circle/report", { ...b, id: discussion });
      await openDiscussion(discussion);
      toast("Sent for host review.");
      return;
    case "post":
      await api("circle/post", { id: discussion, body: b.body });
      await openDiscussion(discussion);
      toast("Posted to the circle.");
      return;
    case "note":
      await api("note", b);
      await update("Saved to your private collection.");
      return;
    case "new-task":
      await api("venture/task", { id: v.id, text: b.text });
      break;
    case "plan":
      await api("venture/plan", { ...b, budget: Number(b.budget), id: v.id });
      break;
    case "model":
      await api("venture/model", {
        id: v.id,
        model: Object.fromEntries(
          Object.entries(b).map(([k, n]) => [k, Number(n)]),
        ),
      });
      break;
    case "agreement":
      await api("venture/agreement", { id: v.id, text: b.text });
      break;
    case "customer-preview": {
      const answer = document.querySelector("#customer-answer");
      answer.textContent = "Preparing a local preview…";
      try {
        const r = await api("venture/public-preview", {
          id: v.id,
          question: b.question,
        });
        answer.textContent = r.answer;
      } catch (e) {
        answer.textContent = "";
        throw e;
      }
      return;
    }
    case "public":
      await api("venture/public", { id: v.id, ...b });
      break;
    case "ledger": {
      let receipt = "";
      if (b.receipt?.size) {
        if (b.receipt.size > 1048576) throw Error("Use a receipt under 1 MB.");
        receipt = await new Promise((yes, no) => {
          const r = new FileReader();
          r.onload = () => yes(r.result);
          r.onerror = () => no(Error("Cannot read that receipt."));
          r.readAsDataURL(b.receipt);
        });
      }
      await api("venture/ledger", {
        id: v.id,
        batch: (f.dataset.batch ||= crypto.randomUUID()),
        rows: [{ ...b, amount: Number(b.amount), receipt }],
      });
      break;
    }
    case "import-preview": {
      if (b.csv.size > 300000) throw Error("Use a CSV under 300 KB.");
      csvRows = parseLedger(await b.csv.text());
      modal(
        "Review imported entries",
        form(
          "import-accept",
          `<p>Accept these ${csvRows.length} records into the shared ledger.</p><div class="stack">${csvRows.map((r) => `<div class="list-row"><div><strong>${esc(r.label)}</strong><p>${esc(r.date)} · ${r.kind}</p></div>${money(r.amount)}</div>`).join("")}</div>`,
          "Accept reviewed entries",
        ),
      );
      return;
    }
    case "import-accept":
      await api("venture/ledger", {
        id: v.id,
        batch: (f.dataset.batch ||= crypto.randomUUID()),
        rows: csvRows,
      });
      csvRows = [];
      break;
    default:
      return;
  }
  await update("Venture updated.");
}
document.addEventListener("click", async (e) => {
  if (
    document.body.classList.contains("nav-open") &&
    !e.target.closest("#sidebar,.menu-toggle")
  ) {
    document.body.classList.remove("nav-open");
    return;
  }
  if (e.target.closest("#sidebar a"))
    document.body.classList.remove("nav-open");
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  e.preventDefault();
  el.disabled = true;
  try {
    await click(el.dataset.act, el);
  } catch (err) {
    toast(err.message);
  } finally {
    el.disabled = false;
  }
});
document.addEventListener("submit", async (e) => {
  const f = e.target.closest("[data-form]");
  if (!f) return;
  e.preventDefault();
  const sb = f.querySelector('button[type="submit"], button.send');
  if (sb?.disabled) return;
  if (sb) sb.disabled = true;
  try {
    await submit(f.dataset.form, f);
  } catch (err) {
    const error = f.querySelector(".form-error");
    if (error) error.textContent = err.message;
    else toast(err.message);
  } finally {
    if (sb) sb.disabled = false;
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "message") drafts.set(guideScope(), e.target.value);
  if (e.target.id === "people-search") {
    search = e.target.value;
    $("#people-grid").innerHTML = peopleRows();
  }
  if (e.target.closest('[data-form="model"]')) {
    const m = Object.fromEntries(
      [...new FormData(e.target.form)].map(([k, n]) => [k, Number(n)]),
    );
    const unit =
        Math.round(m.price * 100) -
        Math.round(m.materials * 100) -
        Math.round(m.hours * m.wage * 100),
      fixed = Math.round(m.fixed * 100);
    $("#metrics").innerHTML = metrics({
      contribution: unit / 100,
      result: (unit * m.units - fixed) / 100,
      breakEven: unit > 0 ? Math.ceil(fixed / unit) : null,
    });
  }
});
dlg().addEventListener("close", () => {
  csvRows = [];
});
window.addEventListener("pagehide", flushOnExit);
window.addEventListener("hashchange", () => {
  if (s) render();
});
let attemptedBrief = "";
async function updateBrief() {
  const node = $("#profile-brief");
  if (
    !node ||
    !s.guide.memoryEnabled ||
    s.guide.memoryStatus === "pending" ||
    s.guide.brief.text ||
    !hasBriefSource(s)
  )
    return;
  const member = s.member,
    revision = s.guide.brief.revision,
    key = member + ":" + revision;
  if (attemptedBrief === key) return;
  attemptedBrief = key;
  try {
    const brief = await api("profile/brief", {});
    if (
      s.member !== member ||
      s.guide.brief.revision !== brief.revision ||
      !s.guide.memoryEnabled
    )
      return;
    if (brief.text) {
      s.guide.brief = brief;
      if ($("#profile-brief")) $("#profile-brief").innerHTML = aboutYou(s);
    }
  } catch {
    if (
      s.member === member &&
      s.guide.brief.revision === revision &&
      $("#profile-brief")
    )
      $("#profile-brief").innerHTML = aboutYou(s, true);
  }
}
let pollingGuide = false;
setInterval(async () => {
  if (
    !s ||
    pollingGuide ||
    document.hidden ||
    !($("#guide-memories") || $("#guide-connections"))
  )
    return;
  pollingGuide = true;
  try {
    const member = s.member,
      g = await api("guide");
    if (s.member !== member) return;
    if (JSON.stringify(s.guide) === JSON.stringify(g)) return;
    s.guide = g;
    const memories = $("#guide-memories"),
      pairs = $("#guide-connections");
    if (memories) {
      memories.innerHTML = knowledge(s);
      $("#profile-brief").innerHTML = aboutYou(s);
      updateBrief();
    }
    if (pairs) pairs.innerHTML = connections(g);
  } catch {
    /* A later poll can recover without interrupting a form. */
  } finally {
    pollingGuide = false;
  }
}, 3500);
document.body.classList.toggle(
  "large",
  localStorage.getItem("sa-large") === "1",
);
try {
  s = await api("open", {});
  await render();
} catch (e) {
  $("#main").innerHTML =
    e.status === 401
      ? empty(
          "lock-keyhole",
          "Sign in to Second Act",
          "Use your ChatGPT account to open your profile.",
          '<a class="primary" href="/signin-with-chatgpt?return_to=%2F%23profile" target="_top">Continue with ChatGPT</a>',
        )
      : empty(
          "circle-help",
          "Could not open your workspace",
          e.message,
          '<a class="secondary" href="/">Try again</a>',
        );
}
