# Partial Inventory browser

A static bilingual reading room for a collection of Baha'i texts. English and Persian/Arabic originals are displayed together, with word and phrase search, exact filename lookup, and metadata filters.

The collection contains over 29,000 records. Build statistics are recorded in `build-report.json`; automated checks cover parsing, search semantics, source preservation, metadata and hyperlinks.

## Public site, or run locally

To access the public version open https://portlandiator.github.io/PI_browser/.

Running locally requires **Node.js 22 or newer** and a `tar` command (included in current Windows, macOS, and Linux). No package installation or API keys are needed.

```sh
node --max-old-space-size=6144 scripts/build.mjs
node --test tests/*.test.mjs
node scripts/serve.mjs
```

Open http://localhost:4173/PI_browser/. The server deliberately tests the same project subpath as GitHub Pages.

## Features

- **Catalog view** retains the existing search and metadata filters. **Subject view** browses the 659 subjects (two punctuation variants of one subject are merged), selected source passages, optional originals, and a local subject graph. See [SUBJECTS.md](SUBJECTS.md) for the reproducible import, matching evidence, editorial workflow, and limitations.

- Whole-word search in English, Persian/Arabic, or both; quoted exact phrases.
- All query terms must occur in the same language version. Diacritics, Arabic/Persian yeh and kaf variants, and Persian/Arabic digits are normalized for search only. There is no stemming or fuzzy matching.
- Exact filename IDs, including `.txt` and duplicate-file suffixes, are supported.
- Filter by a curated set of 18 metadata fields (see DESIGN.md); there are no availability dropdowns. Combine multiple categorical values, numeric word-count bounds, text matching and recorded/missing values. Date sorting is by the source string, not a cross-calendar chronological conversion.
- Default parallel reading, English on the left. Matching-count paragraphs pair in source order; unequal counts use independent columns. Mobile displays each matched pair vertically.
- Accessible footnotes, italics and transliteration accents; source HTML is escaped; metadata web links are safely reconstructed.
- Adjustable reading size, single-language modes, contextual snippets, pagination, persistent URLs, and copyable reading links.
- Share a Catalog paragraph by selecting its number and choosing **Copy link**, or copying the number's link directly. English links use `?id=BH00001&paragraph=12`; original-language links add `&lang=original`. Numbers match the source paragraphs displayed in that language, including in texts with unequal paragraph counts. Existing subject/study-guide passage links and `#p-en-12` / `#p-original-12` anchors remain supported.
- No accounts, analytics, external search service, or runtime server.

## Technology

Native browser ES modules and CSS keep the interface small. A Node build imports CSV and text files, produces a gzip-compressed catalogue, and compresses every document separately. A positional inverted index is split into 1,024 shards per language. Each term maps to delta-encoded document IDs and word positions. A Web Worker fetches only the required shards, intersects whole-word postings, and verifies phrase positions. Index and document caches are bounded. Each build uses a new dataset directory, and the reader and worker share one manifest version, preventing cached data from different deployments being combined. Successful builds and interface refreshes retain only the active dataset in `dist/collections/`; source archives remain available for reproducible builds.

This is a purpose-built search index with deliberately explicit semantics. Unit tests cover normalization and phrase boundaries; corpus tests check generated records against the source and run searches against the actual compressed index. Older browsers without `DecompressionStream` show an upgrade message. A current Chrome, Edge, Firefox, or Safari is recommended.

## Source data and updates

The original folders are immutable inputs:

- `original_texts - copy/`
- `translated_texts - copy/`
- `metadata - copy/`

The versioned `data/collection/` folder contains the publishable source inputs as 33 uncompressed tar shards (the metadata CSV, and 16 shards each of originals and translations, assigned by a hash of the filename). This avoids tens of thousands of small source files in Git. Because the shards are uncompressed, Git stores and transfers a correction to one item as a small change instead of re-uploading the whole collection. If the source folders are absent, the build extracts the shards. To update the corpus, edit the source collection intentionally, run `python scripts/archive-sources.py`, rebuild, and review `build-report.json`. The importer strictly attempts UTF-8, then Windows-1252; fallback filenames and missing/unpaired records are recorded in the report.

