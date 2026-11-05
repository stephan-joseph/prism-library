import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { start } from "../server.mjs";
import { sim, rankFor, cleanDeal, fte, per100, isStale } from "../public/lib.js";
import { anonymisation, completeness, framework } from "../lib/checks.mjs";

const good = () => ({
  name: "Regional retailer, applications", ind: "Retail", tw: ["AMS"], apps: 60, tix: 2400, cov: "24x7", reg: "EU", term: 3, sla: "Premium", out: "Won",
  team: { "System Support Engineer": 9, "Service Delivery Manager": 1 }, years: [0, 9, 8], conf: 70,
  asm: [{ t: "Ticket volume stays within ±10% of baseline", tw: "All", s: "unk" }], aip: [{ uc: "Auto ticket triage and routing", from: 1, plan: 20 }],
  com: "Fixed fee per tower", les: "", by: "SA team", framework: 1
});

test("cleanDeal fills Year 1 from the team and rejects bad input", () => {
  const ok = cleanDeal(good());
  assert.ok(ok.deal);
  assert.equal(ok.deal.years[0], 10);
  assert.deepEqual(ok.deal.years.slice(1), [9, 8]);
  const bad = cleanDeal({ ...good(), ind: "Mining", team: { "Wizard": 3 }, tw: [] });
  assert.ok(bad.errors.length >= 3);
});

test("cleanDeal limits free text and ignores unknown towers and statuses", () => {
  const r = cleanDeal({ ...good(), les: "x".repeat(5000), tw: ["AMS", "XYZ"], asm: [{ t: "A", tw: "Mars", s: "??" }] });
  assert.equal(r.deal.les.length, 1500);
  assert.deepEqual(r.deal.tw, ["AMS"]);
  assert.deepEqual(r.deal.asm[0], { t: "A", tw: "All", s: "unk" });
});

test("similarity: identical profile scores near 100 and the same deal ranks first", () => {
  const a = { ...cleanDeal(good()).deal, id: "L-1", q: "reviewed" };
  const b = { ...a, id: "L-2", ind: "Banking", tw: ["IMS"], apps: 300, tix: 20000, cov: "12x5", reg: "NA", sla: "Standard", term: 1, aip: [] };
  const p = { ind: "Retail", tw: ["AMS"], apps: 60, tix: 2400, cov: "24x7", reg: "EU", term: 3, sla: "Premium", ai: true };
  assert.ok(sim(a, p).score > 99);
  assert.ok(sim(b, p).score < 25);
  assert.equal(rankFor(p, [b, a])[0].d.id, "L-1");
});

test("proven deals rank above reviewed ones with the same match, drafts below", () => {
  const base = { ...cleanDeal(good()).deal };
  const p = { ind: "Retail", tw: ["AMS"], apps: 60, tix: 2400, cov: "24x7", reg: "EU", term: 3, sla: "Premium", ai: true };
  const r = rankFor(p, [{ ...base, id: "d", q: "draft" }, { ...base, id: "r", q: "reviewed" }, { ...base, id: "p", q: "proven" }]);
  assert.deepEqual(r.map(x => x.d.id), ["p", "r", "d"]);
});

test("derived numbers and staleness", () => {
  const d = cleanDeal(good()).deal;
  assert.equal(fte(d), 10);
  assert.equal(per100(d), 10 / 60 * 100);
  assert.equal(isStale({ date: "2024-01" }, "2026-10"), true);
  assert.equal(isStale({ date: "2025-01" }, "2026-10"), false);
});

test("anonymisation finds emails, addresses, phone numbers, money and listed terms", () => {
  const hit = (les, deny = []) => anonymisation(cleanDeal({ ...good(), les }).deal, deny);
  assert.match(hit("mail jo@acme.com").t, /email address/);
  assert.match(hit("see https://acme.example").t, /web address/);
  assert.match(hit("call +44 20 7946 0958").t, /phone number/);
  assert.match(hit("rate $95 an hour").t, /money amount/);
  assert.match(hit("about 12000 EUR a year").t, /money amount/);
  assert.match(hit("Acme Retail renewed", ["Acme Retail"]).t, /Acme Retail/);
  const c = hit("Acme Retail renewed", ["Acme Retail"]);
  assert.equal(c.ok, false); assert.equal(c.block, true);
  assert.equal(hit("Volumes grew 14% in year 1 across 60 applications").ok, true);
  assert.equal(anonymisation(cleanDeal(good()).deal, ["Acme Retail"]).ok, true);
});

test("a listed term matches whole words only", () => {
  const d = cleanDeal({ ...good(), les: "Scheduled maintenance windows." }).deal;
  assert.equal(anonymisation(d, ["Sched"]).ok, true);
});

