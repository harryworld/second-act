import { button, esc, icon, modal } from "./ui.js";
import { templates } from "./catalog.js";
import { templateCard } from "./ventures.js";

export const signInLink = (route = "home") =>
  "/signin-with-chatgpt?return_to=" + encodeURIComponent("/#" + route);
const signIn = (route, label = "Continue with ChatGPT", style = "primary") =>
  `<a class="${style}" href="${esc(signInLink(route))}" target="_top">${esc(label)}</a>`;
export function publicBar() {
  return `<a class="brand" href="#home"><img src="/mark.svg" alt=""><strong>Second Act</strong></a><nav aria-label="Public studio" class="row"><a class="link public-library" href="#learn">Learning library</a>${signIn("home", "Sign in", "secondary")}</nav>`;
}
export function publicHome() {
  return `<section class="hero visitor-hero"><div class="hero-copy"><div class="hero-label">${icon("sprout", 21)} Second Act studio</div><h1>What would you enjoy working on?</h1><p>Turn your experience into a small business. Find people to work with, learn from other founders, and try an idea at your own pace.</p><div class="row visitor-actions">${signIn("guide", "Meet your founder guide")}${button("public-explore", "Explore ideas", "arrow-right", "quiet")}</div></div><figure class="hero-photo"><img src="/art/portland-linen-studio.jpg" alt="Two makers reviewing a linen pattern at their studio table."><figcaption>${icon("map-pin", 14)} The makers’ table · Portland, OR</figcaption></figure></section>
 <section class="section" id="public-ideas"><div class="section-title"><h2>Ideas from the studio</h2><a class="link" href="#learn">Learning library ${icon("arrow-right", 15)}</a></div><div class="cards">${templates.map(templateCard).join("")}</div></section>`;
}
export function privateGate(route, label) {
  return `<section class="panel stack sign-in-panel"><span class="tile-icon">${icon("lock-keyhole")}</span><h1>${esc(label)}</h1><p>Sign in with ChatGPT to open your private Second Act workspace.</p><div class="row">${signIn(route)}<a class="link" href="#home">Back to the studio</a></div></section>`;
}
export function previewStarter(id) {
  const t = templates.find((v) => v.id === id);
  if (!t) return;
  modal(
    t.title,
    `<div class="stack"><img class="circle-img" src="/art/${esc(t.image)}" alt="${esc(t.alt)}"><p>${esc(t.intro)}</p><h3>What you could test</h3><p>${esc(t.question)}</p><ol>${t.steps.map((step) => `<li>${esc(step)}</li>`).join("")}</ol><div>${signIn("starter/" + t.id, "Sign in to start this venture")}</div></div>`,
  );
}
