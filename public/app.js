import {
  TOL, TOWERS, TNAME, INDS, COVS, REGIONS, SLAS, OUTCOMES, ROLES, USE_CASES, ASM_STATUS, QUALITY, QRANK,
  fte, yearsOf, avgYears, per100, hasScale, f1, isStale, rankFor
} from "./lib.js";

/* ---------- state ---------- */
const S = { deals: [], queue: [], catalogue: [], curator: false, keyRequired: false, denylist: [], sample: false, beta: false };
const blankForm = () => ({
  id: null, name: "", ind: "Insurance", tw: ["AMS"], apps: "", tix: "", cov: "24x7", reg: "EU", term: 3, sla: "Standard", out: "Open", by: "",
  team: [{ role: "System Support Engineer", fte: "" }], years: ["", "", "", ""], conf: "", asm: [], aip: [], com: "", les: "", framework: 1, deny: [], imported: false
});
const st = {
  tab: "find",
  p: { ind: "Insurance", tw: ["AMS", "IMS"], apps: 55, tix: 2200, cov: "24x7", reg: "EU", term: 3, sla: "Premium", ai: true, est: 22 },
  cmp: [], f: { q: "", ql: "all", ind: "all", tw: [], out: "all", sort: "recent" },
  form: blankForm(), result: null
};

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const byId = id => S.deals.find(d => d.id === id) || S.queue.find(d => d.id === id);
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 3600); }
const keyGet = () => { try { return sessionStorage.getItem("libkey") || ""; } catch { return ""; } };
const keySet = k => { try { sessionStorage.setItem("libkey", k); } catch { /* private window */ } };
const accGet = () => { try { return sessionStorage.getItem("libaccess") || ""; } catch { return ""; } };
const accSet = k => { try { sessionStorage.setItem("libaccess", k); } catch { /* private window */ } };

async function api(path, body) {
  const opt = { headers: { "x-curator-key": keyGet(), "x-access-key": accGet() } };
  if (body !== undefined) { opt.method = "POST"; opt.headers["content-type"] = "application/json"; opt.body = JSON.stringify(body); }
  const r = await fetch(path, opt);
  let j = {};
  try { j = await r.json(); } catch { /* empty */ }
  if (!r.ok) { const e = new Error(j.error || (j.errors && j.errors.join(" ")) || `Request failed (${r.status})`); e.errors = j.errors; e.status = r.status; e.gate = !!j.gate; throw e; }
  return j;
}
async function reload() {
  const j = await api("/api/state");
  S.deals = j.deals; S.queue = j.queue; S.catalogue = j.catalogue; S.curator = j.curator; S.keyRequired = j.curatorKeyRequired; S.denylist = j.denylist || [];
  S.sample = S.deals.some(d => d.sample) || S.queue.some(d => d.sample); S.beta = !!j.beta;
}
const pending = () => S.queue.filter(q => q.status === "pending").length;

/* ---------- small renderers ---------- */
const qBadge = d => `<span class="q ${d.q}">${QUALITY[d.q]}</span>${isStale(d) ? ' <span class="q stale">Stale</span>' : ""}`;
function accBadge(d) {
  if (d.acc == null) return '<span class="acc na">no actuals yet</span>';
  return `<span class="acc ${Math.abs(d.acc) <= TOL ? "in" : "out"}">${d.acc > 0 ? "+" : ""}${d.acc}% vs plan</span>`;
}
const opts = (list, sel) => list.map(x => `<option${String(x) === String(sel) ? " selected" : ""}>${esc(x)}</option>`).join("");
const chipBtn = (act, k, on) => `<button type="button" class="tg" data-act="${act}" data-v="${esc(k)}" aria-pressed="${on}" title="${esc(TNAME[k] || k)}">${esc(k)}</button>`;

function chart(items, mine, mineLabel) {
  const vals = items.map(i => i.v); if (mine != null) vals.push(mine);
  let mx = Math.ceil(Math.max(...vals) * 1.15 / 10) * 10; if (mx < 20) mx = 20;
  const L = 30, Rr = 610, y = 84, X = v => L + (Rr - L) * v / mx;
  const mn = Math.min(...items.map(i => i.v)), mxv = Math.max(...items.map(i => i.v));
  let s = '<svg viewBox="0 0 640 176" width="100%" role="img" aria-label="FTE per 100 applications for similar deals and your estimate">';
  s += `<rect x="${X(mn)}" y="64" width="${Math.max(2, X(mxv) - X(mn))}" height="40" rx="4" fill="var(--accent-soft)"/>`;
  const step = mx <= 40 ? 5 : 10;
  for (let t = 0; t <= mx; t += step) s += `<line x1="${X(t)}" y1="128" x2="${X(t)}" y2="134" stroke="var(--faint)"/><text x="${X(t)}" y="150" font-size="11" text-anchor="middle" fill="var(--muted)">${t}</text>`;
  s += `<line x1="${L}" y1="128" x2="${Rr}" y2="128" stroke="var(--line)"/><text x="${Rr}" y="170" font-size="11" text-anchor="end" fill="var(--muted)">FTE per 100 applications (Year 1)</text>`;
  items.slice().sort((a, b) => a.v - b.v).forEach((it, i) => {
    const x = X(it.v), up = i % 2 === 0;
    s += `<circle cx="${x}" cy="${y}" r="6" fill="var(--${it.q === "proven" ? "ok" : it.q === "reviewed" ? "rev" : "plan"})" stroke="var(--surface)" stroke-width="2"/>`;
    s += `<text x="${x}" y="${up ? 58 : 122}" font-size="10.5" text-anchor="middle" fill="var(--muted)">${esc(it.label)}</text>`;
  });
  if (mine != null) {
    const mxp = X(mine);
    s += `<line x1="${mxp}" y1="34" x2="${mxp}" y2="${y - 9}" stroke="var(--accent)" stroke-width="2"/><path d="M${mxp} ${y - 9} l9 9 l-9 9 l-9 -9 z" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>`;
    s += `<text x="${Math.min(Math.max(mxp, 70), 570)}" y="22" font-size="12" font-weight="600" text-anchor="middle" fill="var(--accent)">${esc(mineLabel)}</text>`;
  }
  return s + "</svg>";
}
const legendQ = () => '<div class="legend"><span><i style="background:var(--ok);border-radius:50%"></i>Proven</span><span><i style="background:var(--rev);border-radius:50%"></i>Reviewed</span><span><i style="background:var(--plan);border-radius:50%"></i>Draft</span><span><i style="background:var(--accent);transform:rotate(45deg)"></i>Your estimate</span><span><i style="background:var(--accent-soft);border:1px solid var(--line)"></i>Range of similar deals</span></div>';
const empty = (title, body, btn) => `<div class="empty"><b>${esc(title)}</b><span>${esc(body)}</span>${btn || ""}</div>`;

/* ---------- tabs and header ---------- */
function drawTabs() {
  const tabs = [["find", "Find similar"], ["browse", "Browse"], ["compare", "Compare", st.cmp.length], ["insights", "Insights"], ["add", "Add a deal"], ["curation", "Curation", S.curator ? pending() : 0]];
  $("#tabs").innerHTML = tabs.map(t => `<button class="tab" role="tab" data-act="tab" data-tab="${t[0]}" aria-selected="${st.tab === t[0]}">${t[1]}${t[2] ? `<span class="n">${t[2]}</span>` : ""}</button>`).join("");
  $("#sampleBadge").hidden = !S.sample;
  $("#betaBadge").hidden = !S.beta;
  const b = $("#curBtn");
  b.className = "cur" + (S.curator ? " on" : "");
  b.textContent = S.curator ? (S.keyRequired ? "Curator signed in" : "Curator mode (no key set)") : "Curator sign-in";
  b.disabled = S.curator && !S.keyRequired;
}

