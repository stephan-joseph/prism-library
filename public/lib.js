/* Shared by the browser and the server: reference lists, derived numbers, similarity and validation.
   No DOM and no Node-only calls, so the same code ranks deals everywhere. */

export const FRAMEWORK = 1;          /* version of the Prism export block the library reads */
export const TOL = 8;                /* a proven estimate is "within tolerance" when delivery landed within ±8% of plan */
export const TOWERS = ["AMS", "IMS", "DMS", "AI"];
export const TNAME = { AMS: "Applications", IMS: "Infrastructure", DMS: "Data", AI: "Agentic platform" };
export const INDS = ["Banking", "Energy", "Healthcare", "Insurance", "Logistics", "Manufacturing", "Retail", "Telecom", "Other"];
export const COVS = ["12x5", "16x5", "24x5", "24x7"];
export const REGIONS = ["EU", "APAC", "NA", "IME"];
export const SLAS = ["Standard", "Premium"];
export const OUTCOMES = ["Open", "Won", "Extended", "Lost"];
export const ROLES = [
  "System Support Engineer", "Product Support Engineer", "Infra Support Engineer", "Data Ops Engineer", "AIOps Engineer",
  "Developer", "Infra Engineer", "Data Engineer", "AI/ML Engineer", "Quality Analyst", "Business Analyst",
  "Mobile Developer", "Service Reliability Engineer", "Solution Architect", "Service Delivery Manager", "Transformation engineers"
];
export const USE_CASES = [
  "Auto ticket triage and routing", "Knowledge-base answers", "Alert noise reduction", "Log and RCA summarisation",
  "Auto-remediation runbooks", "Self-service chatbot", "Predictive monitoring", "Other"
];
export const ASM_STATUS = { held: "Held", risk: "At risk", broken: "Broken", unk: "Not yet tested" };
export const DEFAULT_CATALOGUE = [
  { t: "Customer provides L1 in a second region", tw: "AMS" },
  { t: "Ticket volume stays within ±10% of baseline", tw: "All" },
  { t: "Knowledge transfer completes within 8 weeks", tw: "All" },
  { t: "No new applications added without a change request", tw: "AMS" },
  { t: "Customer provides monitoring tooling before go-live", tw: "IMS" },
  { t: "Patch and maintenance windows agreed monthly", tw: "IMS" },
  { t: "AIOps use cases go live in the planned month", tw: "AI" },
  { t: "Customer SMEs answer L3 escalations within SLA", tw: "All" },
  { t: "Source data quality meets the agreed threshold", tw: "DMS" }
];

/* ---------- derived values ---------- */
export const fte = d => Object.values(d.team || {}).reduce((a, b) => a + (+b || 0), 0);
export const yearsOf = d => (d.years && d.years.length ? d.years : [fte(d)]);
export const avgYears = d => { const y = yearsOf(d); return y.reduce((a, b) => a + b, 0) / y.length; };
export const per100 = d => (d.apps > 0 ? fte(d) / d.apps * 100 : 0);
export const hasScale = d => d.apps > 0;
export const f1 = n => (+n).toFixed(1);
export const isStale = (d, now = new Date().toISOString().slice(0, 7)) => {
  const [y, m] = (d.date || now).split("-").map(Number), [ny, nm] = now.split("-").map(Number);
  return (ny - y) * 12 + (nm - m) > 24;
};
export const QUALITY = { proven: "Proven", reviewed: "Reviewed", draft: "Draft" };
export const QRANK = { proven: 0, reviewed: 1, draft: 2 };

/* ---------- similarity ---------- */
export const WEIGHTS = { ind: 14, tow: 24, apps: 16, tix: 14, cov: 10, ai: 6, sla: 4, term: 4, reg: 8 };
const ratioSim = (a, b, span) => (a > 0 && b > 0 ? 1 - Math.min(1, Math.abs(Math.log(a / b)) / Math.log(span)) : 0.5);
export function dealAI(d) { return (d.aip && d.aip.length > 0) || (d.tw || []).includes("AI"); }

