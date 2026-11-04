/* The Library's API, independent of where it runs. The local server and the Netlify function both call handle().
   store: { get(): Promise<doc>, update(fn): Promise<result> }  (fn gets the doc and may mutate it)
   config: { curatorKey, accessKey } */
import { timingSafeEqual, createHash } from "node:crypto";
import { runChecks, blocking } from "./checks.mjs";
import { cleanDeal, TOWERS, ASM_STATUS } from "../public/lib.js";

const now = () => new Date().toISOString();
const month = () => now().slice(0, 7);

export class HttpError extends Error { constructor(code, msg, extra) { super(msg); this.code = code; this.extra = extra; } }

const same = (a, b) => {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && timingSafeEqual(x, y);
};
const publicDeal = d => { const { checks, ...rest } = d; return rest; };

export function createApi(store, config = {}) {
  const { curatorKey = "", accessKey = "", accessKeyHash = "" } = config;
  const gated = !!(accessKey || accessKeyHash);
  const sha = v => createHash("sha256").update(String(v || "")).digest("hex");
  /* accessKeyHash lets a deployment hold only a fingerprint of the key, so the key itself is not stored anywhere on the server */
  const accessOk = h => accessKeyHash ? same(sha(h["x-access-key"]), accessKeyHash.toLowerCase()) : same(h["x-access-key"], accessKey);
  const isCurator = h => !curatorKey || same(h["x-curator-key"], curatorKey);
  const needCurator = h => { if (!isCurator(h)) throw new HttpError(403, "Curator key needed."); };

  function parse(text) {
    if (!text) return {};
    try { return JSON.parse(text); } catch { throw new HttpError(400, "Body is not valid JSON."); }
  }

  /* req: { method, path, headers (lower-case keys), text } -> { status, json } or { status, raw, headers } */
  async function handle(req) {
    try { return await route(req); }
    catch (e) {
      if (e instanceof HttpError) return { status: e.code, json: { error: e.message, ...(e.extra || {}) } };
      console.error(e);
      return { status: 500, json: { error: "Something went wrong on the server." } };
    }
  }

  async function route(req) {
    const m = req.method, p = req.path, h = req.headers || {};

    if (gated && !accessOk(h)) {
      await new Promise(r => setTimeout(r, 400));   /* slows down guessing */
      throw new HttpError(401, "Access key needed.", { gate: true });
    }

    if (m === "GET" && p === "/api/state") {
      const doc = await store.get(), cur = isCurator(h);
      return { status: 200, json: {
        curator: cur, curatorKeyRequired: !!curatorKey, beta: gated,
        catalogue: doc.catalogue,
        deals: doc.deals.filter(d => d.status === "published").map(publicDeal),
        queue: cur ? doc.deals.filter(d => ["pending", "returned", "rejected"].includes(d.status)).map(d => ({ ...d })) : [],
        denylist: cur ? doc.denylist : undefined
      } };
    }

    if (m === "POST" && p === "/api/submit") {
      const b = parse(req.text);
      const c = cleanDeal(b.deal);
      if (c.errors) return { status: 422, json: { errors: c.errors } };
      const deny = Array.isArray(b.deny) ? b.deny.slice(0, 20) : [];
      const out = await store.update(doc => {
        const published = doc.deals.filter(d => d.status === "published");
        let rec = b.deal && b.deal.id ? doc.deals.find(d => d.id === b.deal.id) : null;
        if (b.deal && b.deal.id && !rec) throw new HttpError(404, "No submission with that ID.");
        if (rec && rec.status !== "returned") throw new HttpError(409, "Only a returned deal can be edited and resubmitted.");
        /* check before saving: a submission that fails anonymisation is never stored, so a name never reaches the data */
        const cand = { ...c.deal, id: rec ? rec.id : "new" };
        const checks = runChecks(cand, [...deny, ...doc.denylist], published);
        if (blocking(checks)) return { blocked: true, checks };
        if (!rec) { rec = { id: "L-" + String(++doc.seq).padStart(4, "0"), history: [] }; doc.deals.push(rec); }
        Object.assign(rec, c.deal, { q: "draft", acc: null, status: "pending", date: month(), sample: false, returnNote: "" });
        rec.history.push({ at: now(), action: "submitted" });
        rec.checks = checks;
        return { id: rec.id, checks, blocked: false };
      });
      return { status: 200, json: out };
    }

    let mt;
    if (m === "POST" && (mt = p.match(/^\/api\/queue\/([\w-]+)\/decision$/))) {
      needCurator(h);
      const b = parse(req.text), act = b.action, note = String(b.note || "").slice(0, 400);
      if (!["approve", "return", "reject"].includes(act)) throw new HttpError(400, "Unknown action.");
      const out = await store.update(doc => {
        const rec = doc.deals.find(d => d.id === mt[1]);
        if (!rec || rec.status !== "pending") throw new HttpError(404, "No pending submission with that ID.");
        if (act === "approve") {
          if (blocking(rec.checks || [])) throw new HttpError(409, "The anonymisation check failed. Return it to the submitter to fix.");
          rec.status = "published"; rec.q = "reviewed"; rec.date = month(); delete rec.checks;
        } else { rec.status = act === "return" ? "returned" : "rejected"; rec.returnNote = note; }
        rec.history.push({ at: now(), action: act === "approve" ? "approved and published" : act === "return" ? "returned" : "rejected", note });
        return { id: rec.id, status: rec.status };
      });
      return { status: 200, json: out };
    }

    if (m === "POST" && (mt = p.match(/^\/api\/deals\/([\w-]+)\/actuals$/))) {
      needCurator(h);
      const b = parse(req.text), acc = Number(b.acc);
      if (b.acc === "" || b.acc == null || !Number.isFinite(acc) || acc < -80 || acc > 200) throw new HttpError(400, "Enter the actual-versus-plan gap as a percentage, for example 4 or -3.");
      const out = await store.update(doc => {
        const rec = doc.deals.find(d => d.id === mt[1] && d.status === "published");
        if (!rec) throw new HttpError(404, "No published deal with that ID.");
        rec.acc = Math.round(acc * 10) / 10; rec.q = "proven";
        if (Array.isArray(b.asm)) rec.asm.forEach((a, i) => { if (ASM_STATUS[b.asm[i]]) a.s = b.asm[i]; });
        if (Array.isArray(b.aip)) rec.aip.forEach((a, i) => { const v = b.aip[i]; if (v !== "" && v != null && Number.isFinite(Number(v))) a.act = Math.max(0, Math.min(100, Number(v))); });
        if (typeof b.les === "string") rec.les = b.les.trim().slice(0, 1500);
        rec.history.push({ at: now(), action: "delivery actuals recorded", note: `${rec.acc > 0 ? "+" : ""}${rec.acc}% against plan` });
        return publicDeal(rec);
      });
      return { status: 200, json: out };
    }

    if (m === "POST" && (mt = p.match(/^\/api\/deals\/([\w-]+)\/retire$/))) {
      needCurator(h);
      const out = await store.update(doc => {
        const rec = doc.deals.find(d => d.id === mt[1] && d.status === "published");
        if (!rec) throw new HttpError(404, "No published deal with that ID.");
        rec.status = "retired"; rec.history.push({ at: now(), action: "retired" });
        return { id: rec.id };
      });
      return { status: 200, json: out };
    }

    if (m === "POST" && p === "/api/catalogue") {
      needCurator(h);
      const b = parse(req.text), t = String(b.t || "").trim().slice(0, 200);
      if (!t) throw new HttpError(400, "Write the assumption.");
      const out = await store.update(doc => {
        if (!doc.catalogue.some(x => x.t.toLowerCase() === t.toLowerCase())) doc.catalogue.push({ t, tw: TOWERS.includes(b.tw) ? b.tw : "All" });
        return { catalogue: doc.catalogue };
      });
      return { status: 200, json: out };
    }

    if (m === "POST" && p === "/api/denylist") {
      needCurator(h);
      const b = parse(req.text);
      const terms = (Array.isArray(b.terms) ? b.terms : []).map(t => String(t).trim()).filter(t => t.length >= 3).slice(0, 500);
      const out = await store.update(doc => { doc.denylist = [...new Set(terms)]; return { denylist: doc.denylist }; });
      return { status: 200, json: out };
    }

    if (m === "POST" && p === "/api/clear-samples") {
      needCurator(h);
      const out = await store.update(doc => { const n = doc.deals.length; doc.deals = doc.deals.filter(d => !d.sample); return { removed: n - doc.deals.length }; });
      return { status: 200, json: out };
    }

    if (m === "GET" && p === "/api/export") {
      needCurator(h);
      const doc = await store.get();
      return { status: 200, raw: JSON.stringify(doc, null, 1), headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="prism-library-backup.json"' } };
    }

    throw new HttpError(404, "Not found.");
  }

  return { handle };
}