test("completeness and framework checks", () => {
  const d = cleanDeal({ ...good(), apps: 0, com: "" }).deal;
  assert.equal(completeness(d).ok, false);
  assert.equal(framework({ framework: 1 }).ok, true);
  assert.equal(framework({ framework: 0 }).ok, false);
});

/* ---------- API ---------- */
/* tests start from an empty store, so they never read the repo's seed/library.json */
process.env.LIBRARY_SEED_FILE = "/nonexistent/none.json";
async function boot(opts = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "plib-"));
  const app = await start({ dataDir: dir, port: 0, ...opts });
  const base = `http://127.0.0.1:${app.port}`;
  const call = async (p, body, headers = {}) => {
    const r = await fetch(base + p, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };
  return { app, call, dir, done: async () => { await app.close(); await fs.rm(dir, { recursive: true, force: true }); } };
}

test("submit, approve, record actuals, retire", async () => {
  const t = await boot();
  try {
    let s = await t.call("/api/state"); assert.equal(s.json.deals.length, 0);
    const sub = await t.call("/api/submit", { deal: good() });
    assert.equal(sub.status, 200); assert.equal(sub.json.blocked, false); assert.match(sub.json.id, /^L-\d{4}$/);
    s = await t.call("/api/state"); assert.equal(s.json.deals.length, 0); assert.equal(s.json.queue.length, 1);
    const ap = await t.call(`/api/queue/${sub.json.id}/decision`, { action: "approve" });
    assert.equal(ap.status, 200);
    s = await t.call("/api/state"); assert.equal(s.json.deals.length, 1); assert.equal(s.json.deals[0].q, "reviewed");
    const bad = await t.call(`/api/deals/${sub.json.id}/actuals`, { acc: "lots" }); assert.equal(bad.status, 400);
    const ac = await t.call(`/api/deals/${sub.json.id}/actuals`, { acc: 4, asm: ["broken"], aip: [17] });
    assert.equal(ac.status, 200);
    s = await t.call("/api/state");
    assert.equal(s.json.deals[0].q, "proven"); assert.equal(s.json.deals[0].acc, 4);
    assert.equal(s.json.deals[0].asm[0].s, "broken"); assert.equal(s.json.deals[0].aip[0].act, 17);
    await t.call(`/api/deals/${sub.json.id}/retire`, {});
    s = await t.call("/api/state"); assert.equal(s.json.deals.length, 0);
  } finally { await t.done(); }
});

test("a submission that fails anonymisation is not stored, and nothing reaches the file", async () => {
  const t = await boot();
  try {
    const r = await t.call("/api/submit", { deal: { ...good(), les: "Acme Retail renewed." }, deny: ["Acme Retail"] });
    assert.equal(r.json.blocked, true);
    const s = await t.call("/api/state"); assert.equal(s.json.queue.length, 0);
    const raw = await fs.readFile(path.join(t.dir, "library.json"), "utf8");
    assert.equal(raw.includes("Acme"), false);
  } finally { await t.done(); }
});

test("a standing blocked-term list applies to every submission", async () => {
  const t = await boot();
  try {
    await t.call("/api/denylist", { terms: ["Globex"] });
    const r = await t.call("/api/submit", { deal: { ...good(), name: "Globex retail operations" } });
    assert.equal(r.json.blocked, true);
  } finally { await t.done(); }
});

test("return, edit and resubmit; reject; only returned deals can be edited", async () => {
  const t = await boot();
  try {
    const sub = (await t.call("/api/submit", { deal: good() })).json;
    await t.call(`/api/queue/${sub.id}/decision`, { action: "return", note: "Add assumptions" });
    let s = (await t.call("/api/state")).json; assert.equal(s.queue[0].status, "returned"); assert.equal(s.queue[0].returnNote, "Add assumptions");
    const re = await t.call("/api/submit", { deal: { ...good(), id: sub.id, com: "Fixed fee" } });
    assert.equal(re.json.id, sub.id);
    s = (await t.call("/api/state")).json; assert.equal(s.queue.length, 1); assert.equal(s.queue[0].status, "pending");
    const again = await t.call("/api/submit", { deal: { ...good(), id: sub.id } });
    assert.equal(again.status, 409);
    await t.call(`/api/queue/${sub.id}/decision`, { action: "reject" });
    s = (await t.call("/api/state")).json; assert.equal(s.queue[0].status, "rejected");
  } finally { await t.done(); }
});