/* ---------- find similar ---------- */
function viewFind() {
  const p = st.p;
  if (!S.deals.length) { $("#view").innerHTML = empty("The library is empty", "Add the first deal, either by importing a Prism estimate file or by entering it.", '<button class="btn primary" data-act="tab" data-tab="add">Add a deal</button>'); return; }
  $("#view").innerHTML = `<div class="cols">
   <section class="card" aria-labelledby="nd"><header><h2 id="nd">Your new deal</h2></header>
    <p class="hint" style="margin:0">Describe the deal you are starting. The matches update as you type.</p>
    <div class="form">
     <div class="field"><label for="f-ind">Industry</label><select id="f-ind" data-f="ind">${opts(INDS, p.ind)}</select></div>
     <div class="field"><span class="lab">Towers in scope</span><div class="chips">${TOWERS.map(k => chipBtn("ptw", k, p.tw.includes(k))).join("")}</div></div>
     <div class="row2"><div class="field"><label for="f-apps">Applications</label><input type="number" id="f-apps" data-f="apps" min="1" value="${p.apps}"></div>
     <div class="field"><label for="f-tix">Tickets a month</label><input type="number" id="f-tix" data-f="tix" min="1" value="${p.tix}"></div></div>
     <div class="row2"><div class="field"><label for="f-cov">Coverage</label><select id="f-cov" data-f="cov">${opts(COVS, p.cov)}</select></div>
     <div class="field"><label for="f-reg">Customer region</label><select id="f-reg" data-f="reg">${opts(REGIONS, p.reg)}</select></div></div>
     <div class="row2"><div class="field"><label for="f-term">Term (years)</label><select id="f-term" data-f="term">${opts([1, 2, 3, 4, 5], p.term)}</select></div>
     <div class="field"><label for="f-sla">SLA tier</label><select id="f-sla" data-f="sla">${opts(SLAS, p.sla)}</select></div></div>
     <label class="chk"><input type="checkbox" id="f-ai" data-f="ai"${p.ai ? " checked" : ""}> AIOps in scope</label>
     <div class="field"><label for="f-est">Your Year 1 estimate (FTE), optional</label><input type="number" id="f-est" data-f="est" min="0" step="0.5" value="${p.est}"></div>
    </div></section>
   <div class="stack" id="results"></div></div>`;
  drawResults();
}
function drawResults() {
  const p = st.p, el = $("#results"); if (!el) return;
  if (!p.tw.length) { el.innerHTML = empty("Pick at least one tower", "Matches are based on the towers in scope."); return; }
  const rk = rankFor(p, S.deals).slice(0, 6);
  const top = rk.slice(0, 5).filter(r => hasScale(r.d));
  let peer = "";
  if (top.length >= 2 && p.est > 0 && p.apps > 0) {
    const items = top.map(r => ({ v: per100(r.d), label: r.d.id.replace("L-", ""), q: r.d.q }));
    const vs = items.map(i => i.v).sort((a, b) => a - b);
    const med = vs.length % 2 ? vs[(vs.length - 1) / 2] : (vs[vs.length / 2 - 1] + vs[vs.length / 2]) / 2;
    const mine = p.est / p.apps * 100, lo = vs[0], hi = vs[vs.length - 1];
    const range = `${f1(mine)} FTE per 100 applications against ${f1(lo)} to ${f1(hi)} in the closest matches (median ${f1(med)}).`;
    const [cls, msg] = mine < lo ? ["low", `<b>Below the range.</b> ${range} Check what you have left out, or which assumption lets you size lower.`]
      : mine > hi ? ["high", `<b>Above the range.</b> ${range} Check what you have added that the similar deals did not need.`]
        : ["ok", `<b>Within the range.</b> ${range}`];
    peer = `<section class="card" aria-labelledby="pc"><header><h2 id="pc">Peer check</h2><span class="sub">Top ${items.length} matches, ${top.filter(r => r.d.q === "proven").length} proven</span></header><div class="check ${cls}">${msg}</div>${chart(items, mine, "You " + f1(mine))}${legendQ()}</section>`;
  } else peer = `<section class="card"><h2>Peer check</h2><p class="hint" style="margin:0">Enter your applications and a Year 1 estimate. The check needs at least two similar deals that record an application count.</p></section>`;
  el.innerHTML = peer + `<section aria-labelledby="sd"><h2 id="sd" style="font-size:17px;margin-bottom:10px">Similar deals</h2><div class="res">${rk.map((r, i) => dealCard(r, i + 1)).join("")}</div></section>
   <p class="foot">Match is a weighted score of towers, size, volume, coverage, industry, region, SLA, AIOps and term. Proven deals rank slightly higher, drafts slightly lower.</p>`;
}
function dealCard(r, i) {
  const d = r.d, s = r.s, pct = Math.round(s.score), inC = st.cmp.includes(d.id);
  return `<article class="deal"><div class="rk">${i}</div>
   <div style="min-width:0"><div class="head"><span class="id">${esc(d.id)}</span>${qBadge(d)}<span class="o">${esc(d.out)}</span>${accBadge(d)}</div>
   <div class="nm">${esc(d.name)}</div>
   <ul class="why">${s.good.map(g => `<li class="g">${esc(g.good)}</li>`).join("")}${s.diff.map(g => `<li class="d">${esc(g.bad)}</li>`).join("")}</ul>
   <div class="stats"><span>Year 1 <b>${f1(fte(d))}</b> FTE</span>${hasScale(d) ? `<span>Per 100 apps <b>${f1(per100(d))}</b></span>` : ""}<span>Confidence <b>${d.conf || "–"}</b></span></div></div>
   <div class="match"><div class="pct">${pct}%</div><div class="prog" aria-hidden="true"><i style="width:${pct}%"></i></div>
    <div class="btns"><button class="btn sm" data-act="open" data-id="${esc(d.id)}">Open</button><button class="btn sm" data-act="cmp" data-id="${esc(d.id)}" aria-pressed="${inC}">${inC ? "In compare" : "Compare"}</button></div>
    <button class="btn sm primary" data-act="ref" data-id="${esc(d.id)}">Use as reference</button></div></article>`;
}

/* ---------- browse ---------- */
function filtered() {
  const f = st.f;
  const rows = S.deals.filter(d => {
    if (f.ql !== "all" && d.q !== f.ql) return false;
    if (f.ind !== "all" && d.ind !== f.ind) return false;
    if (f.out !== "all" && d.out !== f.out) return false;
    if (f.tw.length && !f.tw.every(t => d.tw.includes(t))) return false;
    if (f.q) { const h = `${d.id} ${d.name} ${d.ind} ${d.tw.join(" ")} ${d.com} ${d.les}`.toLowerCase(); if (!h.includes(f.q.toLowerCase())) return false; }
    return true;
  });
  rows.sort((a, b) => f.sort === "fte" ? fte(b) - fte(a) : f.sort === "per100" ? per100(b) - per100(a)
    : f.sort === "quality" ? QRANK[a.q] - QRANK[b.q] || (a.date < b.date ? 1 : -1) : (a.date < b.date ? 1 : -1));
  return rows;
}
function viewBrowse() {
  const f = st.f;
  $("#view").innerHTML = `<section class="card"><header><h2>All published deals</h2><span class="sub" id="bcount"></span></header>
  <div class="filters">
   <div class="field grow"><label for="b-q">Search</label><input type="search" id="b-q" data-bf="q" placeholder="Industry, tower, commercial model, lesson" value="${esc(f.q)}"></div>
   <div class="field"><label for="b-ql">Quality</label><select id="b-ql" data-bf="ql"><option value="all">All</option>${["proven", "reviewed", "draft"].map(x => `<option value="${x}"${f.ql === x ? " selected" : ""}>${QUALITY[x]}</option>`).join("")}</select></div>
   <div class="field"><label for="b-ind">Industry</label><select id="b-ind" data-bf="ind"><option value="all">All</option>${INDS.map(x => `<option${f.ind === x ? " selected" : ""}>${x}</option>`).join("")}</select></div>
   <div class="field"><label for="b-out">Outcome</label><select id="b-out" data-bf="out"><option value="all">All</option>${OUTCOMES.map(x => `<option${f.out === x ? " selected" : ""}>${x}</option>`).join("")}</select></div>
   <div class="field"><span class="lab">Towers</span><div class="chips">${TOWERS.map(k => chipBtn("btw", k, f.tw.includes(k))).join("")}</div></div>
   <div class="field"><label for="b-sort">Sort</label><select id="b-sort" data-bf="sort">${[["recent", "Most recent"], ["quality", "Quality"], ["fte", "Year 1 FTE"], ["per100", "FTE per 100 apps"]].map(([v, l]) => `<option value="${v}"${f.sort === v ? " selected" : ""}>${l}</option>`).join("")}</select></div>
  </div>
  <div class="tw"><table><thead><tr><th><span class="sr">Compare</span></th><th>ID</th><th>Deal</th><th>Industry</th><th>Towers</th><th class="r">Apps</th><th class="r">Y1 FTE</th><th class="r">Per 100 apps</th><th>Quality</th><th>Outcome</th><th>Vs plan</th></tr></thead><tbody id="brows"></tbody></table></div></section>`;
  drawBrowseRows();
}
function drawBrowseRows() {
  const rows = filtered(), tb = $("#brows"); if (!tb) return;
  $("#bcount").textContent = `${rows.length} of ${S.deals.length} deals`;
  tb.innerHTML = rows.length ? rows.map(d => `<tr class="click" data-act="open" data-id="${esc(d.id)}"><td><input type="checkbox" data-act="cmpbox" data-id="${esc(d.id)}" aria-label="Compare ${esc(d.id)}"${st.cmp.includes(d.id) ? " checked" : ""}></td>
   <td class="mono">${esc(d.id)}</td><td>${esc(d.name)}</td><td>${esc(d.ind)}</td><td class="mono">${d.tw.join(" ")}</td><td class="r mono">${d.apps || "–"}</td><td class="r mono">${f1(fte(d))}</td><td class="r mono">${hasScale(d) ? f1(per100(d)) : "–"}</td><td>${qBadge(d)}</td><td>${esc(d.out)}</td><td>${accBadge(d)}</td></tr>`).join("")
    : `<tr><td colspan="11">${empty("No deals match these filters.", "", '<button class="btn sm" data-act="clear">Clear filters</button>')}</td></tr>`;
}

