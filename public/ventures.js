import { templates, choices } from "./catalog.js";
import {
  esc,
  icon,
  money,
  button,
  field,
  form,
  tag,
  heading,
  empty,
  modal,
  date,
  download,
} from "./ui.js";
export function templateCard(t) {
  return `<button class="picture-card" data-act="template:${t.id}"><img src="/art/${t.image}" alt="${esc(t.alt)}"><div class="card-inner"><span class="micro">${esc(t.category)}</span><h3>${esc(t.title)}</h3><p class="muted">${esc(t.intro)}</p></div></button>`;
}
export function openTemplate(id, draft = {}) {
  const t = templates.find((x) => x.id === id) || templates[0];
  modal(
    "Start a small experiment",
    `<img class="circle-img" src="/art/${t.image}" alt="${esc(t.alt)}">${form("new-venture", `<input type="hidden" name="template" value="${t.id}">${field("title", "Venture name", draft.title || t.title, { required: true, max: 160 })}${field("question", "What do you want to find out?", draft.details || t.question, { area: true, required: true })}<p class="fine">You’ll start as the owner. Invite collaborators when you’re ready.</p>`, "Create venture")}`,
  );
}
export function venturesPage(s) {
  const own = s.ventures
    .map(
      (v) =>
        `<a class="list-row" href="#venture/${v.id}"><div><span class="micro">${esc(v.status)}</span><h3>${esc(v.title)}</h3><p>${esc(v.question)}</p></div>${icon("arrow-right")}</a>`,
    )
    .join("");
  return (
    heading(
      "Venture studio",
      "My ventures",
      "Plan the work, try an offer, and learn from what happens.",
      button("join-venture", "Join with a code", "plus"),
    ) +
    `<div class="stack">${own || empty("sprout", "Your first experiment starts here", "Choose a starting point below, or ask the guide to shape an idea around your experience.")}</div><section class="section"><div class="section-title"><h2>Experiment starters</h2></div><div class="cards">${templates.map(templateCard).join("")}</div></section>`
  );
}
function plan(v) {
  return `<div class="split"><section class="panel stack"><div class="between"><span class="overline">Customer experiment</span>${tag(v.status)}</div><h2>${esc(v.question)}</h2><div class="row"><span class="meta">${icon("wallet", 16)} ${money(v.budget)} spending limit</span><span class="meta">${icon("calendar-days", 16)} ${esc(v.deadline || "Set a review date")}</span></div><div>${button("edit-plan", "Edit plan & results", "pencil")}</div><hr class="rule"><h3>Trial checklist</h3><ul class="tasks">${v.tasks.map((t) => `<li><button class="task ${t.done ? "done" : ""}" data-act="task:${t.id}" aria-pressed="${t.done}"><span class="box">${t.done ? icon("check", 15) : ""}</span><span class="name">${esc(t.text)}</span></button></li>`).join("")}</ul>${form("new-task", field("text", "Add a task", "", { required: true, max: 400 }), "Add task")}</section><div class="stack"><section class="panel stack"><span class="tile-icon clay">${icon("compass")}</span><h3>Quick judgment</h3><p>Check whether the question, costs and scope are ready for a small test.</p>${v.check ? `<div class="check-result"><small>AI assessment · ${new Date(v.check.at).toLocaleDateString()}</small><strong>${esc(v.check.label)}</strong></div>` : ""}<div>${button("check", "Check this plan", "compass", "primary")}</div></section><section class="panel"><h3>Trial evidence</h3><p class="note-body">${esc(v.evidence || "Record customer feedback and actual results, then choose whether to continue, revise or finish.")}</p></section></div></div>`;
}
function prices(v, e) {
  const m = v.model;
  return `<div class="split"><section class="panel"><h2>Price your offer</h2><p class="muted">Include your time in the cost of each sale.</p>${form(
    "model",
    `<div class="cols">${[
      ["price", "Selling price per unit ($)"],
      ["materials", "Materials & fees per unit ($)"],
      ["hours", "Labor hours per unit"],
      ["wage", "Hourly pay ($)"],
      ["fixed", "Shared trial costs ($)"],
      ["units", "Expected units sold"],
    ]
      .map(([k, label]) =>
        field(k, label, m[k], {
          type: "number",
          step: k === "units" ? "1" : ".01",
          required: true,
        }),
      )
      .join("")}</div>`,
    "Save scenario",
  )}</section><section class="panel stack"><span class="overline">Estimated results</span><h2>Can this offer work?</h2><div id="metrics">${metrics(e)}</div><p class="fine">Contribution is price minus unit materials, fees and labor. Trial surplus subtracts shared costs. Tax and unentered expenses are excluded.</p></section></div>`;
}
export function metrics(e) {
  return `<div class="stack"><div class="metric"><small>Contribution per unit</small><strong>${money(e.contribution)}</strong></div><div class="metric"><small>Expected trial surplus</small><strong>${money(e.result)}</strong></div><div class="metric"><small>Units to break even</small><strong>${e.breakEven ?? "Unreachable"}</strong></div></div>`;
}
function ledger(v) {
  const income = v.entries
      .filter((r) => r.kind === "Income")
      .reduce((a, r) => a + r.cents, 0),
    expense = v.entries
      .filter((r) => r.kind === "Expense")
      .reduce((a, r) => a + r.cents, 0);
  return `<section class="panel stack"><div class="between"><h2>Reviewed records</h2><div class="row">${button("ledger-import", "Review CSV", "file-text")}${button("ledger-export", "Export CSV", "download")}${button("ledger-add", "Review an entry", "plus", "primary")}</div></div><div class="metric-grid">${[
    ["Received", income],
    ["Spent", expense],
    ["Net cash", income - expense],
  ]
    .map(
      ([l, n]) =>
        `<div class="metric"><small>${l}</small><strong>${money(n / 100)}</strong></div>`,
    )
    .join(
      "",
    )}</div><p class="fine">Accepted cash records, separate from your pricing estimates.</p>${
    v.entries.length
      ? [...v.entries]
          .reverse()
          .map(
            (r) =>
              `<div class="list-row"><div><strong>${esc(r.label)}</strong><p>${esc(r.date)} · ${esc(r.kind)} · Reviewed</p></div><div>${money(r.cents / 100)} ${r.receipt ? button("receipt:" + r.id, "Receipt", "paperclip", "quiet") : ""}</div></div>`,
          )
          .join("")
      : empty(
          "wallet",
          "No accepted records yet",
          "Review an income or expense entry to add it to the venture ledger.",
        )
  }</section>`;
}
function team(v, list, me) {
  return `<div class="split"><section class="panel stack"><div class="between"><h2>Working agreement</h2>${tag(v.revision ? "Revision " + v.revision : "Draft")}</div>${form("agreement", field("text", "Roles, hours, pay, ownership and exit terms", v.agreement, { area: true, required: true, max: 6000 }), "Save agreement draft")}${v.agreement ? button("accept", "Accept this revision for myself", "check") : ""}</section><section class="panel stack"><h2>Venture members</h2>${list.map((m) => `<div class="list-row"><div><strong>${esc(m.name)}${m.id === me ? " (you)" : ""}</strong><p>${m.id === v.owner ? "Owner" : "Collaborator"} · ${m.accepted ? "Accepted revision " + v.revision : "Awaiting agreement"}</p></div></div>`).join("")}${me === v.owner ? button("invite", "Create a single-use invite", "plus") : ""}</section></div>`;
}
function publicPage(v, me) {
  const p = v.publicDraft || {};
  return `<div class="split"><section class="panel stack"><h2>Customer information</h2><p class="muted">Choose exactly what a prospective customer may see. This package can be exported for owner review in Business Hub.</p>${me === v.owner ? form("public", field("name", "Public business name", p.name || v.title, { required: true, max: 160 }) + field("offer", "Products, services and availability", p.offer, { area: true, required: true, max: 1200 }) + field("price", "Public prices", p.price, { max: 160 }) + field("policy", "Fulfillment, cancellations and returns", p.policy, { area: true, max: 1400 }) + field("contact", "Public contact or escalation route", p.contact, { max: 400 }) + field("website", "Website", p.website, { max: 500 }) + field("faq", "Customer questions & approved answers", p.faq, { area: true, max: 2000 }), "Approve local package") : "<p>The owner can approve a new package.</p>"}</section><section class="panel stack"><span class="overline">Local preview</span><h2>${esc(p.name || "Your public profile")}</h2>${p.version ? `<p>${esc(p.offer)}</p><p>${esc(p.price)}</p><p>${esc(p.policy)}</p><p>${esc(p.contact)}</p><p>${esc(p.website)}</p>${esc(p.faq || "")}${tag("Approved version " + p.version)}${button("public-export", "Export approved package", "download")}${form("customer-preview", field("question", "Test a customer question", "", { required: true, max: 1200 }), "Preview answer")}<p id="customer-answer" class="note-body" role="status"></p>` : "<p>Approve the public fields to preview and export a package.</p>"}<hr class="rule"><p class="fine">Business profile claiming and Business Agent publication are separate owner steps. External status is unverified.</p><a class="link" href="https://openai.com/business/businesses-in-chatgpt/" target="_blank" rel="noopener">Review eligibility and setup ${icon("arrow-up-right", 16)}</a></section></div>`;
}
export function venturePage(d, me, tab) {
  const v = d.venture;
  const tabs = [
    ["plan", "Experiment"],
    ["pricing", "Pricing"],
    ["records", "Records"],
    ["team", "Team"],
    ["public", "Public profile"],
  ];
  const body =
    tab === "pricing"
      ? prices(v, d.economics)
      : tab === "records"
        ? ledger(v)
        : tab === "team"
          ? team(v, d.team, me)
          : tab === "public"
            ? publicPage(v, me)
            : plan(v);
  return (
    heading(
      "Venture studio",
      v.title,
      "Shared with the members of this venture.",
      button("venture-chat", "Open venture guide", "message-circle"),
    ) +
    `<nav class="tabs" aria-label="Venture sections">${tabs.map(([k, l]) => `<a class="tab ${k === tab ? "active" : ""}" href="#venture/${v.id}/${k}">${l}</a>`).join("")}</nav>${body}`
  );
}
export function editPlan(v) {
  modal(
    "Edit experiment",
    form(
      "plan",
      field("title", "Venture name", v.title, { required: true, max: 160 }) +
        field("question", "Customer question", v.question, {
          area: true,
          required: true,
        }) +
        `<div class="cols">${field("budget", "Spending limit ($)", v.budget, { type: "number", required: true })}${field("deadline", "Review date", v.deadline, { type: "date" })}</div>` +
        field("evidence", "Observed results & learning", v.evidence, {
          area: true,
          max: 4000,
        }) +
        `<label class="field"><span>Decision or stage</span><select name="status">${["Planning", "Testing", "Continue", "Revise", "Paused", "Finished"].map((s) => `<option ${s === v.status ? "selected" : ""}>${s}</option>`).join("")}</select></label>`,
      "Save experiment",
    ),
  );
}
export function ledgerForm() {
  modal(
    "Review an entry",
    form(
      "ledger",
      `<div class="cols"><label class="field"><span>Type</span><select name="kind"><option>Expense</option><option>Income</option></select></label>${field("date", "Date", date(), { type: "date", required: true })}</div>${field("label", "Description", "", { required: true, max: 300 })}${field("amount", "Amount ($)", "", { type: "number", required: true })}<label class="field"><span>Receipt (optional, up to 1 MB)</span><input type="file" name="receipt" accept="image/png,image/jpeg,application/pdf"></label><p class="fine">Accepting this entry adds it to the shared venture ledger.</p>`,
      "Accept reviewed entry",
    ),
  );
}
export function exportLedger(v) {
  const quote = (x) =>
    '"' +
    String(x)
      .replace(/^[=+\-@\t\r]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const rows = v.entries.map((r) => [
    r.date,
    r.kind,
    r.label,
    (r.cents / 100).toFixed(2),
  ]);
  download(
    "venture-ledger.csv",
    [["date", "kind", "label", "amount"], ...rows]
      .map((r) => r.map(quote).join(","))
      .join("\r\n"),
    "text/csv",
  );
}
export function parseLedger(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && c === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && c === "\n") {
      row.push(cell.trimEnd());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw Error("A quoted field is missing its closing quote.");
  if (cell || row.length) {
    row.push(cell.trimEnd());
    rows.push(row);
  }
  const headers = (rows.shift() || []).map((s) => s.trim().toLowerCase());
  const fields = ["date", "kind", "label", "amount"];
  if (fields.some((k) => !headers.includes(k)))
    throw Error("Use the headers date, kind, label, amount.");
  const result = rows
    .filter((r) => r.some((x) => x.trim()))
    .map((r, i) => {
      const o = Object.fromEntries(
        fields.map((k) => [k, (r[headers.indexOf(k)] || "").trim()]),
      );
      o.amount = Number(o.amount);
      if (
        !o.label ||
        !/^\d{4}-\d{2}-\d{2}$/.test(o.date) ||
        !["Income", "Expense"].includes(o.kind) ||
        !Number.isFinite(o.amount) ||
        o.amount <= 0
      )
        throw Error(
          "Check the date, type, label and amount on row " + (i + 2) + ".",
        );
      return o;
    });
  if (!result.length || result.length > 100)
    throw Error("Include 1 to 100 rows per import.");
  return result;
}
