import type { Config, Context } from "@netlify/functions";
import { createApi } from "../../lib/api.mjs";
import { openBlobStore } from "../../lib/store-blobs.mjs";
import sampleDoc from "../../seed/sample.mjs";

/* All /api/* calls land here. Access is gated by a SHA-256 fingerprint of the key (the key itself is not stored here).
   LIBRARY_ACCESS_KEY or LIBRARY_ACCESS_KEY_SHA256 in the site environment override the built-in fingerprint.
   LIBRARY_SEED=sample loads the sample deals on first use. */
const BETA_KEY_SHA256 = "fb568efb7186d4141018d46dba0f890a6226be31ef2e618455cfb281387485cf";
const accessKey = Netlify.env.get("LIBRARY_ACCESS_KEY") || "";
const accessKeyHash = accessKey ? "" : (Netlify.env.get("LIBRARY_ACCESS_KEY_SHA256") || BETA_KEY_SHA256);
const curatorKey = Netlify.env.get("LIBRARY_CURATOR_KEY") || "";
const seed = Netlify.env.get("LIBRARY_SEED") === "sample" ? () => JSON.parse(JSON.stringify(sampleDoc)) : undefined;
const api = createApi(openBlobStore("prism-library", seed), { accessKey, accessKeyHash, curatorKey });

export default async (req: Request, _context: Context) => {
  /* refuse to run open: with no key and no fingerprint the library must not answer */
  if (!accessKey && !accessKeyHash) return Response.json({ error: "This site has no access key set, so it is switched off." }, { status: 503 });
  const url = new URL(req.url);
  const text = req.method === "POST" ? await req.text() : "";
  if (text.length > 1_000_000) return Response.json({ error: "Request too large." }, { status: 413 });
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  const r = await api.handle({ method: req.method, path: url.pathname, headers, text });
  if (r.raw !== undefined) return new Response(r.raw, { status: r.status, headers: r.headers });
  return Response.json(r.json, { status: r.status, headers: { "cache-control": "no-store" } });
};

export const config: Config = { path: "/api/*" };