/* ---------- compare ---------- */
function viewCompare() {
  const ds = st.cmp.map(byId).filter(Boolean);
  if (ds.length < 2) {
    $("#view").innerHTML = empty("Pick two to four deals to compare", `Use Compare on a deal card in Find similar, or the checkbox in Browse.${ds.length ? ` You have picked ${ds.length}.` : ""}`, S.deals.length >= 3 ? '<button class="btn primary" data-act="cmptop">Compare my top 3 matches</button>' : "");
    return;
  }
  const ref = ds[0];
  const row = (label, fn, key) => `<tr><th scope="row" style="text-transform:none;letter-spacing:0;font-size:13px">${label}</th>${ds.map((d, i) => `<td class="${i > 0 && key && String(key(d)) !== String(key(ref)) ? "diff" : ""}">${fn(d)}</td>`).join("")}</tr>`;
  const roles = []; ds.forEach(d => Object.keys(d.team).forEach(k => { if (!roles.includes(k)) roles.push(k); }));
  const items = ds.filter(hasScale).map(d => ({ v: per100(d), label: d.id.replace("L-", ""), q: d.q }));
  $("#view").innerHTML = `<section class="card"><header><h2>Compare deals</h2><button class="btn sm" data-act="cmpclear">Clear</button></header>
  <p class="hint" style="margin:0">Shaded cells differ from the first deal.</p>
  <div class="tw"><table><thead><tr><th></th>${ds.map(d => `<th style="white-space:normal"><div class="mono" style="font-size:12px;text-transform:none">${esc(d.id)}</div></th>`).join("")}</tr></thead><tbody>
   ${row("Deal", d => esc(d.name))}${row("Industry", d => esc(d.ind), d => d.ind)}${row("Towers", d => d.tw.join(", "), d => d.tw.join())}
   ${row("Applications", d => d.apps || "–", d => d.apps)}${row("Tickets a month", d => d.tix || "–", d => d.tix)}${row("Coverage", d => d.cov, d => d.cov)}
   ${row("Term", d => d.term + " years", d => d.term)}${row("SLA tier", d => d.sla, d => d.sla)}${row("AIOps use cases", d => d.aip.length, d => d.aip.length)}
   ${row("Year 1 FTE", d => `<b class="mono">${f1(fte(d))}</b>`)}${row("Average FTE over the years", d => `<span class="mono">${f1(avgYears(d))}</span>`)}
   ${row("FTE per 100 apps", d => hasScale(d) ? `<b class="mono">${f1(per100(d))}</b>` : "–")}${row("Confidence score", d => d.conf || "–")}${row("Quality", qBadge)}
   ${row("Outcome and accuracy", d => `${esc(d.out)}<br>${accBadge(d)}`)}${row("Commercial model", d => esc(d.com) || "–", d => d.com)}
   <tr><th scope="row" colspan="${ds.length + 1}" style="background:var(--surface-2)">Team shape, Year 1 FTE</th></tr>
   ${roles.map(k => row(esc(k), d => d.team[k] != null ? `<span class="mono">${d.team[k]}</span>` : '<span style="color:var(--faint)">–</span>', d => d.team[k] || 0)).join("")}
  </tbody></table></div></section>
  ${items.length >= 2 ? `<section class="card" style="margin-top:18px"><header><h2>Where they sit</h2></header>${chart(items, null, "")}${legendQ()}</section>` : ""}`;
}

/* ---------- insights ---------- */
function viewInsights() {
  if (!S.deals.length) { $("#view").innerHTML = empty("Nothing to show yet", "Insights appear once deals are in the library."); return; }
  const pr = S.deals.filter(d => d.q === "proven" && d.acc != null);
  const inTol = pr.filter(d => Math.abs(d.acc) <= TOL).length;
  const mae = pr.length ? pr.reduce((a, d) => a + Math.abs(d.acc), 0) / pr.length : null;
  const asmCount = S.deals.reduce((a, d) => a + d.asm.filter(x => x.s !== "unk").length, 0);
  const map = new Map();
  S.deals.forEach(d => d.asm.forEach(a => { if (a.s === "unk") return; const k = a.t.toLowerCase(); const o = map.get(k) || { t: a.t, tw: a.tw, n: 0, h: 0 }; o.n++; if (a.s === "held") o.h++; map.set(k, o); }));
  const hit = [...map.values()].map(x => ({ ...x, r: x.h / x.n })).sort((a, b) => a.r - b.r || b.n - a.n);
  const tw = TOWERS.map(t => { const l = pr.filter(d => d.tw.includes(t)); return { t, n: l.length, v: l.length ? l.reduce((a, d) => a + d.acc, 0) / l.length : null }; }).filter(x => x.n);
  const uc = new Map();
  S.deals.forEach(d => d.aip.forEach(x => { if (x.act == null) return; const o = uc.get(x.uc) || { k: x.uc, n: 0, p: 0, a: 0 }; o.n++; o.p += x.plan; o.a += x.act; uc.set(x.uc, o); }));
  const ucs = [...uc.values()].map(o => ({ ...o, p: o.p / o.n, a: o.a / o.n })).sort((a, b) => a.a / a.p - b.a / b.p);
  const cnt = q => S.deals.filter(d => d.q === q).length;
  $("#view").innerHTML = `<div class="kpis">
   <div class="kpi"><span class="l">Deals in library</span><span class="v">${S.deals.length}</span><span class="d">${cnt("proven")} proven, ${cnt("reviewed")} reviewed, ${cnt("draft")} draft</span></div>
   <div class="kpi"><span class="l">Estimates within ±${TOL}%</span><span class="v">${pr.length ? `${inTol} of ${pr.length}` : "–"}</span><span class="d">Proven deals, actual FTE against plan</span></div>
   <div class="kpi"><span class="l">Average miss</span><span class="v">${mae == null ? "–" : f1(mae) + "%"}</span><span class="d">Absolute gap to plan, proven deals</span></div>
   <div class="kpi"><span class="l">Assumptions tracked</span><span class="v">${asmCount}</span><span class="d">Status recorded in delivery</span></div></div>
  <div class="grid2" style="margin-top:18px">
   <section class="card"><header><h2>Assumptions that hold</h2><span class="sub">Held, out of deals tracked</span></header>
    ${hit.length ? hit.map(x => { const c = x.r >= .75 ? "ok" : x.r >= .5 ? "warn" : "bad"; return `<div class="hr"><div>${esc(x.t)}<div class="hint">${esc(x.tw)}</div></div><div class="hbar" aria-hidden="true"><i style="width:${Math.round(x.r * 100)}%;background:var(--${c})"></i></div><span class="mono">${x.h} of ${x.n}</span></div>`; }).join("") : '<p class="hint" style="margin:0">No assumption has a delivery status yet. A curator records these when actuals are added.</p>'}</section>
   <section class="card"><header><h2>Estimate accuracy by tower</h2><span class="sub">Actual FTE vs plan, proven deals</span></header>
    ${tw.length ? tw.map(x => { const w = Math.min(50, Math.abs(x.v) / 15 * 50), bad = Math.abs(x.v) > TOL; return `<div class="hr"><div><b>${x.t}</b> <span class="hint">${TNAME[x.t]}</span></div><div class="dv" aria-hidden="true"><span class="tol" style="left:${50 - TOL / 15 * 50}%;width:${TOL / 15 * 100}%"></span><span class="zero"></span><span class="b" style="background:var(--${bad ? "bad" : "ok"});${x.v >= 0 ? "left:50%;" : `left:${50 - w}%;`}width:${w}%"></span></div><span class="mono">${x.v > 0 ? "+" : ""}${f1(x.v)}% <span class="hint">(${x.n})</span></span></div>`; }).join("") + `<p class="hint" style="margin:0">Green band is the ±${TOL}% tolerance. Bars to the right mean delivery needed more people than planned.</p>` : '<p class="hint" style="margin:0">No proven deals yet.</p>'}</section></div>
  <section class="card" style="margin-top:18px"><header><h2>AIOps deflection, planned and achieved</h2><span class="sub">Average % of tickets, use cases live in delivery</span></header>
   <div class="legend"><span><i style="background:var(--plan)"></i>Planned</span><span><i style="background:var(--accent)"></i>Achieved</span></div>
   ${ucs.length ? ucs.map(x => `<div class="hr"><div>${esc(x.k)}<div class="hint">${x.n} deal${x.n > 1 ? "s" : ""}</div></div><div class="pair"><div class="hbar"><i style="width:${x.p}%;background:var(--plan)"></i></div><div class="hbar"><i style="width:${x.a}%;background:var(--accent)"></i></div></div><span class="mono">${Math.round(x.p)}% / ${Math.round(x.a)}%</span></div>`).join("") : '<p class="hint" style="margin:0">No achieved deflection recorded yet.</p>'}</section>`;
}