Period labels are replaced during import using the versioned `period_renaming.csv` (`Old,New`). Replacements are literal, case-sensitive, and applied in one pass only to Period; suffixes such as `?` remain. Every nonempty Period must change; the build fails with the remaining values and counts if the mapping is incomplete. The input CSV is untouched, and changed records retain their imported Period in `metadataOriginalValues.Period`. The build report lists mappings, the changed record count, and unmapped values. Update the mapping file and rebuild to change the labels in filters and readers.

Metadata is not invented. In particular, uncertain dates and original translation-status codes are retained. Text IDs without metadata remain accessible. Matching paragraph counts are not proof of semantic alignment. Original-language paragraphs may contain both Persian and Arabic; their script is displayed RTL.

## Deployment

`.github/workflows/pages.yml` builds and deploys on pushes to `main`. In repository Settings → Pages, select **GitHub Actions** as the source. The intended URL is `https://portlandiator.github.io/PI_browser/`. GitHub Pages for a private source repository requires an eligible GitHub plan; do not make a repository public implicitly. The workflow builds into `dist/` and deploys only the verified `public-site/` prepared from it. Raw inputs, build state and study-guide audit exports are excluded from hosting.

`.github/workflows/check-pull-request.yml` runs for every pull request against `main` that touches the site's inputs or code: it restores the last deployment's generated collection, rebuilds the changed records, and runs the complete test suite, so a maintenance pull request is verified before it is merged. When a pull request from Publish-Editorial-Decisions.cmd deletes or corrects catalog items and the rebuild moves quotations to other records (the build stops with “Catalogue review data changed for …”), the check runs `scripts/reconcile-study-guides.mjs`, which updates the study-guide baselines and readings for exactly those subjects, pushes the result to the pull request branch, rebuilds, tests and reports on the pull request. Nothing is deployed from this workflow.

The published artifact must remain under GitHub Pages' 1 GB limit. Volume PDFs are served from a separate GitHub Pages site (see [Volume PDF site](#volume-pdf-site)), so they do not count toward this limit. Run `node scripts/prepare-pages.mjs` before the collection tests to check the actual publication size and index integrity. Full audit records stay in `dist/` and are also preserved separately by commit/dataset in `publication-audit/`. GitHub keeps the separate audit artifact for 90 days; download a durable local copy. See [publication storage and live verification](docs/publication-storage.md). Deployment is complete only after the workflow succeeds and the public URL is verified.

Interface-only deployments reuse an exact-match GitHub Actions cache of the generated collection, search shards, subject passages, PDF copies, manifests, and import reports. They copy the current `src/` files into the site and run the complete test suite against the restored data. The source archive is extracted for validation, but records, indexes, subject matches, and PDFs are not rebuilt or recopied from their sources. Interface files are never cached, so removed pages cannot survive from an earlier deployment.

The cache fingerprint covers every file in `data/` and `pdf_volumes - copy/`, root CSVs, the subject reference document, and the builder's recursive local module imports (including shared parsers). It includes the Node major version. Source text, translations, and metadata reach CI through `data/collection/`; update it with the Windows updater when changing the source folders. Item corrections change only the source archive, so they reuse cached data and rebuild just the affected records. The first deployment, changed build inputs, or an evicted cache trigger a full build. Only successfully tested output is cached; partial cache matches are never used. Browser-only HTML, CSS, fonts, and JavaScript changes reuse data unless that JavaScript is also imported by the builder.

Documentation-only pushes do not deploy. To rebuild manually, use **Actions → Build and deploy Partial Inventory browser → Run workflow → Force full rebuild**. This bypasses cache restoration and saving for that run; delete a suspect entry in Actions caches if it should also be replaced for later runs. GitHub Pages requires a complete artifact on every deployment, so this optimization removes repeated computation, not the final whole-site upload. It preserves the existing site URL and all data paths.

## Design and maintenance

