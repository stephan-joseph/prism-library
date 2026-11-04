# Prism Library

A shared library of anonymised, approved Prism estimates. Solution architects find similar past deals, check a new estimate against them, compare deals and reuse assumptions and team shapes. Curators review every submission before it is published. It is the companion to **Prism** (separate repo `prism`, the estimation tool). Read `README.md` for the user-facing description.

## Standing rules (from the owner)

- **Local only until told.** Build and test locally. Commit, push, deploy only when the owner says so.
- **No real client names or data** in the code, samples, docs or commits. `seed/sample.mjs` and `public/example-prism-export.damo.json` are invented.
- **No secrets in the repo.** Access keys, curator keys and API keys live only in the hosting settings.
- Write plainly. Short sentences, no marketing words, no em-dash asides in user-facing text.

## What is in this repo

| Path | What it is |
|---|---|
| `public/index.html`, `app.js`, `style.css` | The front end: Find similar, Browse, Compare, Insights, Add a deal, Curation. No build step. |
| `public/lib.js` | Shared by the browser and the server: lists (towers, roles, coverages), derived numbers, the similarity score and deal validation (`cleanDeal`). |
| `lib/api.mjs` | The whole API as one `handle(request)` function. Both the local server and the Netlify function call it. |
| `lib/checks.mjs` | Submission checks: anonymisation (blocking), completeness, framework version, duplicates. |
| `lib/store.mjs` | File store for local use (`data/library.json`, atomic writes, queued). |
| `lib/store-blobs.mjs` | Netlify Blobs store for hosting (one JSON document, ETag retries). |
| `server.mjs` | Local server: static files plus `/api`. |
| `netlify/functions/api.mts` | The hosted API, routed from `/api/*`. |
| `seed/sample.mjs` | Fourteen invented deals and three queued submissions for demos. |
| `test/library.test.mjs` | 19 tests. |

## Run and test

```bash
npm install
```
```bash
npm test
```
```bash
npm run demo
```
`npm run demo` serves http://localhost:8792 with the sample deals (data in `data-demo/`). `npm start` runs an empty real library (data in `data/`). Both folders are git-ignored.

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `PORT`, `DATA_DIR` | local | Port and data folder. |
| `LIBRARY_ACCESS_KEY` | local and hosted | If set, every API call needs this key (header `x-access-key`) and the page shows a key screen. |
| `LIBRARY_ACCESS_KEY_SHA256` | hosted | Hosting alternative: a SHA-256 fingerprint of the key, so the key itself is not stored on the server. |
| `LIBRARY_CURATOR_KEY` | local and hosted | Optional second key for curator actions. With no curator key, anyone who passes the access key is a curator. |
| `LIBRARY_SEED` | hosted | `sample` loads the sample deals the first time the store is used. Curation has "Remove sample deals". |

**Replace the built-in fingerprint.** `netlify/functions/api.mts` contains `BETA_KEY_SHA256`, the fingerprint of the previous maintainer's beta key. Set a new key, set `LIBRARY_ACCESS_KEY_SHA256` (or `LIBRARY_ACCESS_KEY`) in the hosting settings, and replace the constant. Make a fingerprint with:

```bash
printf '%s' 'the-new-key' | shasum -a 256
```
The function refuses to run if there is no key and no fingerprint. Never commit the key.

## Deploy

Netlify: publish directory `public`, functions directory `netlify/functions` (already in `netlify.toml`), bundler esbuild. The site sets `X-Robots-Tag: noindex`. The hosted store is the Blobs store `prism-library`, key `library`. It is one document with ETag retries, which is fine for one or a few writers. Move to Netlify DB before many people write at once.

Consider turning on the platform's team login in front of the site as a second lock.

## How it works

- **Quality:** Draft (submitted), Reviewed (a curator approved it), Proven (delivery actuals recorded). Proven ranks slightly higher in matches (x1.06), drafts lower (x0.92).
- **Similarity** (`public/lib.js`): weights ind 14, towers 24, applications 16, tickets 14, coverage 10, AIOps 6, SLA 4, term 4, region 8, out of 100.
- **Statuses:** pending, published, returned, rejected, retired. Only returned deals can be edited and resubmitted.
- **Anonymisation:** a submission is checked before it is saved. It looks for email addresses, web addresses, phone numbers, money amounts, the customer name from the Prism file, and the curators' blocked-terms list. A failing submission is never stored, so a name never reaches the data. This is tested.
- **Hand-off from Prism:** the link `/#import=<base64url JSON>` carries `{v:1, library:{...summary...}, status, version, deny:[...]}`. It stays in the URL fragment, which browsers never send to a server. `app.js` reads it once, checks every field against the lists, fills Add a deal and clears the address bar. The customer name in `deny` is used only for the anonymisation check and is never saved. Prism builds the link in `addToLibrary()` and its summary in `libraryBlock()`.
- **Reference sheet:** "Use as reference" produces text to copy into Prism. Prism reads a pasted sheet directly (no AI) in its Documents step.
- **Actuals:** a curator records them on the deal page: the gap to plan, each assumption's status and achieved AIOps deflection. That makes a deal Proven. Prism Track (not built) would feed this later.

## Open items at handoff

- Live check of the Prism to Library link through the hosting sign-in has not been done by the previous maintainer.
- Who curates, where it is hosted for the wider team, and how sign-in works beyond the shared key are undecided. The shared key is a stop-gap: put the app behind the company's sign-in before wider use.
- Prism does not import a reference sheet automatically yet (it reads a pasted one in Documents).
- Roles are a fixed list in `public/lib.js` that matches Prism's roles.
- There is no user identity, so history records what happened and when, not who did it.