/* ---------- add a deal ---------- */
function viewAdd() {
  const F = st.form;
  const res = st.result;
  const resHtml = res ? (res.blocked
    ? `<div class="err"><b>Not submitted. Fix these first.</b>${res.checks.filter(c => !c.ok).map(c => `<span><b>${esc(c.k)}.</b> ${esc(c.t)}</span>`).join("")}<span class="hint">Nothing was saved, so the text you entered has not reached the library.</span></div>`
    : `<div class="check ok"><b>Submitted as ${esc(res.id)}. It is waiting for a curator.</b>${res.checks.map(c => `<span>${c.ok ? "Pass" : "Check"}: <b>${esc(c.k)}.</b> ${esc(c.t)}</span>`).join("")}</div>`) : "";
  const catRows = S.catalogue.map(c => `<label class="chk"><input type="checkbox" data-asmcat="${esc(c.t)}"${F.asm.some(a => a.t === c.t) ? " checked" : ""}><span>${esc(c.t)} <span class="hint">${esc(c.tw)}</span></span></label>`).join("");
  const custom = F.asm.map((a, i) => ({ a, i })).filter(({ a }) => !S.catalogue.some(c => c.t === a.t));
  $("#view").innerHTML = `<section class="card"><header><h2>${F.id ? `Edit and resubmit ${esc(F.id)}` : "Add a deal"}</h2><span class="sub">Goes to a curator before it is published</span></header>
  ${resHtml}
  <div class="check"><b>Start from a Prism estimate file</b><span>Choose the .damo.json saved from Prism. It fills the scale, team, years and AIOps use cases. The customer name in the file is used only to check your text and is never saved.</span>
   <span class="hint">No file yet? <a href="example-prism-export.damo.json" download>Download an example</a> to try the import.</span><input type="file" id="importFile" accept=".json,application/json" aria-label="Prism estimate file">${F.imported ? `<span class="hint">${esc(F.importNote || "Imported from Prism.")} Check each field below, and complete industry, region and SLA tier, which Prism does not hold.</span>` : ""}</div>
  <form id="addForm" class="fsec" autocomplete="off" novalidate>
   <div class="fsec"><h3>About the deal</h3>
    <div class="field"><label for="a-name">Anonymised description</label><input type="text" id="a-name" data-form="name" maxlength="140" placeholder="Regional retailer, applications and infrastructure" value="${esc(F.name)}"><span class="hint">Industry and shape only. No customer, site or people names.</span></div>
    <div class="row2"><div class="field"><label for="a-ind">Industry</label><select id="a-ind" data-form="ind">${opts(INDS, F.ind)}</select></div>
     <div class="field"><label for="a-out">Outcome</label><select id="a-out" data-form="out">${opts(OUTCOMES, F.out)}</select></div></div>
    <div class="field"><span class="lab">Towers in scope</span><div class="chips">${TOWERS.map(k => chipBtn("ftw", k, F.tw.includes(k))).join("")}</div></div>
    <div class="row2"><div class="field"><label for="a-apps">Applications</label><input type="number" id="a-apps" data-form="apps" min="0" value="${esc(F.apps)}"></div>
     <div class="field"><label for="a-tix">Tickets a month</label><input type="number" id="a-tix" data-form="tix" min="0" value="${esc(F.tix)}"></div></div>
    <div class="row2"><div class="field"><label for="a-cov">Coverage</label><select id="a-cov" data-form="cov">${opts(COVS, F.cov)}</select></div>
     <div class="field"><label for="a-reg">Customer region</label><select id="a-reg" data-form="reg">${opts(REGIONS, F.reg)}</select></div></div>
    <div class="row2"><div class="field"><label for="a-term">Term (years)</label><input type="number" id="a-term" data-form="term" min="1" max="10" value="${esc(F.term)}"></div>
     <div class="field"><label for="a-sla">SLA tier</label><select id="a-sla" data-form="sla">${opts(SLAS, F.sla)}</select></div></div>
    <div class="row2"><div class="field"><label for="a-conf">Confidence score (0 to 100)</label><input type="number" id="a-conf" data-form="conf" min="0" max="100" value="${esc(F.conf)}"></div>
     <div class="field"><label for="a-by">Submitted by (team)</label><input type="text" id="a-by" data-form="by" maxlength="80" placeholder="SA team, EU" value="${esc(F.by)}"></div></div></div>
   <div class="fsec"><h3>Team shape, Year 1</h3>
    ${F.team.map((r, i) => `<div class="rowx"><select data-team-role="${i}" aria-label="Role ${i + 1}">${opts(ROLES, r.role)}</select><input type="number" min="0" step="0.05" data-team-fte="${i}" aria-label="FTE for role ${i + 1}" placeholder="FTE" value="${esc(r.fte)}"><button type="button" class="btn sm" data-act="rmteam" data-i="${i}" aria-label="Remove role ${i + 1}">Remove</button></div>`).join("")}
    <div class="btns"><button type="button" class="btn sm" data-act="addteam">Add a role</button><span class="sub" id="y1">Year 1 total: <b class="mono">${formY1().toFixed(2)}</b> FTE</span></div>
    <div class="field"><span class="lab">Later years, total FTE (optional)</span><div class="row2" style="grid-template-columns:repeat(4,minmax(0,1fr))">${[0, 1, 2, 3].map(i => `<input type="number" min="0" step="0.1" data-year="${i}" aria-label="Year ${i + 2} FTE" placeholder="Year ${i + 2}" value="${esc(F.years[i])}">`).join("")}</div></div></div>
   <div class="fsec"><h3>Assumptions</h3>${catRows}
    ${custom.map(({ a, i }) => `<div class="rowc"><input type="text" data-asm-text="${i}" maxlength="200" aria-label="Custom assumption" value="${esc(a.t)}"><select data-asm-tw="${i}" aria-label="Tower">${opts(["All", ...TOWERS], a.tw)}</select><button type="button" class="btn sm" data-act="rmasm" data-i="${i}">Remove</button></div>`).join("")}
    <div><button type="button" class="btn sm" data-act="addasm">Add another assumption</button></div></div>
   <div class="fsec"><h3>AIOps use cases</h3>
    ${F.aip.map((a, i) => `<div class="rowa"><select data-aip-uc="${i}" aria-label="Use case">${opts(USE_CASES, a.uc)}</select><input type="number" min="1" max="10" data-aip-from="${i}" aria-label="Live from year" placeholder="From year" value="${esc(a.from)}"><input type="number" min="0" max="100" data-aip-plan="${i}" aria-label="Planned deflection percent" placeholder="Planned %" value="${esc(a.plan)}"><button type="button" class="btn sm" data-act="rmaip" data-i="${i}">Remove</button></div>`).join("")}
    <div><button type="button" class="btn sm" data-act="addaip">Add a use case</button></div></div>
   <div class="fsec"><h3>Commercial model and lessons</h3>
    <div class="field"><label for="a-com">Commercial model</label><input type="text" id="a-com" data-form="com" maxlength="300" placeholder="Fixed fee per tower with a ±10% volume band" value="${esc(F.com)}"><span class="hint">Describe the structure. Do not enter rates or amounts.</span></div>
    <div class="field"><label for="a-les">Lessons or notes</label><textarea id="a-les" data-form="les" maxlength="1500">${esc(F.les)}</textarea></div></div>
   <div class="btns"><button type="submit" class="btn primary" id="submitBtn">Submit for review</button><button type="button" class="btn" data-act="resetform">Clear the form</button></div>
  </form></section>`;
}
function formY1() { return st.form.team.reduce((a, r) => a + (+r.fte || 0), 0); }
function formPayload() {
  const F = st.form;
  const team = {}; F.team.forEach(r => { const n = +r.fte; if (n > 0) team[r.role] = (team[r.role] || 0) + n; });
  const ys = F.years.map(v => +v).filter(v => v > 0);
  return { id: F.id || undefined, name: F.name, ind: F.ind, tw: F.tw, apps: F.apps === "" ? 0 : +F.apps, tix: F.tix === "" ? 0 : +F.tix, cov: F.cov, reg: F.reg, term: +F.term, sla: F.sla, out: F.out, by: F.by,
    team, years: [0, ...ys], conf: F.conf === "" ? 0 : +F.conf, asm: F.asm, aip: F.aip.map(a => ({ uc: a.uc, from: +a.from || 1, plan: +a.plan || 0 })), com: F.com, les: F.les, framework: F.framework };
}
/* Both ways in (a saved Prism file, or the link Prism opens) end here. The summary is untrusted input: every field is checked
   against the lists before it reaches the form, and the person still reviews and submits. */