The `pdf_volumes - copy/` folder contains the published volume PDFs and is versioned directly in Git. Filenames begin with `volume_` and the volume number. The build verifies every metadata volume has a corresponding PDF, copies the files without modifying their contents, and links the catalogue's Volume field to the PDF in a new tab. The Windows updater carries these PDFs into its validation build. Deployment publishes the PDFs to the separate PDF site described below; the rest of the site must remain below the size limit checked by the collection tests.

See `DESIGN.md`, `AGENTS.md`, and the project `SKILL.md`. Noto Naskh Arabic is bundled under the SIL Open Font License; see `src/fonts/OFL.txt`. Source-text rights and translation provenance remain those of their respective sources; this project does not assign a new license to the collection.

## Volume PDF site

GitHub Pages limits each site to 1 GB, and the volume PDFs alone are about 640 MB. They are therefore published to a second GitHub Pages site, named in `src/pdf-hosting.json`:

```json
{ "url": "https://OWNER.github.io/PDF_REPOSITORY/", "repository": "OWNER/PDF_REPOSITORY" }
```

The PDFs stay in `pdf_volumes - copy/` in this repository, so adding or replacing a volume works as before. On each deployment `prepare-pages.mjs` stages them in `pdf-site/` (with a `pdf-site.json` manifest of sizes and SHA-256 hashes) instead of `public-site/`. `scripts/publish-pdf-site.mjs` then compares that manifest with the live PDF site. When the PDFs are unchanged it does nothing more. When they differ, it pushes only the changed files to the PDF repository and waits until its site serves them, before this site is deployed. The Catalog Volume links and Volume view load the PDFs from that address. GitHub Pages allows this cross-site loading. An empty `"url"` serves the PDFs from this site again.

One-time setup:

1. Create the PDF repository named in `src/pdf-hosting.json` on GitHub as an empty **public** repository.
2. Create a fine-grained personal access token (GitHub → Settings → Developer settings → Fine-grained tokens) limited to that repository, with **Contents: Read and write**.
3. In this repository, add it under Settings → Secrets and variables → Actions as `PDF_SITE_TOKEN`.
4. Run this repository's deployment workflow once. It creates the PDF repository's `main` branch.
5. In the PDF repository, open Settings → Pages and choose **Deploy from a branch**, `main`, `/ (root)`. Then re-run the deployment workflow; it waits for the PDF site and checks it before publishing this site.

## Enhanced catalogue metadata

Import the single UTF-8 CSV in `metadata - copy/`, joining its `PIN` column to full text filenames. The Catalog filter rail shows a curated set of 18 fields in a fixed order (listed at the end of DESIGN.md); there are no availability dropdowns. Catalogue details show every source column, including empty values, except Subjects and the derived Citation count; Extract follows Word count. Categorical selections use OR within a field and AND across fields; counts exclude the current field's own selection. Word count supports numeric bounds; dates remain source strings. Field columns load on demand in the search worker. Preserve raw metadata in records, except that denied originals must have an empty First line (original) in public copies. Render only reconstructed HTTP(S) anchors with escaped labels; retain local drive references as visible text. Source hyperlink labels and destinations are searchable.

## Maintenance tools

Every tool for maintaining the site is a double-click launcher in the `maintenance/` folder; `maintenance/README.txt` explains each one. The implementation scripts stay in `scripts/`. No tool pushes to `main`: each one commits its change to a new `maintenance/…` branch and opens a pull request whose description summarizes what changed, so the repository keeps a reviewable record of every change. GitHub builds and tests every pull request (`.github/workflows/check-pull-request.yml`) and merging it publishes the change. One tool pull request is open at a time: a tool stops while an earlier one is open, so two cannot change the same files. The tools leave the project folder on `main`; study-guide, subject-order and collection proposals stay as local changes until their pull request is merged, and the next tool run recognises them once they match `main` on GitHub, while catalog edits and editorial decisions are built from GitHub's copy and leave the folder unchanged. Repository and site addresses come from the folder's Git `origin` remote and are confirmed with GitHub, so the tools follow a renamed repository.

