/* Prism Library local server: static files plus the JSON API from lib/api.mjs. No dependencies.
   npm start        real library, data in ./data
   npm run demo     the sample deals, data in ./data-demo
   LIBRARY_ACCESS_KEY   require a key to open anything (every API call)
   LIBRARY_CURATOR_KEY  require a separate key for curator actions (approve, return, reject, record actuals, retire) */
import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openStore } from "./lib/store.mjs";
import { createApi } from "./lib/api.mjs";
import sampleDoc from "./seed/sample.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(ROOT, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml" };

export async function start({ dataDir = path.join(ROOT, "data"), port = 8792, curatorKey = "", accessKey = "", accessKeyHash = "", sample = false, host = process.env.HOST || "127.0.0.1" } = {}) {
  const store = openStore(dataDir, sample ? () => JSON.parse(JSON.stringify(sampleDoc)) : null);
  const api = createApi(store, { curatorKey, accessKey, accessKeyHash });

  async function readBody(req) {
    const chunks = []; let n = 0;
    for await (const c of req) { n += c.length; if (n > 1_000_000) return null; chunks.push(c); }
    return Buffer.concat(chunks).toString("utf8");
  }
  const send = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(obj)); };

  async function files(req, res, url) {
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/") rel = "/index.html";
    const file = path.normalize(path.join(PUB, rel));
    if (!file.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end("Forbidden"); }
    try {
      const data = await fs.readFile(file);
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
      res.end(data);
    } catch { res.writeHead(404, { "content-type": "text/plain" }); res.end("Not found"); }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    try {
      if (url.pathname.startsWith("/api/")) {
        const text = req.method === "POST" ? await readBody(req) : "";
        if (text === null) return send(res, 413, { error: "Request too large." });
        const r = await api.handle({ method: req.method, path: url.pathname, headers: req.headers, text });
        if (r.raw !== undefined) { res.writeHead(r.status, r.headers); return res.end(r.raw); }
        return send(res, r.status, r.json);
      }
      await files(req, res, url);
    } catch (e) { console.error(e); send(res, 500, { error: "Something went wrong on the server." }); }
  });
  await new Promise(r => server.listen(port, host, r));
  return { server, port: server.address().port, store, close: () => new Promise(r => server.close(r)) };
}

/* run directly */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sample = process.argv.includes("--sample");
  const dataDir = process.env.DATA_DIR || path.join(ROOT, sample ? "data-demo" : "data");
  const { port } = await start({ dataDir, port: +process.env.PORT || 8792, curatorKey: process.env.LIBRARY_CURATOR_KEY || "", accessKey: process.env.LIBRARY_ACCESS_KEY || "", sample });
  console.log(`Prism Library on http://localhost:${port}  (${sample ? "sample deals" : "real library"}, data in ${path.relative(ROOT, dataDir) || "."})`);
  if (!process.env.LIBRARY_ACCESS_KEY && !process.env.LIBRARY_CURATOR_KEY) console.log("No keys set: anyone who can open this page can approve, retire and record actuals.");
}
