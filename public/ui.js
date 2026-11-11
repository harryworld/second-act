export const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const icon = (name, size = 20) =>
  `<svg aria-hidden="true" class="icon" width="${size}" height="${size}" viewBox="0 0 24 24"><use href="/icons.svg#${name}"/></svg>`;
export const money = (v) =>
  Number(v).toLocaleString("en-US", { style: "currency", currency: "USD" });
export const date = () =>
  new Date().toLocaleDateString("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
export const initials = (s) =>
  (s || "Studio member")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x.charAt(0))
    .join("")
    .toUpperCase();
export const button = (id, label, ic = "", cl = "secondary") =>
  `<button class="${cl}" data-act="${esc(id)}">${ic ? icon(ic, 18) : ""}${esc(label)}</button>`;
export const field = (name, label, value = "", opts = {}) =>
  `<label class="field"><span>${esc(label)}</span>${opts.area ? `<textarea name="${name}" maxlength="${opts.max || 2400}" ${opts.required ? "required" : ""}>${esc(value)}</textarea>` : `<input name="${name}" value="${esc(value)}" type="${opts.type || "text"}" ${opts.required ? "required" : ""} ${opts.type === "number" ? 'min="0" step="' + (opts.step || "0.01") + '" max="' + (opts.max || 1000000) + '"' : 'maxlength="' + (opts.max || 600) + '"'}>`}</label>`;
export const tag = (s) => `<span class="tag">${esc(s)}</span>`;
export const heading = (eyebrow, title, desc, extra = "") =>
  `<div class="page-head"><div><div class="overline">${esc(eyebrow)}</div><h1>${esc(title)}</h1>${desc ? `<p>${esc(desc)}</p>` : ""}</div>${extra}</div>`;
export const empty = (ic, title, desc, action = "") =>
  `<div class="empty">${icon(ic, 32)}<h3>${esc(title)}</h3><p>${esc(desc)}</p>${action}</div>`;
export const form = (id, body, submit) =>
  `<form data-form="${id}" class="stack">${body}<div class="form-error" role="alert"></div><div><button class="primary" type="submit">${esc(submit)} ${icon("arrow-right", 17)}</button></div></form>`;
export async function api(path, body, signal) {
  const r = await fetch(
    "/api/" + path,
    body === undefined
      ? { signal }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal,
        },
  );
  const data = await r.json().catch(() => ({}));
  if (!r.ok)
    throw Object.assign(
      new Error(data.error || "The request could not be completed."),
      { status: r.status },
    );
  return data;
}
export function toast(msg) {
  const el = document.querySelector("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 4400);
}
export const dlg = () => document.querySelector("#dialog");
export function modal(title, body) {
  const el = dlg();
  el.innerHTML = `<header class="dialog-head"><h2>${esc(title)}</h2><button data-act="close" class="icon-btn" aria-label="Close dialog">${icon("x")}</button></header><div class="dialog-body">${body}</div>`;
  if (!el.open) el.showModal();
}
export function download(file, data, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function rich(text) {
  const parts = String(text || "").split(/(https?:\/\/[^\s<>()\]]+)/g);
  return parts
    .map((p) =>
      /^https?:\/\//.test(p)
        ? `<a href="${esc(p)}" target="_blank" rel="noopener noreferrer">${esc(p)}</a>`
        : esc(p),
    )
    .join("");
}