/* p is the profile of the new deal: { ind, tw[], apps, tix, cov, reg, term, sla, ai } */
export function sim(d, p) {
  const parts = []; let score = 0;
  const add = (k, v, good, bad) => { score += WEIGHTS[k] * v; parts.push({ k, v, w: WEIGHTS[k], good, bad }); };
  add("ind", d.ind === p.ind ? 1 : 0, `Same industry (${d.ind})`, `Different industry (${d.ind} vs ${p.ind})`);
  const inter = d.tw.filter(x => p.tw.includes(x)).length;
  const uni = new Set([...d.tw, ...p.tw]).size;
  const tj = uni ? inter / uni : 0;
  add("tow", tj, tj === 1 ? `Same towers (${d.tw.join(", ")})` : `Towers overlap (${d.tw.join(", ")} vs ${p.tw.join(", ")})`, `Towers differ (${d.tw.join(", ")} vs ${p.tw.join(", ")})`);
  add("apps", ratioSim(d.apps, p.apps, 3), `Similar application count (${d.apps} vs ${p.apps})`, `Application count differs (${d.apps} vs ${p.apps})`);
  add("tix", ratioSim(d.tix, p.tix, 4), `Similar ticket volume (${d.tix} vs ${p.tix} a month)`, `Ticket volume differs (${d.tix} vs ${p.tix} a month)`);
  const ci = Math.abs(COVS.indexOf(d.cov) - COVS.indexOf(p.cov));
  add("cov", ci === 0 ? 1 : ci === 1 ? 0.5 : 0, `Same coverage (${d.cov})`, `Coverage differs (${d.cov} vs ${p.cov})`);
  const da = dealAI(d);
  add("ai", da === !!p.ai ? 1 : 0, da ? "AIOps in scope in both" : "AIOps out of scope in both", "AIOps scope differs");
  add("sla", d.sla === p.sla ? 1 : 0, `Same SLA tier (${d.sla})`, `SLA tier differs (${d.sla} vs ${p.sla})`);
  add("term", 1 - Math.min(1, Math.abs(d.term - p.term) / 3), `Similar term (${d.term} vs ${p.term} years)`, `Term differs (${d.term} vs ${p.term} years)`);
  add("reg", d.reg === p.reg ? 1 : 0, `Same customer region (${d.reg})`, `Different customer region (${d.reg} vs ${p.reg})`);
  const boost = d.q === "proven" ? 1.06 : d.q === "draft" ? 0.92 : 1;
  const good = parts.filter(x => x.v >= 0.8).sort((a, b) => b.w * b.v - a.w * a.v).slice(0, 3);
  const diff = parts.filter(x => x.v < 0.5).sort((a, b) => b.w - a.w).slice(0, 2);
  return { score, rank: score * boost, good, diff };
}
export const rankFor = (p, pool) => pool.map(d => ({ d, s: sim(d, p) })).sort((a, b) => b.s.rank - a.s.rank);

/* ---------- validation of a submitted deal (used by the server; the form uses it too) ---------- */
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = v => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && isFinite(+v) ? +v : NaN);

/* Returns { deal } with clean fields, or { errors: [..] }. Free text is trimmed and length-limited, never trusted. */
export function cleanDeal(raw) {
  const e = [], r = raw && typeof raw === "object" ? raw : {};
  const d = {};
  d.name = str(r.name, 140); if (!d.name) e.push("Describe the deal in a short, anonymised line.");
  d.ind = INDS.includes(r.ind) ? r.ind : (e.push("Pick an industry."), "");
  d.tw = Array.isArray(r.tw) ? TOWERS.filter(t => r.tw.includes(t)) : [];
  if (!d.tw.length) e.push("Pick at least one tower.");
  const apps = num(r.apps); d.apps = Number.isFinite(apps) && apps >= 0 ? Math.round(apps) : (e.push("Applications must be 0 or more."), 0);
  const tix = num(r.tix); d.tix = Number.isFinite(tix) && tix >= 0 ? Math.round(tix) : (e.push("Tickets a month must be 0 or more."), 0);
  d.cov = COVS.includes(r.cov) ? r.cov : (e.push("Pick a coverage."), "");
  d.reg = REGIONS.includes(r.reg) ? r.reg : (e.push("Pick a customer region."), "");
  const term = num(r.term); d.term = Number.isFinite(term) && term >= 1 && term <= 10 ? Math.round(term) : (e.push("Term must be 1 to 10 years."), 0);
  d.sla = SLAS.includes(r.sla) ? r.sla : (e.push("Pick an SLA tier."), "");
  d.out = OUTCOMES.includes(r.out) ? r.out : "Open";
  d.team = {};
  if (r.team && typeof r.team === "object") for (const [k, v] of Object.entries(r.team)) {
    const n = num(v);
    if (!ROLES.includes(k)) { e.push(`Unknown role "${str(k, 40)}".`); continue; }
    if (!Number.isFinite(n) || n < 0 || n > 1000) { e.push(`FTE for ${k} must be a number from 0 to 1000.`); continue; }
    if (n > 0) d.team[k] = Math.round(n * 100) / 100;
  }
  if (!Object.keys(d.team).length) e.push("Add at least one role with FTE.");
  const y1 = fte(d);
  /* years[0] is ignored: Year 1 is always the sum of the team. The later years are the totals as given. */
  const later = Array.isArray(r.years) ? r.years.slice(1).map(num).filter(n => Number.isFinite(n) && n > 0).slice(0, 9) : [];
  d.years = [Math.round(y1 * 100) / 100, ...later.map(n => Math.round(n * 100) / 100)];
  const conf = num(r.conf); d.conf = Number.isFinite(conf) ? Math.max(0, Math.min(100, Math.round(conf))) : 0;
  d.asm = (Array.isArray(r.asm) ? r.asm : []).slice(0, 40).map(a => ({
    t: str(a && a.t, 200), tw: TOWERS.includes(a && a.tw) ? a.tw : "All", s: ASM_STATUS[a && a.s] ? a.s : "unk"
  })).filter(a => a.t);
  d.aip = (Array.isArray(r.aip) ? r.aip : []).slice(0, 20).map(a => {
    const from = num(a && a.from), plan = num(a && a.plan);
    return { uc: USE_CASES.includes(a && a.uc) ? a.uc : str(a && a.uc, 80), from: Number.isFinite(from) && from >= 1 ? Math.round(from) : 1, plan: Number.isFinite(plan) ? Math.max(0, Math.min(100, plan)) : 0, act: null };
  }).filter(a => a.uc);
  d.com = str(r.com, 300); d.les = str(r.les, 1500); d.by = str(r.by, 80) || "Unspecified";
  const fw = num(r.framework); d.framework = Number.isFinite(fw) ? fw : FRAMEWORK;
  return e.length ? { errors: e } : { deal: d };
}