const num0 = v => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && isFinite(+v) ? +v : 0);
function fromBlock(b, deny, note) {
  const F = blankForm();
  F.imported = true; F.framework = num0(b.v) || 1; F.importNote = note || "";
  F.tw = (Array.isArray(b.towers) ? b.towers : []).filter(t => TOWERS.includes(t));   /* never guess a tower: an estimate with none leaves the choice to the person */
  if (!F.tw.length) F.importNote = ((note || "") + " This estimate has no service towers, so no tower is selected. Pick the towers that apply.").trim();
  F.apps = num0(b.apps) || ""; F.tix = num0(b.tickets) || ""; F.cov = COVS.includes(b.coverage) ? b.coverage : "24x7"; F.term = Math.min(10, Math.max(1, Math.round(num0(b.term)) || 3));
  F.conf = Math.min(100, Math.max(0, Math.round(num0(b.confidence)))) || "";
  F.team = Object.entries(b.team && typeof b.team === "object" ? b.team : {}).filter(([k, v]) => ROLES.includes(k) && num0(v) > 0).slice(0, 30).map(([role, v]) => ({ role, fte: num0(v) }));
  if (!F.team.length) F.team = [{ role: "System Support Engineer", fte: "" }];
  F.years = [0, 1, 2, 3].map(i => (Array.isArray(b.years) && num0(b.years[i + 1])) || "");
  F.aip = (Array.isArray(b.aiops) ? b.aiops : []).slice(0, 20).map(a => ({ uc: USE_CASES.includes(a && a.uc) ? a.uc : "Other", from: Math.max(1, Math.round(num0(a && a.from)) || 1), plan: Math.min(100, Math.max(0, Math.round(num0(a && a.deflection)))) }));
  F.asm = (Array.isArray(b.assumptions) ? b.assumptions : []).slice(0, 40).map(t => ({ t: String(t).slice(0, 200), tw: "All", s: "unk" })).filter(a => a.t.trim());
  F.deny = (Array.isArray(deny) ? deny : []).slice(0, 20).map(x => String(x).slice(0, 120)).filter(Boolean);
  return F;
}
function fromPrism(j) {
  if (!j || j.app !== "damo-estimation-workflow" || !j.state) throw new Error("This is not a Prism estimate file.");
  const b = j.library;
  if (!b || typeof b !== "object") throw new Error("This file has no library summary. Open it in the latest Prism and save it again.");
  const s = j.state;
  return fromBlock(b, [s.deal, s.meta && s.meta.preparedBy, s.meta && s.meta.approvedBy].filter(Boolean), "Imported from a saved Prism file.");
}
/* The link Prism opens carries the summary after the "#", so it never reaches a server. Read it once, then clear the address bar. */
let incoming = null;
try {
  const m = location.hash.match(/^#import=([A-Za-z0-9_-]{1,200000})$/);
  if (m) {
    const bin = atob(m[1].replace(/-/g, "+").replace(/_/g, "/"));
    const j = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
    if (j && j.v === 1 && j.library && typeof j.library === "object") incoming = j;
  }
  if (location.hash.startsWith("#import=")) history.replaceState(null, "", location.pathname + location.search);
} catch { incoming = null; }

/* ---------- curation ---------- */
function viewCuration() {
  if (!S.curator) {
    $("#view").innerHTML = empty("Curators only", "The review queue holds submissions that have not been published, so it is limited to curators.", '<button class="btn primary" data-act="signin">Curator sign-in</button>');
    return;
  }
  const q = S.queue;
  const stl = { pending: "", returned: "Returned", rejected: "Rejected" };
  $("#view").innerHTML = `<div class="stack">
   <section class="card"><header><h2>Review queue</h2><span class="sub">Anonymisation must pass before a deal can be published</span></header>
    <p class="hint" style="margin:0">Approved deals appear as Reviewed. They become Proven when delivery actuals are recorded on the deal page.</p>
    <div class="btns"><button class="btn sm" data-act="backup">Download a backup</button>${S.sample ? '<button class="btn sm" data-act="clearsamples">Remove sample deals</button>' : ""}<button class="btn sm" data-act="denylist">Blocked terms (${S.denylist.length})</button><button class="btn sm" data-act="addcat">Add a catalogue assumption</button></div></section>
   ${q.length ? q.map(d => `<section class="card"><header><div><span class="mono sub">${esc(d.id)}</span> <b>${esc(d.name)}</b></div>${d.status === "pending" ? `<span class="sub">${esc(d.by)} · ${esc(d.date)}</span>` : `<span class="q draft">${stl[d.status]}</span>`}</header>
     <div class="stats" style="margin:0"><span>${esc(d.ind)}</span><span>${d.tw.join(", ")}</span><span>Year 1 <b>${f1(fte(d))}</b> FTE</span><span>${d.apps || "–"} apps</span></div>
     ${(d.checks || []).length ? `<div class="qc">${d.checks.map(c => `<div class="r"><b class="${c.ok ? "p" : "f"}">${c.ok ? "Pass" : "Check"}</b><span><b>${esc(c.k)}.</b> ${esc(c.t)}</span></div>`).join("")}</div>` : ""}
     ${d.returnNote ? `<div class="check"><b>Curator note</b><span>${esc(d.returnNote)}</span></div>` : ""}
     <div class="btns">${d.status === "pending" ? `<button class="btn primary sm" data-act="qa" data-id="${esc(d.id)}">Approve and publish</button><button class="btn sm" data-act="qr" data-id="${esc(d.id)}">Return to submitter</button><button class="btn sm" data-act="qx" data-id="${esc(d.id)}">Reject</button>` : ""}${d.status === "returned" ? `<button class="btn sm" data-act="edit" data-id="${esc(d.id)}">Edit and resubmit</button>` : ""}<button class="btn sm" data-act="open" data-id="${esc(d.id)}">Open</button></div></section>`).join("")
     : empty("The queue is empty", "New submissions appear here.")}</div>`;
}

/* ---------- drawer and dialogs ---------- */
const layer = $("#layer");
let lastFocus = null;
function openLayer(html, center) {
  lastFocus = document.activeElement;
  layer.innerHTML = `<div class="overlay${center ? " center" : ""}" data-act="closeov">${html}</div>`;
  const f = layer.querySelector("[data-focus]") || layer.querySelector("button"); if (f) f.focus();
}
function closeLayer() { layer.innerHTML = ""; if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch { /* element gone */ } } }
function openDeal(id) {
  const d = byId(id); if (!d) return;
  const y = yearsOf(d), mx = Math.max(...Object.values(d.team), 0.01), cur = S.curator && d.status === "published";
  openLayer(`<aside class="drawer" role="dialog" aria-modal="true" aria-label="Deal ${esc(d.id)}" tabindex="-1">
   <div style="display:flex;justify-content:space-between;gap:12px;align-items:start"><div><span class="mono sub">${esc(d.id)}</span><h2>${esc(d.name)}</h2></div><button class="btn sm" data-act="close" data-focus>Close</button></div>
   <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${qBadge(d)}<span class="o">${esc(d.out)}</span>${accBadge(d)}${d.sample ? '<span class="badge sample">Sample</span>' : ""}</div>
   <div class="btns">${d.status === "published" ? `<button class="btn primary" data-act="ref" data-id="${esc(d.id)}">Use as reference</button><button class="btn" data-act="cmp" data-id="${esc(d.id)}">${st.cmp.includes(d.id) ? "Remove from compare" : "Add to compare"}</button>` : ""}
    ${cur ? `<button class="btn" data-act="actuals" data-id="${esc(d.id)}">Record delivery actuals</button><button class="btn" data-act="retire" data-id="${esc(d.id)}">Retire</button>` : ""}</div>
   <section class="card"><h2>Profile</h2><div class="kv"><div><span>Industry</span><b>${esc(d.ind)}</b></div><div><span>Towers</span><b>${d.tw.join(", ")}</b></div><div><span>Applications</span><b>${d.apps || "–"}</b></div><div><span>Tickets a month</span><b>${d.tix || "–"}</b></div><div><span>Coverage</span><b>${esc(d.cov)}</b></div><div><span>Customer region</span><b>${esc(d.reg)}</b></div><div><span>Term</span><b>${d.term} years</b></div><div><span>SLA tier</span><b>${esc(d.sla)}</b></div><div><span>Confidence</span><b>${d.conf ? d.conf + " of 100" : "–"}</b></div></div></section>
   <section class="card"><header><h2>Team shape</h2><span class="sub mono">${y.map((v, i) => `Y${i + 1} ${f1(v)}`).join(" · ")}</span></header>
    ${Object.entries(d.team).map(([k, v]) => `<div class="hr"><span>${esc(k)}</span><div class="hbar" aria-hidden="true"><i style="width:${v / mx * 100}%;background:var(--plan)"></i></div><span class="mono">${v}</span></div>`).join("")}
    <p class="hint" style="margin:0">${hasScale(d) ? f1(per100(d)) + " FTE per 100 applications. " : ""}Average ${f1(avgYears(d))} FTE over the term.</p></section>
   <section class="card"><h2>Assumptions</h2>${d.asm.length ? d.asm.map(a => `<div class="asm"><span>${esc(a.t)}</span><span class="st ${a.s}">${ASM_STATUS[a.s]}</span></div>`).join("") : '<p class="hint" style="margin:0">No assumptions recorded.</p>'}</section>
   <section class="card"><h2>AIOps pack</h2>${d.aip.length ? d.aip.map(x => `<div class="hr"><span>${esc(x.uc)}<div class="hint">From year ${x.from}</div></span><div class="pair"><div class="hbar"><i style="width:${x.plan}%;background:var(--plan)"></i></div>${x.act != null ? `<div class="hbar"><i style="width:${x.act}%;background:var(--accent)"></i></div>` : ""}</div><span class="mono">${x.plan}%${x.act != null ? ` / ${x.act}%` : ""}</span></div>`).join("") + `<p class="hint" style="margin:0">Planned deflection${d.aip.some(x => x.act != null) ? " and achieved deflection from delivery." : ". No actuals yet."}</p>` : '<p class="hint" style="margin:0">AIOps was not in scope.</p>'}</section>
   <section class="card"><h2>Commercial model</h2><p style="margin:0">${esc(d.com) || '<span class="hint">Not recorded.</span>'}</p></section>
   <section class="card"><h2>Lessons</h2><p style="margin:0">${d.les ? esc(d.les) : '<span class="hint">None recorded yet.</span>'}</p></section>
   <section class="card"><h2>History</h2><ul class="hist">${(d.history || []).slice().reverse().map(h => `<li><span class="mono">${esc((h.at || "").slice(0, 10))}</span> ${esc(h.action)}${h.note ? ": " + esc(h.note) : ""}</li>`).join("")}</ul></section>
  </aside>`);
}
function refText(d, sel) {
  const L = [`# Reference: ${d.name} (${d.id})`, "", `Source: Prism Library. ${QUALITY[d.q]}${d.acc != null ? `, delivery ${d.acc > 0 ? "+" : ""}${d.acc}% against plan` : ""}. Outcome: ${d.out}.`];
  if (sel.prof) L.push("", "## Profile", `- Industry: ${d.ind}`, `- Towers: ${d.tw.join(", ")}`, `- Applications: ${d.apps || "not recorded"}`, `- Tickets a month: ${d.tix || "not recorded"}`, `- Coverage: ${d.cov}`, `- Customer region: ${d.reg}`, `- Term: ${d.term} years`, `- SLA tier: ${d.sla}`);
  if (sel.team) { L.push("", "## Team shape, Year 1", ...Object.entries(d.team).map(([k, v]) => `- ${k}: ${v}`), `- Total: ${f1(fte(d))} FTE`, `- By year: ${yearsOf(d).map((v, i) => `Y${i + 1} ${f1(v)}`).join(", ")}`); if (hasScale(d)) L.push(`- ${f1(per100(d))} FTE per 100 applications`); }
  if (sel.asm && d.asm.length) L.push("", "## Assumptions", ...d.asm.map(a => `- ${a.t} (${ASM_STATUS[a.s]})`));
  if (sel.aip && d.aip.length) L.push("", "## AIOps pack", ...d.aip.map(a => `- ${a.uc}: from year ${a.from}, planned deflection ${a.plan}%${a.act != null ? `, achieved ${a.act}%` : ""}`));
  if (sel.com && d.com) L.push("", "## Commercial model", d.com);
  if (sel.les && d.les) L.push("", "## Lessons", d.les);
  return L.join("\n");
}
function openRef(id) {
  const d = byId(id); if (!d) return;
  st.ref = { id, sel: { prof: true, team: true, asm: true, aip: true, com: false, les: true } };
  drawRef();
}
function drawRef() {
  const { id, sel } = st.ref, d = byId(id);
  const items = [["prof", "Profile"], ["team", "Team shape"], ["asm", "Assumptions"], ["aip", "AIOps pack"], ["com", "Commercial model"], ["les", "Lessons"]];
  const flags = [];
  const p = st.p;
  if (d.cov !== p.cov) flags.push(`Coverage is ${d.cov} here and ${p.cov} in your deal profile.`);
  if (d.q === "draft") flags.push("This is a draft that has not been proven in delivery.");
  if (d.acc != null && Math.abs(d.acc) > TOL) flags.push(`Delivery ran ${d.acc > 0 ? "+" : ""}${d.acc}% against plan. Read the lessons first.`);
  const bad = d.asm.filter(a => a.s === "broken" || a.s === "risk").length;
  if (bad) flags.push(`${bad} of this deal's assumptions broke or were at risk in delivery.`);
  openLayer(`<div class="modal" role="dialog" aria-modal="true" aria-label="Reference sheet for ${esc(d.id)}">
   <h2>Reference sheet for ${esc(d.id)}</h2><p class="hint" style="margin:0">Choose what to include, then copy it into your Prism estimate or notes. Prism does not import it automatically yet.</p>
   <div class="chips">${items.map(([k, l]) => `<label class="chk"><input type="checkbox" data-refsel="${k}"${sel[k] ? " checked" : ""}> ${l}</label>`).join("")}</div>
   ${flags.length ? `<div class="check high"><b>Re-check before you reuse it</b>${flags.map(f => `<span>${esc(f)}</span>`).join("")}</div>` : ""}
   <textarea class="mono-box" id="refText" readonly aria-label="Reference text">${esc(refText(d, sel))}</textarea>
   <div class="btns"><button class="btn primary" data-act="refcopy" data-focus>Copy text</button><button class="btn" data-act="refdl">Download as file</button><button class="btn" data-act="close">Close</button></div></div>`, true);
}
function openActuals(id) {
  const d = byId(id); if (!d) return;
  openLayer(`<div class="modal" role="dialog" aria-modal="true" aria-label="Record delivery actuals for ${esc(d.id)}">
   <h2>Record delivery actuals</h2><p class="hint" style="margin:0">${esc(d.id)}: ${esc(d.name)}. This marks the deal as Proven.</p>
   <div class="field"><label for="ac-acc">Actual FTE against plan (%)</label><input type="number" id="ac-acc" step="0.1" placeholder="4 means delivery needed 4% more than planned" data-focus></div>
   ${d.asm.length ? `<div class="field"><span class="lab">Assumption status in delivery</span>${d.asm.map((a, i) => `<div class="rowc" style="grid-template-columns:minmax(0,1fr) 140px"><span>${esc(a.t)}</span><select data-ac-asm="${i}" aria-label="Status of ${esc(a.t)}">${Object.entries(ASM_STATUS).map(([k, l]) => `<option value="${k}"${a.s === k ? " selected" : ""}>${l}</option>`).join("")}</select></div>`).join("")}</div>` : ""}
   ${d.aip.length ? `<div class="field"><span class="lab">Achieved deflection (%)</span>${d.aip.map((a, i) => `<div class="rowc" style="grid-template-columns:minmax(0,1fr) 100px"><span>${esc(a.uc)} <span class="hint">planned ${a.plan}%</span></span><input type="number" min="0" max="100" data-ac-aip="${i}" aria-label="Achieved deflection for ${esc(a.uc)}" value="${a.act ?? ""}"></div>`).join("")}</div>` : ""}
   <div class="field"><label for="ac-les">Lessons</label><textarea id="ac-les" maxlength="1500">${esc(d.les)}</textarea></div>
   <div class="btns"><button class="btn primary" data-act="acsave" data-id="${esc(d.id)}">Save actuals</button><button class="btn" data-act="close">Cancel</button></div></div>`, true);
}
function promptDialog(title, hint, label, ok, extra = "") {
  return new Promise(resolve => {
    openLayer(`<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h2>${esc(title)}</h2>${hint ? `<p class="hint" style="margin:0">${esc(hint)}</p>` : ""}
     ${extra}<div class="field"><label for="pd-v">${esc(label)}</label><input type="${title.includes("key") ? "password" : "text"}" id="pd-v" data-focus></div>
     <div class="btns"><button class="btn primary" data-act="pdok">${esc(ok)}</button><button class="btn" data-act="pdno">Cancel</button></div></div>`, true);
    promptDialog.done = v => { promptDialog.done = null; closeLayer(); resolve(v); };
  });
}