test("curator key protects curator actions and hides the queue", async () => {
  const t = await boot({ curatorKey: "s3cret" });
  try {
    const sub = (await t.call("/api/submit", { deal: good() })).json;
    let s = (await t.call("/api/state")).json; assert.equal(s.curator, false); assert.equal(s.queue.length, 0);
    const no = await t.call(`/api/queue/${sub.id}/decision`, { action: "approve" }); assert.equal(no.status, 403);
    s = (await t.call("/api/state", undefined, { "x-curator-key": "s3cret" })).json; assert.equal(s.curator, true); assert.equal(s.queue.length, 1);
    const yes = await t.call(`/api/queue/${sub.id}/decision`, { action: "approve" }, { "x-curator-key": "s3cret" }); assert.equal(yes.status, 200);
  } finally { await t.done(); }
});

test("concurrent submissions get distinct IDs and all persist", async () => {
  const t = await boot();
  try {
    const rs = await Promise.all([1, 2, 3, 4, 5].map(i => t.call("/api/submit", { deal: { ...good(), name: "Deal " + i, apps: 50 + i } })));
    const ids = rs.map(r => r.json.id); assert.equal(new Set(ids).size, 5);
    const doc = JSON.parse(await fs.readFile(path.join(t.dir, "library.json"), "utf8")); assert.equal(doc.deals.length, 5);
  } finally { await t.done(); }
});

test("sample mode loads the sample deals and they can be cleared", async () => {
  const t = await boot({ sample: true });
  try {
    let s = (await t.call("/api/state")).json; assert.equal(s.deals.length, 14); assert.equal(s.queue.length, 3);
    const c = await t.call("/api/clear-samples", {}); assert.equal(c.json.removed, 17);
    s = (await t.call("/api/state")).json; assert.equal(s.deals.length, 0);
  } finally { await t.done(); }
});

test("static files are served and path traversal is refused", async () => {
  const t = await boot();
  try {
    const r = await fetch(`http://127.0.0.1:${t.app.port}/`); assert.equal(r.status, 200); assert.match(await r.text(), /Prism Library/);
    const x = await fetch(`http://127.0.0.1:${t.app.port}/..%2fserver.mjs`); assert.notEqual(x.status, 200);
  } finally { await t.done(); }
});

test("an access key gates every API call", async () => {
  const t = await boot({ accessKey: "beta-key-123" });
  try {
    const no = await t.call("/api/state"); assert.equal(no.status, 401); assert.equal(no.json.gate, true);
    const bad = await t.call("/api/state", undefined, { "x-access-key": "nope" }); assert.equal(bad.status, 401);
    const post = await t.call("/api/submit", { deal: good() }); assert.equal(post.status, 401);
    const ok = await t.call("/api/state", undefined, { "x-access-key": "beta-key-123" }); assert.equal(ok.status, 200); assert.equal(ok.json.beta, true);
    const exp = await fetch(`http://127.0.0.1:${t.app.port}/api/export`); assert.equal(exp.status, 401);
  } finally { await t.done(); }
});

test("a blank actuals gap is refused, not treated as 0%", async () => {
  const t = await boot();
  try {
    const sub = (await t.call("/api/submit", { deal: good() })).json;
    await t.call(`/api/queue/${sub.id}/decision`, { action: "approve" });
    assert.equal((await t.call(`/api/deals/${sub.id}/actuals`, { acc: "" })).status, 400);
    assert.equal((await t.call(`/api/deals/${sub.id}/actuals`, {})).status, 400);
    assert.equal((await t.call(`/api/deals/${sub.id}/actuals`, { acc: 0 })).status, 200);
  } finally { await t.done(); }
});

test("an access key fingerprint gates the API without the key being stored", async () => {
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update("beta-key-123").digest("hex");
  const t = await boot({ accessKeyHash: hash });
  try {
    assert.equal((await t.call("/api/state")).status, 401);
    assert.equal((await t.call("/api/state", undefined, { "x-access-key": "wrong" })).status, 401);
    const ok = await t.call("/api/state", undefined, { "x-access-key": "beta-key-123" }); assert.equal(ok.status, 200); assert.equal(ok.json.beta, true);
  } finally { await t.done(); }
});

test("a saved export seeds an empty store; a file that is not an export is refused", async () => {
  const { seedFrom } = await import("../server.mjs");
  const fs = await import("node:fs"), os = await import("node:os"), path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seed-"));
  assert.equal(seedFrom(path.join(dir, "none.json")), null);
  const good = path.join(dir, "good.json");
  fs.writeFileSync(good, JSON.stringify({ version: 1, seq: 200, catalogue: [], denylist: [], deals: [{ id: "D-1" }] }));
  assert.equal(seedFrom(good).deals[0].id, "D-1");
  const bad = path.join(dir, "bad.json"); fs.writeFileSync(bad, JSON.stringify({ hello: 1 }));
  assert.throws(() => seedFrom(bad), /not a Prism Library export/);
});
