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

- **Catalog view** retains the existing search and metadata filters. **Subject view** browses the 661 CSV subject entries, selected source passages, optional originals, and a local subject graph. See [SUBJECTS.md](SUBJECTS.md) for the reproducible import, matching evidence, editorial workflow, and limitations.

- Whole-word search in English, Persian/Arabic, or both; quoted exact phrases.
- All query terms must occur in the same language version. Diacritics, Arabic/Persian yeh and kaf variants, and Persian/Arabic digits are normalized for search only. There is no stemming or fuzzy matching.
- Exact filename IDs, including `.txt` and duplicate-file suffixes, are supported.
- Filter by all 18 metadata fields, author and text availability. Combine multiple categorical values, numeric word-count bounds, text matching and recorded/missing values. Date sorting is by the source string, not a cross-calendar chronological conversion.
- Default parallel reading, English on the left. Matching-count paragraphs pair in source order; unequal counts use independent columns. Mobile displays each matched pair vertically.
- Accessible footnotes, italics and transliteration accents; source HTML is escaped; metadata web links are safely reconstructed.
- Adjustable reading size, single-language modes, contextual snippets, pagination, persistent URLs, and copyable reading links.
- No accounts, analytics, external search service, or runtime server.

## Technology

Native browser ES modules and CSS keep the interface small. A Node build imports CSV and text files, produces a gzip-compressed catalogue, and compresses every document separately. A positional inverted index is split into 1,024 shards per language. Each term maps to delta-encoded document IDs and word positions. A Web Worker fetches only the required shards, intersects whole-word postings, and verifies phrase positions. Index and document caches are bounded. Each build uses a new dataset directory, and the reader and worker share one manifest version, preventing cached data from different deployments being combined. GitHub Actions builds from a clean checkout; local builds retain older dataset directories so already-open readers can finish their session.

This is a purpose-built search index with deliberately explicit semantics. Unit tests cover normalization and phrase boundaries; corpus tests check generated records against the source and run searches against the actual compressed index. Older browsers without `DecompressionStream` show an upgrade message. A current Chrome, Edge, Firefox, or Safari is recommended.

## Source data and updates

The original folders are immutable inputs:

- `original_texts - copy/`
- `translated_texts - copy/`
- `metadata - copy/`

The versioned `data/collection.tar.gz` contains these inputs exactly, avoiding tens of thousands of small source files in Git. If the source folders are absent, the build extracts the archive. To update the corpus, edit the source collection intentionally, run `python scripts/archive-sources.py`, rebuild, and review `build-report.json`. The importer strictly attempts UTF-8, then Windows-1252; fallback filenames and missing/unpaired records are recorded in the report.

Metadata is not invented. In particular, uncertain dates and original translation-status codes are retained. Text IDs without metadata remain accessible. Matching paragraph counts are not proof of semantic alignment. Original-language paragraphs may contain both Persian and Arabic; their script is displayed RTL.

## Deployment

`.github/workflows/pages.yml` builds and deploys on pushes to `main`. In repository Settings → Pages, select **GitHub Actions** as the source. The intended URL is `https://portlandiator.github.io/PI_browser/`. GitHub Pages for a private source repository requires an eligible GitHub plan; do not make a repository public implicitly. The workflow deploys only `dist/`, not raw inputs or project guidance.

The published artifact must remain under GitHub Pages' 1 GB limit. Run the collection tests to check the artifact size and index integrity. Deployment is complete only after the workflow succeeds and the public URL is verified.

## Design and maintenance

The `pdf_volumes - copy/` folder contains the published volume PDFs and is versioned directly in Git. Filenames begin with `volume_` and the volume number. The build verifies every metadata volume has a corresponding PDF, copies the files without modifying their contents, and links the catalogue's Volume field to the PDF in a new tab. The Windows updater carries these PDFs into its validation build. The complete deployed site, including PDFs, must remain below the size limit checked by the collection tests.

See `DESIGN.md`, `AGENTS.md`, and the project `SKILL.md`. Noto Naskh Arabic is bundled under the SIL Open Font License; see `src/fonts/OFL.txt`. Source-text rights and translation provenance remain those of their respective sources; this project does not assign a new license to the collection.

## Enhanced catalogue metadata

Import the single UTF-8 CSV in `metadata - copy/`, joining its `PIN` column to full text filenames. All source columns generate filter controls and appear in catalogue details, including empty values. Categorical selections use OR within a field and AND across fields; counts exclude the current field’s own selection. Word count supports numeric bounds; dates remain source strings. Field columns load on demand in the search worker. Preserve raw metadata in records. Render only reconstructed HTTP(S) anchors with escaped labels; retain local drive references as visible text. Source hyperlink labels and destinations are searchable.

## One-click Windows updates

After replacing source files, double-click **Update-Collection.cmd** in the project folder. Keep exactly one CSV (with a `PIN` column) in `metadata - copy`, and keep all current `.txt` files in the two source-text folders. Wait for Dropbox to finish syncing and avoid editing those files during the update.

The utility checks GitHub access, fast-forwards `main`, packages every current source file into `data/collection.tar.gz`, builds and tests a separate snapshot, commits only the tested archive and build report, pushes, waits for GitHub Pages, and verifies the public collection counts. Files removed from the source folders are omitted from the next archive. It preserves the current preview server and refreshes its built files after successful publication. The window stays open to show success or errors.

Requires Node.js 22+, Python 3, Git, GitHub CLI (`gh`), and Windows `tar`. It automatically finds the tools already installed on this computer, including the bundled runtimes; otherwise it uses PATH. On another computer, install those tools and run `gh auth login` and `gh auth setup-git` once. Run from a clean `main` checkout; source-folder edits are expected and are ignored by Git. The script uses your authenticated GitHub account's public no-reply address for update commits.

To validate without uploading:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\update-collection.ps1 -ValidateOnly
```

ExecutionPolicy Bypass applies only to that process; it does not change Windows settings. Failures stop publication, return a nonzero exit code, and leave source folders untouched. If a commit or push fails after validation, resolve the reported Git changes or unpublished commit before retrying. If GitHub deployment fails after a successful push, inspect the linked Actions run and rerun the failed job after correcting its cause. Concurrent updates are blocked. Temporary snapshots are removed on normal completion or failure; logs remain visible in the window.