/* ---------- events ---------- */
async function show(tab) {
  st.tab = tab; drawTabs();
  ({ find: viewFind, browse: viewBrowse, compare: viewCompare, insights: viewInsights, add: viewAdd, curation: viewCuration })[tab]();
}
function toggleCmp(id) {
  const i = st.cmp.indexOf(id);
  if (i >= 0) st.cmp.splice(i, 1);
  else if (st.cmp.length >= 4) { toast("Compare holds four deals. Remove one first."); return false; }
  else st.cmp.push(id);
  drawTabs(); return true;
}
async function act(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(typeof okMsg === "function" ? okMsg(r) : okMsg); return r; }
  catch (e) { toast(e.message); return null; }
}

document.addEventListener("click", async e => {
  const t = e.target.closest("[data-act]"); if (!t) return;
  const a = t.dataset.act, id = t.dataset.id;
  if (a === "closeov") { if (e.target === t) closeLayer(); return; }
  if (a === "cmpbox") return;
  if (e.target.closest("[data-act='cmpbox']") && a === "open") return;
  if (a === "tab") return show(t.dataset.tab);
  if (a === "ptw") { const v = t.dataset.v, i = st.p.tw.indexOf(v); i >= 0 ? st.p.tw.splice(i, 1) : st.p.tw.push(v); t.setAttribute("aria-pressed", i < 0); return drawResults(); }
  if (a === "btw") { const v = t.dataset.v, i = st.f.tw.indexOf(v); i >= 0 ? st.f.tw.splice(i, 1) : st.f.tw.push(v); t.setAttribute("aria-pressed", i < 0); return drawBrowseRows(); }
  if (a === "ftw") { const v = t.dataset.v, i = st.form.tw.indexOf(v); i >= 0 ? st.form.tw.splice(i, 1) : st.form.tw.push(v); return t.setAttribute("aria-pressed", i < 0); }
  if (a === "open") return openDeal(id);
  if (a === "close" || a === "pdno") { if (promptDialog.done) return promptDialog.done(null); return closeLayer(); }
  if (a === "cmp") { const dr = layer.querySelector(".drawer"); if (toggleCmp(id)) { if (dr) openDeal(id); else if (st.tab === "find") drawResults(); } return; }
  if (a === "cmpclear") { st.cmp = []; return show("compare"); }
  if (a === "cmptop") { st.cmp = rankFor(st.p, S.deals).slice(0, 3).map(r => r.d.id); return show("compare"); }
  if (a === "clear") { st.f = { q: "", ql: "all", ind: "all", tw: [], out: "all", sort: "recent" }; return viewBrowse(); }
  if (a === "ref") return openRef(id);
  if (a === "refcopy") {
    const ta = $("#refText");
    try { await navigator.clipboard.writeText(ta.value); toast("Copied."); } catch { ta.select(); toast("Press Ctrl+C or Cmd+C to copy the selected text."); }
    return;
  }
  if (a === "refdl") {
    const d = byId(st.ref.id), blob = new Blob([$("#refText").value], { type: "text/markdown" }), el = document.createElement("a");
    el.href = URL.createObjectURL(blob); el.download = `${d.id}-reference.md`; document.body.appendChild(el); el.click(); setTimeout(() => { URL.revokeObjectURL(el.href); el.remove(); }, 1000); return;
  }
  if (a === "signin") return curatorSignIn();
  if (a === "backup") {
    try {
      const r = await fetch("/api/export", { headers: { "x-curator-key": keyGet(), "x-access-key": accGet() } });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Backup failed.");
      const blob = await r.blob(), el = document.createElement("a");
      el.href = URL.createObjectURL(blob); el.download = "prism-library-backup.json"; document.body.appendChild(el); el.click(); setTimeout(() => { URL.revokeObjectURL(el.href); el.remove(); }, 1000);
    } catch (err) { toast(err.message); }
    return;
  }
  if (a === "addteam") { st.form.team.push({ role: "System Support Engineer", fte: "" }); return viewAdd(); }
  if (a === "rmteam") { st.form.team.splice(+t.dataset.i, 1); if (!st.form.team.length) st.form.team.push({ role: "System Support Engineer", fte: "" }); return viewAdd(); }
  if (a === "addasm") { st.form.asm.push({ t: "", tw: "All", s: "unk" }); return viewAdd(); }
  if (a === "rmasm") { st.form.asm.splice(+t.dataset.i, 1); return viewAdd(); }
  if (a === "addaip") { st.form.aip.push({ uc: USE_CASES[0], from: 1, plan: 15 }); return viewAdd(); }
  if (a === "rmaip") { st.form.aip.splice(+t.dataset.i, 1); return viewAdd(); }
  if (a === "resetform") { st.form = blankForm(); st.result = null; return viewAdd(); }
  if (a === "edit") { const d = byId(id); const F = blankForm(); Object.assign(F, { id: d.id, name: d.name, ind: d.ind, tw: [...d.tw], apps: d.apps, tix: d.tix, cov: d.cov, reg: d.reg, term: d.term, sla: d.sla, out: d.out, by: d.by, conf: d.conf, com: d.com, les: d.les, framework: d.framework });
    F.team = Object.entries(d.team).map(([role, v]) => ({ role, fte: v })); F.years = [1, 2, 3, 4].map(i => d.years[i] || ""); F.asm = d.asm.map(x => ({ ...x })); F.aip = d.aip.map(x => ({ uc: x.uc, from: x.from, plan: x.plan })); st.form = F; st.result = null; return show("add"); }
  if (a === "qa") { await act(() => api(`/api/queue/${id}/decision`, { action: "approve" }), `${id} approved. It is now in the library as Reviewed.`); await reload(); drawTabs(); return viewCuration(); }
  if (a === "qr" || a === "qx") {
    const note = await promptDialog(a === "qr" ? "Return to submitter" : "Reject submission", "", a === "qr" ? "What needs fixing? (shown with the submission)" : "Reason (optional)", a === "qr" ? "Return" : "Reject");
    if (note === null) return;
    await act(() => api(`/api/queue/${id}/decision`, { action: a === "qr" ? "return" : "reject", note }), `${id} ${a === "qr" ? "returned" : "rejected"}.`); await reload(); drawTabs(); return viewCuration();
  }
  if (a === "actuals") return openActuals(id);
  if (a === "acsave") {
    const d = byId(id), body = { acc: $("#ac-acc").value, les: $("#ac-les").value };
    body.asm = d.asm.map((_, i) => layer.querySelector(`[data-ac-asm="${i}"]`).value);
    body.aip = d.aip.map((_, i) => layer.querySelector(`[data-ac-aip="${i}"]`).value);
    const r = await act(() => api(`/api/deals/${id}/actuals`, body), `${id} is now Proven.`);
    if (r) { closeLayer(); await reload(); drawTabs(); show(st.tab); }
    return;
  }
  if (a === "retire") { const r = await act(() => api(`/api/deals/${id}/retire`, {}), `${id} retired. It no longer appears in searches.`); if (r) { closeLayer(); st.cmp = st.cmp.filter(x => x !== id); await reload(); drawTabs(); show(st.tab); } return; }
  if (a === "clearsamples") { const r = await act(() => api("/api/clear-samples", {}), r2 => `Removed ${r2.removed} sample deals.`); if (r) { await reload(); drawTabs(); viewCuration(); } return; }
  if (a === "denylist") {
    const v = await promptDialog("Blocked terms", "Names that must never appear in a submission, such as customer names. One per line is not needed: separate with commas.", "Terms", "Save");
    if (v === null) return;
    const r = await act(() => api("/api/denylist", { terms: v.split(",") }), r2 => `${r2.denylist.length} blocked terms saved.`); if (r) { await reload(); viewCuration(); } return;
  }
  if (a === "addcat") {
    const v = await promptDialog("Add a catalogue assumption", "Appears as a checkbox on the Add a deal form.", "Assumption", "Add");
    if (!v) return;
    const r = await act(() => api("/api/catalogue", { t: v, tw: "All" }), "Added to the catalogue."); if (r) await reload(); return;
  }
  if (a === "pdok") { const v = $("#pd-v").value; return promptDialog.done && promptDialog.done(v); }
});

