/* File-backed store. One JSON document, written atomically, with writes queued so two requests never overwrite each other.
   To host this on Netlify later, replace the two functions below with Blobs reads and writes; nothing else touches the disk. */
import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_CATALOGUE } from "../public/lib.js";

export function openStore(dir, seed) {
  const file = path.join(dir, "library.json");
  let chain = Promise.resolve();
  let cache = null;

  async function read() {
    if (cache) return cache;
    try { cache = JSON.parse(await fs.readFile(file, "utf8")); }
    catch (e) {
      if (e.code !== "ENOENT") throw e;
      cache = seed ? seed() : { version: 1, seq: 100, catalogue: DEFAULT_CATALOGUE.map(x => ({ ...x })), denylist: [], deals: [] };
      await write(cache);
    }
    return cache;
  }
  async function write(doc) {
    await fs.mkdir(dir, { recursive: true });
    const tmp = file + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(doc, null, 1));
    await fs.rename(tmp, file);
  }
  /* run fn(doc) with exclusive access; the doc is saved if fn returns without throwing */
  function update(fn) {
    const run = chain.then(async () => { const doc = await read(); const out = await fn(doc); await write(doc); return out; });
    chain = run.catch(() => {});
    return run;
  }
  const get = () => chain.then(read);
  return { get, update, file };
}
