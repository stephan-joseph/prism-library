/* Review checks run when a deal is submitted. Anonymisation is the one that blocks publishing. */
import { FRAMEWORK, sim, fte } from "../public/lib.js";

const PATTERNS = [
  ["an email address", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ["a web address", /\b(?:https?:\/\/|www\.)\S+/i],
  ["a phone number", /(?<![\d.])\+?\d[\d\s().-]{8,}\d(?![\d.])/],
  ["a money amount or rate", /(?:[$€£₹]\s?\d|\b\d[\d,.]*\s?(?:USD|EUR|GBP|INR|AUD|CAD)\b)/i]
];

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* Every free-text field that could carry a name. */
export function textFields(d) {
  const f = [["Deal description", d.name], ["Commercial model", d.com], ["Lessons", d.les], ["Submitted by", d.by]];
  (d.asm || []).forEach((a, i) => f.push([`Assumption ${i + 1}`, a.t]));
  (d.aip || []).forEach((a, i) => f.push([`AIOps use case ${i + 1}`, a.uc]));
  return f.filter(([, v]) => v);
}

/* deny: terms that must not appear (the real customer name, people, sites). They are used for this scan only and never stored. */
export function anonymisation(d, deny = []) {
  const terms = [...new Set(deny.map(t => String(t || "").trim()).filter(t => t.length >= 3))];
  const hits = [];
  for (const [label, text] of textFields(d)) {
    for (const [what, re] of PATTERNS) if (re.test(text)) hits.push(`${label} contains ${what}.`);
    for (const t of terms) if (new RegExp(`(?<![A-Za-z0-9])${esc(t)}(?![A-Za-z0-9])`, "i").test(text)) hits.push(`${label} contains the term "${t}".`);
  }
  return hits.length
    ? { k: "Anonymisation", ok: false, block: true, t: hits.slice(0, 3).join(" ") + (hits.length > 3 ? ` And ${hits.length - 3} more.` : "") }
    : { k: "Anonymisation", ok: true, t: "No names, addresses, numbers or listed terms found." };
}

export function completeness(d) {
  const miss = [];
  if (!d.apps) miss.push("applications");
  if (!d.tix) miss.push("tickets a month");
  if (!d.conf) miss.push("confidence score");
  if (!d.asm.length) miss.push("assumptions");
  if (!d.com) miss.push("commercial model");
  return miss.length
    ? { k: "Completeness", ok: false, t: `Not filled in: ${miss.join(", ")}. The deal is still useful, but matches are weaker without them.` }
    : { k: "Completeness", ok: true, t: "All main fields filled." };
}

export function framework(d) {
  return d.framework === FRAMEWORK
    ? { k: "Framework version", ok: true, t: "Built on the current framework." }
    : { k: "Framework version", ok: false, t: `Built on version ${d.framework}, the current one is ${FRAMEWORK}. Re-run the estimate in the current Prism before publishing.` };
}

export function duplicates(d, published) {
  const p = { ind: d.ind, tw: d.tw, apps: d.apps, tix: d.tix, cov: d.cov, reg: d.reg, term: d.term, sla: d.sla, ai: (d.aip || []).length > 0 || d.tw.includes("AI") };
  let best = null;
  for (const o of published) { const s = sim(o, p).score; if (!best || s > best.s) best = { id: o.id, s }; }
  return best && best.s >= 92
    ? { k: "Duplicates", ok: false, t: `${Math.round(best.s)}% match with ${best.id}. Confirm this is a separate deal.` }
    : { k: "Duplicates", ok: true, t: "No close match." };
}

export function runChecks(d, deny, published) {
  return [anonymisation(d, deny), completeness(d), framework(d), duplicates(d, published.filter(o => o.id !== d.id))];
}
export const blocking = checks => checks.some(c => c.block && !c.ok);
export { fte };
