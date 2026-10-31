# Partial Inventory browser

Read DESIGN.md before changing the interface and SKILL.md before changing the corpus pipeline or reader.

## Project
This is a dependency-free static web application for GitHub Pages. Node 22+ builds compressed records and a sharded positional search index. Browser ES modules and a Web Worker provide the interface. The original source folders are immutable inputs. A reproducible source archive in `data/collection/` (uncompressed tar shards) supplies GitHub Actions.

- `node scripts/build.mjs`: import and build the complete collection into dist/.
- `node --test tests/*.test.mjs`: test parsing, normalization, phrase search, and generated data.
- `node scripts/serve.mjs`: serve dist/ at http://localhost:4173/PI_browser/.
- `.github/workflows/pages.yml`: test, build, and deploy to GitHub Pages.

## Generated storage

Keep only the active dataset named by `dist/stats.json` in `dist/collections/`. Successful builds and interface refreshes automatically remove older generated collections after checking the manifests. Use `node scripts/deployment-cache.mjs prune` for a standalone cleanup. Build, refresh and cleanup share an exclusive lock; after an interrupted process, verify that it has stopped before removing `dist/.collection-update.lock`.

For interface-only work, reuse a verified compatible dataset with `node scripts/deployment-cache.mjs refresh`. Use `PI_INCREMENTAL=1` for compatible corpus updates. Do not keep generated collections as archival copies, duplicate them into QA folders, or copy them to another checkout just for convenience. Keep small logs and checksum reports for validation. Rebuild disposable output from the immutable source folders or `data/collection/`; never delete those source inputs. Prepare publication output only when needed, reusing verified files where supported.

## Invariants
- English is the left column; the original is right-to-left on the right. Narrow screens preserve paragraph pairs in a vertical flow.
- Never manufacture titles, dates, translation authority, or semantic alignments. Equal paragraph counts permit positional pairing, not a claim of verified alignment. Unequal counts use independent columns with a clear notice.
- Preserve source content. Normalize only search keys. Dates can include uncertainty, multiple calendars, and ranges; do not silently convert them to Gregorian dates.
- Keep every ID, including metadata-only and single-language records. Use filenames as exact document identity. Do not silently merge alternate suffixes.
- Treat source text as untrusted: escape HTML and render only the explicit LaTeX allowlist.
- Do not load the complete corpus into the browser. Load records and index shards on demand, and bound cache sizes.
- Keep deep links and all assets compatible with the /PI_browser/ project subpath. Store filter and reader state in the URL.
- Verify the full corpus build, semantic search tests, keyboard interaction, and desktop/mobile reader before publishing.

The owner authorized publishing this collection to the GitHub repository named by the checkout's `origin` remote, its GitHub Pages site, and the volume PDF site named in `src/pdf-hosting.json`. Preserve existing remote history. Never force-push or change repository visibility without an explicit request.

## Enhanced catalogue metadata

Import the single UTF-8 CSV in `metadata - copy/`, joining its `PIN` column to full text filenames. The Catalog filter rail shows a curated set of 18 fields in a fixed order (listed at the end of DESIGN.md); there are no availability dropdowns. Catalogue details show every source column, including empty values, except Subjects and the derived Citation count; Extract follows Word count. Categorical selections use OR within a field and AND across fields; counts exclude the current field's own selection. Word count supports numeric bounds; dates remain source strings. Field columns load on demand in the search worker. Preserve raw metadata in records, except that denied originals must have an empty First line (original) in public copies. Render only reconstructed HTTP(S) anchors with escaped labels; retain local drive references as visible text. Source hyperlink labels and destinations are searchable.