## One-click Windows updates

After replacing source files, double-click **maintenance/Update-Collection.cmd**. The source folders (`original_texts - copy`, `translated_texts - copy`, `metadata - copy`) must be in the project folder; they are not stored in Git. Keep exactly one CSV (with a `PIN` column) in `metadata - copy`, and keep all current `.txt` files in the two source-text folders. Wait for Dropbox to finish syncing and avoid editing those files during the update.

The utility checks GitHub access, fast-forwards `main`, packages the current publishable source files into `data/collection/` (rewriting only the shards that changed), builds and tests a separate snapshot, and then opens a pull request containing only the tested archive, build reports and changed volume PDFs. Its description lists, by catalog ID, the original texts, translations and metadata rows that were added, changed or removed (with the changed metadata fields), the changed PDFs, and the tested collection counts. Merging it publishes the update. Files removed from the source folders are omitted from the next archive. It preserves the current preview server and refreshes its built files after a successful build. The window stays open to show success or errors.

Requires Node.js 22+, Python 3, Git, GitHub CLI (`gh`), and Windows `tar`. It automatically finds the tools already installed on this computer, including the bundled runtimes; otherwise it uses PATH. On another computer, install those tools and run `gh auth login` and `gh auth setup-git` once. Run from a clean `main` checkout; source-folder edits are expected and are ignored by Git. The script uses your authenticated GitHub account's public no-reply address for update commits.

