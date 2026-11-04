/* Netlify Blobs store with the same shape as lib/store.mjs: get() and update(fn).
   The whole library is one JSON blob. Writes use the ETag, so a second write that raced the first is retried on fresh data
   instead of overwriting it. This is meant for a handful of users; if the library grows or many people write at once, move to Netlify DB. */
import { getStore } from "@netlify/blobs";
import { DEFAULT_CATALOGUE } from "../public/lib.js";

const KEY = "library";
const emptyDoc = () => ({ version: 1, seq: 100, catalogue: DEFAULT_CATALOGUE.map(x => ({ ...x })), denylist: [], deals: [] });

export function openBlobStore(name, seed) {
  const store = getStore({ name, consistency: "strong" });

  async function read() {
    const r = await store.getWithMetadata(KEY, { type: "json", consistency: "strong" });
    return r ? { doc: r.data, etag: r.etag } : { doc: null, etag: null };
  }
  async function get() {
    const { doc } = await read();
    if (doc) return doc;
    const fresh = seed ? seed() : emptyDoc();
    const w = await store.setJSON(KEY, fresh, { onlyIfNew: true });
    return w.modified ? fresh : (await read()).doc;
  }
  async function update(fn) {
    for (let attempt = 0; attempt < 6; attempt++) {
      let { doc, etag } = await read();
      if (!doc) { doc = seed ? seed() : emptyDoc(); etag = null; }
      const out = await fn(doc);
      const w = await store.setJSON(KEY, doc, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
      if (w.modified) return out;
      await new Promise(r => setTimeout(r, 80 * (attempt + 1)));
    }
    throw new Error("The library is busy. Try again.");
  }
  return { get, update };
}
