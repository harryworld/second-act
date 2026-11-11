import {
  api,
  button,
  esc,
  icon,
  field,
  form,
  modal,
  dlg,
  rich,
  toast,
} from "./ui.js";
import { conversationMessageBody } from "./conversation-markdown.js";
import {
  currentVoice,
  openVoice,
  endVoice,
  voiceEvents,
  voiceTurns,
  playVoice,
} from "./voice.js";

let state = null,
  typing = false,
  draft = "",
  error = "",
  leaving = false,
  revision = 0;
const here = () => location.hash.split("/")[0] === "#sophie";
const root = () => document.querySelector("#story-content");
const label = (m) => (m.role === "user" ? "Sophie" : "Founder guide");
export function storyLink() {
  return (
    '<a class="secondary story-link" href="#sophie">Try Sophie’s story ' +
    icon("arrow-right", 16) +
    "</a>"
  );
}
function landing() {
  return `<section class="hero visitor-hero"><div class="hero-copy"><div class="hero-label">${icon("book-open")} Interactive demo</div><h1>Sophie’s first pet care store</h1><p>Step into Sophie’s shoes. Work through her first retail decisions with a guide that can draw on Harry’s five years running a flower shop.</p><div class="row visitor-actions">${button("story-start", "Enter as Sophie", "arrow-right", "primary")}</div><p class="story-fine">Sophie and Harry are fictional. Your visit has its own conversation.</p></div><figure class="hero-photo"><img src="/art/studio.webp" alt="A sunlit neighborhood workshop"></figure></section>`;
}
function log() {
  const live = currentVoice()?.story ? currentVoice() : null;
  const saved = state.messages;
  const messages = live
    ? [...saved.filter((m) => m.voiceRun !== live.id), ...voiceTurns(live)]
    : saved;
  if (!messages.length && !typing && !live)
    return `<article class="panel stack"><h2>What would you like your store to do for pet owners?</h2><p>Tell your guide about your idea, or start with a question.</p><div class="row">${button("story-prompt", "What should I test first?", "message-circle")}</div></article>`;
  return (
    messages
      .map(
        (m) =>
          `<article class="chat-message ${m.role}"><strong class="legend">${label(m)}${m.voiceRun ? " · Voice" : ""}</strong>${conversationMessageBody(m)}${(
            m.storySources || []
          )
            .map((id) => state.memories.find((n) => n.id === id))
            .filter(Boolean)
            .map(
              (note) =>
                `<details class="peer-evidence"><summary>From Harry’s flower-shop experience</summary><strong>${esc(note.title)}</strong><blockquote>${esc(note.excerpt)}</blockquote></details>`,
            )
            .join("")}</article>`,
      )
      .join("") +
    (typing
      ? `<article class="chat-message user"><strong class="legend">Sophie</strong><p class="chat-text">${esc(draft)}</p></article><p class="pending" role="status">Your guide is thinking…</p>`
      : "")
  );
}
function meeting() {
  const m = state.mentor;
  if (!m) return "";
  return `<aside class="panel story-match"><span class="tile-icon">${icon("handshake")}</span><div><span class="overline">Suggested introduction</span><h2>Meet Harry</h2><p>${esc(m.why)}</p><p class="fine">${esc(m.role)} · Fictional story member</p>${state.introduction ? `<details><summary>Your introduction draft</summary><p class="note-body">${esc(state.introduction)}</p></details>` : ""}${button("story-intro", state.introduction ? "Edit practice introduction" : "Review introduction", "mail")}</div></aside>`;
}
function workspace() {
  return `<div class="page-head"><div><div class="overline">Sophie’s story · Demo</div><h1>Sophie’s founder guide</h1><p>You’re exploring how to open a pet care store.</p></div>${button("story-profile", "Sophie’s profile", "user-round")}</div>
 <div class="chat-wrap"><div id="story-log" class="chat-list">${log()}</div><div id="story-meeting">${meeting()}</div><div class="chat-compose"><div id="story-status" role="status"></div>${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}<form class="composer" data-form="story-chat"><label class="sr-only" for="story-message">Message as Sophie</label><input id="story-message" name="message" maxlength="2000" required placeholder="Message your guide as Sophie…" value="${esc(typing ? "" : draft)}" ${typing ? "disabled" : ""}><button type="button" class="icon-btn" data-act="story-voice" aria-label="Start story voice">${icon("mic")}</button><button class="send" aria-label="Send as Sophie" ${typing ? "disabled" : ""}>${icon("arrow-right")}</button></form></div></div>`;
}
function draw() {
  const target = root();
  if (!here() || !target) return;
  target.innerHTML = state?.active ? workspace() : landing();
  drawVoice();
}
function drawVoice() {
  if (!here() || !state?.active) return;
  const call = currentVoice(),
    live = call?.story ? call : null;
  const status = document.querySelector("#story-status"),
    mic = document.querySelector('[data-act="story-voice"]');
  if (status)
    status.innerHTML = live
      ? `<span class="meta"><i class="voice-led"></i> ${esc(live.status)} ${live.playBlocked ? button("story-play", "Play audio", "", "link") : ""}</span>`
      : "";
  if (mic) {
    mic.disabled = typing || (!live && state.voiceUsed);
    mic.setAttribute(
      "aria-label",
      live ? "End story voice" : "Start story voice",
    );
    mic.title = live
      ? "End voice"
      : state.voiceUsed
        ? "Story call used"
        : "Start voice";
    mic.innerHTML = icon(live ? "square" : "mic");
  }
  if (live && document.querySelector("#story-log"))
    document.querySelector("#story-log").innerHTML = log();
}
voiceEvents.addEventListener("change", drawVoice);
voiceEvents.addEventListener("finished", async ({ detail: call }) => {
  if (!call.story || leaving || !here()) return;
  const seq = ++revision;
  try {
    const next = await api("story/session");
    if (seq !== revision || !here() || typing) return;
    state = next;
    draw();
    if (call.result !== "Voice ended.") toast(call.result);
  } catch (e) {
    toast(e.message);
  }
});
voiceEvents.addEventListener("story-introduction", async () => {
  if (!here()) return;
  try {
    const next = await api("story/session");
    if (here() && next.active && next.mentor && state?.active) {
      state.mentor = next.mentor;
      const panel = document.querySelector("#story-meeting");
      if (panel) panel.innerHTML = meeting();
    }
  } catch {
    /* The saved suggestion is also loaded when the call ends. */
  }
});
export async function renderStory() {
  const seq = ++revision;
  const next = await api("story/session");
  if (!here() || seq !== revision) return;
  state = next;
  draw();
}
export function storyInput(el) {
  if (el.id === "story-message") draft = el.value;
}
async function send(message) {
  if (typing || !message?.trim()) return;
  typing = true;
  draft = message;
  error = "";
  draw();
  try {
    await endVoice();
    state = await api("story/chat", { message });
    draft = "";
  } catch (e) {
    error = e.message;
  } finally {
    typing = false;
    revision++;
    draw();
    if (here())
      document
        .querySelector(".chat-compose")
        ?.scrollIntoView({ block: "nearest" });
  }
}
export async function storyAction(act) {
  if (act === "story-start") {
    state = await api("story/start", {});
    draft = "";
    error = "";
    draw();
    return;
  }
  if (act === "story-exit") {
    leaving = true;
    try {
      await endVoice();
      await api("story/exit", {});
      revision++;
      state = null;
      draft = "";
      error = "";
      location.hash = "home";
    } finally {
      leaving = false;
    }
    return;
  }
  if (act === "story-prompt") {
    await send("I want to open a pet care store. What should I test first?");
    return;
  }
  if (act === "story-voice") {
    if (typing) return;
    if (currentVoice()) await endVoice();
    else await openVoice("", true);
    return;
  }
  if (act === "story-play") {
    await playVoice();
    return;
  }
  if (act === "story-profile") {
    modal(
      "Sophie’s profile",
      `<div class="stack"><span class="tag">Story character</span><h2>Sophie</h2><p>You want to start a pet care store. Your guide can help you test the idea, plan a first offer and learn from an experienced shop owner.</p><h3>Experience your guide can draw on</h3><p>Harry opened his flower shop five years ago. These are his recorded memories in this fictional story.</p>${state.memories.map((n) => `<details><summary>${esc(n.title)}</summary><blockquote>${esc(n.excerpt)}</blockquote></details>`).join("")}</div>`,
    );
    return;
  }
  if (act === "story-intro" && state.mentor) {
    modal(
      "Introduction to Harry",
      form(
        "story-intro",
        `<p>From Sophie to Harry · Practice draft</p>${field("message", "What would you like to ask Harry?", state.introduction || "Hi Harry, I’m exploring a pet care store. " + state.mentor.question + " Would you have time for a short conversation?", { area: true, max: 1200, required: true })}<p class="fine">This draft stays in your demo visit.</p>`,
        "Save practice introduction",
      ),
    );
    return;
  }
}
export async function storySubmit(type, f) {
  const b = Object.fromEntries(new FormData(f));
  if (type === "story-chat") await send(String(b.message || ""));
  if (type === "story-intro") {
    state = await api("story/intro", b);
    dlg().close();
    draw();
    toast("Practice introduction saved.");
  }
}