To validate without uploading:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\update-collection.ps1 -ValidateOnly
```

ExecutionPolicy Bypass applies only to that process; it does not change Windows settings. Failures stop before a pull request is opened, return a nonzero exit code, and leave source folders untouched. If the pull request cannot be opened after validation, resolve the reported Git changes or unpublished commit before retrying. If GitHub deployment fails after the pull request is merged, inspect the Actions run and rerun the failed job after correcting its cause. Concurrent updates are blocked. Temporary snapshots are removed on normal completion or failure; logs remain visible in the window.

## Review subject connections

Open `relationships.html` (the **Review subject connections** link at the bottom of Subject view). The thematic directory covers all 659 subjects and shows pending proposal counts. Search, switch to alphabetical order, filter unfinished subjects, or use **Next with proposals**. Imported connections, overlap proposals, accepted decisions, and rejected decisions are labeled separately. **Inspect shared passages** loads a bounded set of source examples on demand. Broader means the other subject is more general; narrower means it is more specific. Editing a connection's type rejects its old form and accepts the replacement. Marking a subject reviewed tracks your progress without accepting its proposals.

Drafts share the existing passage editor's browser storage. Use **Export decisions** regularly; clearing browser data removes local drafts. **Import decisions** merges a backup, with incoming decisions winning conflicts. Exports include existing published passage corrections and relationship decisions, local updates, and subject review progress. **Undo last change** works within the current page session; **Restore published version** removes a local override.

To publish, double-click **maintenance/Publish-Editorial-Decisions.cmd** (or drag the exported file onto it; otherwise it uses the newest `subject-edits*.json` in Downloads). It validates the export, merges it onto the published `data/subject-edits.json` (the export wins where both have an entry; published decisions are never dropped), shows the counts of new and changed decisions, and after confirmation opens a pull request with the merged file and any pending catalog edits (see [Correct one catalog item](#correct-one-catalog-item)), with the counts in its description. GitHub builds and tests the pull request; merging it starts the deployment. The public graph changes only after this rebuild. GitHub Pages has no write-back service or reviewer accounts. The build publishes an editorial baseline alongside the subject index so later exports retain earlier decisions.

Volume view (`volume-view.html`) provides a dropdown for all published PDFs, page navigation, zoom, active PDF hyperlinks, and single/two-page layouts. Automatic uses two pages on screens at least 1100px wide. Volume, page, layout and zoom are shareable URL parameters. A volume opens at pages 2–3 (page 1 is blank). The page total beside the volume count leaves out each volume's opening matter and table of contents: `scripts/volume-pages.mjs` counts from the first bookmark of each PDF at build time, and `data/volume-front-matter.json` lists the opening page count of volumes without bookmarks (the catalogue and index volumes). PDF.js 6.3.289 is bundled under `src/vendor/pdfjs/` with its license; no CDN or package install is needed. PDF.js 6 relies on very recent JavaScript methods (`Map.prototype.getOrInsertComputed`, `Math.sumPrecise`); `src/map-polyfill.mjs` supplies them, and `src/pdf-worker.mjs` loads it before the bundled worker, so browsers without them can still render volumes. Keep both when updating PDF.js.

# Original-text publication policy

Records with no Manuscripts or Publications entries retain their catalogue identity and English translation, but their original text is excluded from the source archive, generated record downloads, excerpts and search index. Their public `First line (original)` field is empty. Local source files remain unchanged. Missing metadata also means the original is withheld.

All supplied volume PDFs, including volumes 166 and 193, are published with the owner’s explicit authorization. The original-text restriction applies to the source archive, generated records, metadata incipits, and search index. `data/withheld-pdf-volumes.json` remains available for any future PDF exclusions and is currently empty.

`python scripts/archive-sources.py` packages only permitted originals. Use `--from-archive data/collection` to filter the existing archive without importing local source changes (a legacy single `.tar.gz` archive is also accepted). `--check` rejects an unsafe archive; deployment runs this check before building or restoring cached output. Removed original-only IDs survive in an ID-only manifest.

## Correct one catalog item

Double-click **maintenance/Edit-Catalog-Item.cmd**. It needs the source folders in the project folder and explains if they are missing. A private local browser editor opens; keep its command window open while editing. Enter an exact, case-sensitive ID, edit its source metadata, original text or English translation, then select **Save as pending edit**. The edit is recorded in `.qa/pending-catalog-edits.json` (the full metadata row and both texts, with the state of the source files it was based on); the source folders, the repository and GitHub are not changed. The page lists every pending edit; opening an item shows its pending version, and **Discard pending edit** forgets it. The ID cannot be changed in this editor. Use the full updater for additions, renames or a changed metadata schema; deletions are made in this editor (see below).

**maintenance/Publish-Editorial-Decisions.cmd** publishes all pending edits and deletions, together with an exported `subject-edits.json` when one is found, as one pull request. It fast-forwards `main`, reads the published archive shards and data files from Git's object store (no checkout), compares each pending item with the published catalog and reports what changes (metadata columns, texts added, changed or removed), then asks for confirmation. Only the affected shards are patched (`scripts/patch-item-archive.py --batch`, applying the original-text publication policy) and committed byte for byte with the deletion changes and the merged decisions through a separate Git index; the pull request branch is `maintenance/catalog-edits-<time>`. No copy of the repository, no volume PDF and no local rebuild is involved, so it finishes in seconds; GitHub builds and tests the pull request. Text you leave as it is keeps its published bytes (even when your folder lacks a translation the archive holds), so its version and the quotations that refer to it are untouched; changed text is stored in UTF-8. An edit whose English text is used by reviewed subject quotations stays pending until those references have been reviewed, an edit of an unpublished ID stays pending until Update-Collection.cmd has added the item, and an edit that already matches the published catalog is only written to the source folders; the tool names each case.

Once the pull request is open, the edits are written to the local source folders with byte-exact backups in `.qa/item-backups/` (each backup is one `.zip` holding a `manifest.json` and the previous bytes of each changed file under its source path, so extracting it into the project folder restores them), so a later full update cannot undo them; deleted items are removed. An item whose source files changed on this computer since its edit was saved is not overwritten: the edit stays pending until it is opened, checked and saved again. The published entries stay in the pending file, marked with their pull request, until that pull request is merged; if it is closed without merging, the next publication proposes them again (restore the backups to undo them locally instead). The next publication waits while that pull request is open.

Compatible generated data is reused automatically on GitHub: unchanged records and word postings are preserved, changed records and affected search shards are rebuilt, metadata facets are refreshed, and subject citation metadata is updated. English changes rebuild subject matches, because paragraph offsets and translation versions may change. The build never silently promotes an old quotation alignment to a new source version. If a corrected text is quoted in a study guide, the pull-request check reconciles the study-guide baseline (see [Deployment](#deployment)); a change that needs an editorial decision, such as a new candidate with authorized wording in a curated guide, fails the check with that message instead. For other changes, after reviewing the affected quotations (confirming changed wording in `data/subject-edits.json` where needed, and updating any `study-guides/sentence-paragraphs.json` entries for that source), run `node scripts/refresh-catalogue-baseline.mjs --list` and then `node scripts/refresh-catalogue-baseline.mjs "subject name" …` for the reviewed subjects.

Changed IDs, parser/build dependencies, PDFs, subject inputs, an unavailable cache, or a forced rebuild use the full build. Every deployment runs the full verification suite. GitHub Pages still requires uploading one complete site artifact; this optimization avoids unnecessary parsing, indexing, and subject matching, not that final upload. New immutable dataset URLs keep readers from mixing old and new records. Build and refresh remove obsolete generated collections only after their final manifests agree. Failed builds retain the previous collection. A shared lock prevents concurrent build, refresh and cleanup operations.

For interface-only local work, run `node scripts/deployment-cache.mjs refresh` over verified compatible data. Run `node scripts/deployment-cache.mjs prune` to clean older output without rebuilding. Neither command removes source archives or original source folders. Avoid keeping duplicate generated collections for backup or QA; retain small logs and checksum reports instead. If a process is interrupted, verify that it has stopped before removing `dist/.collection-update.lock` and retrying. Reload local browser tabs after replacing a dataset.

For a compatible local rebuild after editing inputs, set PI_INCREMENTAL=1 when running scripts/build.mjs. The normal command remains a full rebuild.

### Delete one catalog item

Under **Delete an item from the catalog**, **Preview deletion** lists, for the ID in the lookup box, the subject quotations and study-guide readings that will be removed, read from current `main` on GitHub (through Git's object store, without a checkout) and the published website. Nothing changes until the ID is typed again and **Mark for deletion** is selected, which records the deletion in the pending file; it is published with the next run of Publish-Editorial-Decisions.cmd. Volume PDFs are never changed.

A quotation is removed when its subject shows it from the item's text, or when it cites only the item and is not shown from another record; copies merged into it go with it. Their IDs join `deletedIds` in `data/extract-review-decisions.json` (with their review matches, notes and hints, and any `data/subject-edits.json` match), so a rebuild cannot restore them; suggested candidates from the item are dropped from other quotations. Study-guide readings left without quotations are removed, discussion questions are trimmed to the limit for the readings that remain, neighbor evidence that was deleted is dropped (with its invitation when none remains), and a guide with no quotations left is removed. A curated guide keeps its other choices: the quotations are recorded under `removedWithCatalogItems` in its selection review, which lowers the expected number of chosen quotations instead of inviting an unreviewed replacement. The catalogue baseline is updated for exactly the predicted change.

When the deletion is published, the item's metadata row, texts and withheld-original entry are removed from the source archive and the changes above are committed with it, in the same pull request as the other pending edits. The complete collection is then built and tested on GitHub. If removing the item changes other matches (for example, a quotation found in both this item and another record now matches only the other one, or a quotation that listed the item among its candidates), that build stops with “Catalogue review data changed for …”, and the pull-request check reconciles the affected guides against the rebuilt data (a new reading keeps the place of the reading its quotations came from, otherwise it is added as left out, or shown when it has authorized wording), pushes the reconciled files to the pull request, rebuilds and tests once more, and comments on the pull request. A change that needs an editorial decision, such as a new candidate with authorized wording in a curated guide, fails the check with that message. Once the pull request is open, the item is removed from the local source folders with a backup in `.qa/item-backups/` (its manifest is marked `deleted`), so a later full update cannot restore it; if the pull request is closed unmerged, the next publication proposes the deletion again unless the files are restored from that backup and the pending entry discarded in the editor.
