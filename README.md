# Prism Library

A shared library of anonymised, approved Prism estimates. SAs find similar past deals, check a new estimate against them, compare deals, and reuse assumptions and team shapes. Curators review every submission before it is published.

Runs locally with Node 20 or later and no dependencies.

```bash
npm start        # the real library, data in ./data
npm run demo     # 14 sample deals and 3 queued submissions, data in ./data-demo
npm test         # 19 tests
```

Open http://localhost:8792. Set `PORT` to change the port.

## What it does

| Tab | Purpose |
|---|---|
| Find similar | Describe a new deal. Past deals are ranked by match, with the reasons, and a peer check shows where your Year 1 estimate sits against the closest matches. |
| Browse | Search, filter and sort all published deals. |
| Compare | Two to four deals side by side, with differences shaded. |
| Insights | Estimate accuracy by tower, assumptions that hold, AIOps deflection planned and achieved. |
| Add a deal | Import a Prism estimate file or enter a deal by hand. It goes to the review queue. |
| Curation | Approve, return or reject submissions. Curators only. |

Quality badges: **Draft** (submitted), **Reviewed** (approved by a curator), **Proven** (delivery actuals recorded). Proven deals rank slightly higher in matches.

## Adding a deal from Prism

**From inside Prism:** File, then Add to Prism Library. Prism opens the Library in a new tab with the estimate's summary in the link, after the "#", so it is never sent to any server. The Add a deal form opens already filled in: towers, tickets, coverage, term, team by role, years, confidence, AIOps use cases and assumptions. The customer name from Prism travels in the same link only so the anonymisation check can refuse it in your text; it is not saved. Complete industry, region, SLA tier and applications (Prism counts applications for application towers only), write the anonymised description and submit. If the Library is behind a key, enter it first and the form fills in afterwards. An estimate that is not approved in Prism goes in as a draft.

**From a saved file:** save the estimate in Prism (File, Save file). The file now carries a `library` block: scale, team by role, years, AIOps use cases and assumptions. In Add a deal, choose that file. Complete the fields Prism does not hold (industry, customer region, SLA tier, applications for non-AMS towers) and write an anonymised description.

The customer name in the file is used in the browser and sent with the submission only to check that it does not appear in the free text. It is never saved.

Files saved from an older Prism have no `library` block. Open them in the current Prism and save again.

## Review and anonymisation

When a deal is submitted the server runs four checks:

- **Anonymisation** looks for email addresses, web addresses, phone numbers, money amounts, the customer name from the Prism file, and the blocked-terms list that curators maintain. A submission that fails is **not saved at all** and cannot be published.
- **Completeness**, **Framework version** and **Duplicates** are advisory.

A curator can approve, return with a note (the submission can then be edited and resubmitted) or reject. After delivery, a curator records actuals on the deal page: the gap to plan, the status of each assumption and the achieved AIOps deflection. That makes the deal Proven.

## Access

With no `LIBRARY_CURATOR_KEY`, anyone who can open the page is a curator. This is fine on a laptop. Before sharing the app, set a key:

```bash
LIBRARY_CURATOR_KEY=choose-a-key npm start
```

Curator actions then need the key, and the queue is hidden from everyone else. The key is a stop-gap. For wider use, put the app behind the company's sign-in so that every action has a person attached.

## Data

One file, `data/library.json`, written atomically. Back it up from Curation (Download a backup). It holds anonymised deals only, but it is still company data: keep it on approved storage.

To host on Netlify, replace the two functions in `lib/store.mjs` with Netlify Blobs reads and writes, and move the handlers in `server.mjs` into functions. The rest of the code does not touch the disk.

## Private beta on Netlify

Deployed as its own site, `prism-library-beta`, separate from the Prism team site.

- **Two locks.** Netlify's team login protects the whole site. Behind that, every API call needs `LIBRARY_ACCESS_KEY`, and the page shows a key screen until it is entered. If the key is not set, the function refuses to run.
- **Storage.** One JSON document in Netlify Blobs (`lib/store-blobs.mjs`). Writes use the ETag and retry, which is fine for one or a few users. Move to Netlify DB before the whole team uses it.
- **Sample data.** `LIBRARY_SEED=sample` loads the sample deals on first use. Remove them from Curation (Remove sample deals), then unset the variable.
- **Change or rotate the key:** set a new `LIBRARY_ACCESS_KEY` in the site's environment variables and redeploy.
- **Opening it to the team later:** remove Netlify team login in the site's access settings, move sign-in to the company's identity provider, and give curator rights through `LIBRARY_CURATOR_KEY` or the provider's groups.
- **Redeploy:** `npx -y @netlify/mcp@latest` with the site's deploy link, or `netlify deploy --prod` after `netlify login`.

## Known limits

- **Use as reference** produces text to copy into a Prism estimate. Prism does not import it yet.
- Actuals are entered by a curator. Prism Track will feed them when it exists.
- Roles come from a fixed list in `public/lib.js` that matches Prism's roles.
- There is no sign-in, so history records what happened and when, not who did it.