/* a checkbox inside a clickable row must not open the drawer, so handle it before the main click handler */
document.addEventListener("click", e => {
  const c = e.target.closest("[data-act='cmpbox']"); if (!c) return;
  e.stopPropagation();
  if (!toggleCmp(c.dataset.id)) c.checked = false;
}, true);

document.addEventListener("input", e => {
  const t = e.target, d = t.dataset;
  if ("f" in d) {
    const k = d.f;
    if (t.type === "checkbox") st.p[k] = t.checked;
    else if (["apps", "tix", "term", "est"].includes(k)) { const n = parseFloat(t.value); if (!(n >= 0) || (k !== "est" && n === 0)) return; st.p[k] = n; }
    else st.p[k] = t.value;
    drawResults();
  } else if ("bf" in d) { st.f[d.bf] = t.value; drawBrowseRows(); }
  else if ("refsel" in d) { st.ref.sel[d.refsel] = t.checked; drawRef(); }
  else if ("form" in d) { st.form[d.form] = t.value; }
  else if ("teamRole" in d) { st.form.team[+d.teamRole].role = t.value; }
  else if ("teamFte" in d) { st.form.team[+d.teamFte].fte = t.value; const y = $("#y1"); if (y) y.innerHTML = `Year 1 total: <b class="mono">${formY1().toFixed(2)}</b> FTE`; }
  else if ("year" in d) { st.form.years[+d.year] = t.value; }
  else if ("asmcat" in d) {
    if (t.checked) st.form.asm.push({ t: d.asmcat, tw: (S.catalogue.find(c => c.t === d.asmcat) || {}).tw || "All", s: "unk" });
    else st.form.asm = st.form.asm.filter(a => a.t !== d.asmcat);
  }
  else if ("asmText" in d) { st.form.asm[+d.asmText].t = t.value; }
  else if ("asmTw" in d) { st.form.asm[+d.asmTw].tw = t.value; }
  else if ("aipUc" in d) { st.form.aip[+d.aipUc].uc = t.value; }
  else if ("aipFrom" in d) { st.form.aip[+d.aipFrom].from = t.value; }
  else if ("aipPlan" in d) { st.form.aip[+d.aipPlan].plan = t.value; }
});

