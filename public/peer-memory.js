import { button, esc, field, form, modal } from "./ui.js";
export function shareActions(guide, origin, key) {
  const shared = guide.sharedExperiences?.find(
    (x) => x.origin === origin && x.source_key === key,
  );
  const suffix = origin + ":" + encodeURIComponent(key);
  return `<div class="row">${button("peer-share-" + suffix, shared ? "Edit shared excerpt" : "Share an experience", "", "link")}${shared ? button("peer-withdraw:" + shared.id, "Stop sharing", "", "link") : ""}</div>`;
}
export function reviewShare(guide, origin, key) {
  const source =
    origin === "fact"
      ? guide.memories.find((x) => x.topic === key)?.fact
      : guide.conversationItems.find(
          (x) =>
            x.kind === "reference" && x.source_role === "user" && x.id === key,
        )?.content;
  if (!source) throw Error("This memory is no longer available.");
  const previous = guide.sharedExperiences?.find(
    (x) => x.origin === origin && x.source_key === key,
  );
  modal(
    "Share an experience",
    form(
      "peer-share",
      `<input type="hidden" name="origin" value="${esc(origin)}"><input type="hidden" name="key" value="${esc(key)}"><input type="hidden" name="expectedId" value="${esc(previous?.id || "")}"><input type="hidden" name="original" value="${esc(source)}"><p>Other signed-in members’ founder guides can quote this topic and excerpt when they answer a relevant question. Your account name and private conversation stay private.</p>${field("title", "Topic", previous?.title || "", { required: true, max: 90 })}${field("excerpt", "Exact wording to share", previous?.excerpt || source.slice(0, 600), { area: true, required: true, max: 600 })}<p class="fine">You can stop sharing at any time. People may keep replies they already received.</p>`,
      previous ? "Update shared excerpt" : "Share with member guides",
    ),
  );
}
export function peerSources(items, voice = false) {
  if (!items?.length) return "";
  return `<details class="peer-evidence"><summary>${voice ? "Member experiences consulted in this call" : "Member experience used in this reply"}</summary>${items.map((s) => `<div><strong>${esc(s.title)}</strong><blockquote>${esc(s.excerpt)}</blockquote><small>Shared by another member · ${esc(s.updated.slice(0, 10))}</small></div>`).join("")}</details>`;
}