document.addEventListener("change", async e => {
  if (e.target.id !== "importFile" || !e.target.files[0]) return;
  try {
    const j = JSON.parse(await e.target.files[0].text());
    st.form = fromPrism(j); st.result = null; viewAdd(); toast("Prism file read. Complete the remaining fields.");
  } catch (err) { toast(err instanceof SyntaxError ? "That file is not valid JSON." : err.message); e.target.value = ""; }
});

document.addEventListener("submit", async e => {
  if (e.target.id !== "addForm") return;
  e.preventDefault();
  const btn = $("#submitBtn"); btn.disabled = true;
  try {
    const r = await api("/api/submit", { deal: formPayload(), deny: st.form.deny });
    st.result = r;
    if (!r.blocked) { st.form = blankForm(); await reload(); drawTabs(); }
    viewAdd(); window.scrollTo(0, 0);
  } catch (err) {
    if (err.errors) { st.result = { blocked: true, checks: [{ k: "Form", ok: false, t: err.errors.join(" ") }] }; viewAdd(); window.scrollTo(0, 0); }
    else toast(err.message);
    btn.disabled = false;
  }
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && layer.innerHTML) { if (promptDialog.done) promptDialog.done(null); else closeLayer(); }
  if (e.key === "Enter" && e.target.id === "pd-v") { e.preventDefault(); promptDialog.done && promptDialog.done(e.target.value); }
});

async function curatorSignIn() {
  const k = await promptDialog("Curator key", "Enter the key your administrator set for this library.", "Key", "Sign in");
  if (k === null) return;
  keySet(k);
  try { await reload(); } catch (err) { toast(err.message); }
  if (!S.curator) toast("That key was not accepted."); else toast("Signed in as curator.");
  drawTabs(); show(st.tab);
}
$("#curBtn").addEventListener("click", () => { if (!S.curator) curatorSignIn(); });

/* ---------- start ---------- */
function lockScreen(msg) {
  $("#tabs").innerHTML = "";
  $("#view").innerHTML = `<section class="card" style="max-width:420px;margin:40px auto"><h2>Private beta</h2>
   <p class="hint" style="margin:0">This library is not open to the team yet. Enter the access key to continue.</p>
   ${msg ? `<div class="err">${esc(msg)}</div>` : ""}
   <form id="lockForm" class="form"><div class="field"><label for="lockKey">Access key</label><input type="password" id="lockKey" autocomplete="current-password"></div>
   <button type="submit" class="btn primary">Open the library</button></form></section>`;
  const f = $("#lockKey"); if (f) f.focus();
}
document.addEventListener("submit", async e => {
  if (e.target.id !== "lockForm") return;
  e.preventDefault();
  accSet($("#lockKey").value);
  await boot();
});
async function boot() {
  try { await reload(); }
  catch (e) {
    if (e.gate) return lockScreen(accGet() ? "That key was not accepted." : "");
    $("#view").innerHTML = empty("The library server is not reachable", e.message); return;
  }
  if (incoming) {
    const j = incoming; incoming = null;
    st.form = fromBlock(j.library, j.deny, `Received from Prism${j.version ? `, version ${num0(j.version)}` : ""}, ${j.status === "approved" ? "approved" : "not yet approved (it will go in as a draft)"}.`);
    st.result = null; show("add"); toast("Estimate received from Prism. Complete the remaining fields, then submit."); return;
  }
  show("find");
}
boot();
