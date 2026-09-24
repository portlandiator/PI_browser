# Subject import and maintenance

## Architecture

The existing Node 22+ static pipeline and browser ES modules also power Subject view. No new framework, Python environment, API key, database service, or paid hosting is required. Next.js/React static export and Cytoscape would work, but add dependencies without removing the main work: provenance, matching, and editorial decisions. A deterministic SVG neighborhood graph renders each subject's connections; its nodes are keyboard-accessible links. The public graph has no zoom buttons, legend, or duplicate related-subject list (see DESIGN.md). A future larger graph can replace this renderer without changing the data model. Semantic/AI matching is not used by this importer.

The authoritative CSV has 661 rows, 18 literal colors, and 660 distinct Loom category URLs. Two differently punctuated “serving humanity…” rows reference the same category. Both remain separate subjects. The second receives a name-hash suffix; the duplicate is reported. Color names and descriptions are not invented.

## Observed input conventions

The CSV is UTF-8. Column two addresses a category in a dynamic website, not a downloadable TXT file. The category page requests `services/quotes.php?category=ID&children=n`; the outline requests `services/categories.php?main=y`. `scripts/fetch-subjects.mjs` snapshots those public responses verbatim, including HTML markup, quote IDs, citation links, original category memberships, work codes, and research notices. Refresh is explicit; GitHub Actions never scrapes Loom.

Quote records can contain many DIV/P selection blocks. Empty blocks are skipped. Separator lines and the explicit “The AI-selected…” research notice are retained as notices. Block position, sequential nonempty-block position, quote ID/index, CSV row/filename, category URL, and snapshot hash remain available for every selection. Bibliographic anchors recognized as source citations are separated from matching text, while the complete block and text are retained. Two malformed blocks concatenate separately cited excerpts without a DIV boundary. When substantial prose precedes each inventory citation, the importer separates those excerpts, preserving the parent block and segment number in provenance. The report counts these split blocks. Unknown entities/markup remain reviewable rather than executed. Footers or headings without these explicit conventions may remain unmatched selections: the importer does not guess that they should be discarded.

English source files use UTF-8 with strict Windows-1252 fallback reported. Inputs include CR, CRLF, and LF blank-line paragraph boundaries. The existing `parseText` parser defines paragraph numbering for both the index and reader, including headings and section numbers. It safely renders its LaTeX allowlist and separates notes. Sources are never edited.

## Data model and coordinates

* Source identity: exact filename basename; source version: full SHA-256 of English file bytes. Raw source bytes remain in the reproducible collection archive. Existing records retain all catalogue metadata and both language versions. Generated record filenames escape lowercase/non-ASCII bytes with `~hh` so case-distinct catalogue IDs (such as `BH05388` and `bh05388`) cannot overwrite one another on Windows. Original filenames, document identities, and query-string permanent URLs remain unchanged.
* Paragraph identity: `SOURCE@VERSION:en:NUMBER`, with one-based paragraph numbers from the shared parser. Character ranges are **zero-based, end-exclusive UTF-16 offsets in the unmodified rendered paragraph's `plain` text**, not byte offsets in LaTeX. The normalized token index maps each token back to these original visible-text positions. Markup is retained in the full reader and excluded from coordinate counting; footnote reference numbers do not shift offsets.
* Selection identity: hash of subject, quote identity/index, raw block position, and raw block. Every association has its own selection/provenance, even where wording repeats.
* Passage identity: hash of source, source version, and ordered paragraph character ranges. Identical ranges share a passage with all selection and subject associations. Changed source versions produce new passage IDs. Old source-version links fail explicitly rather than highlighting a new location silently.
* Relationships: `broader`, `narrower`, `related`; status `imported`, `suggested`, `accepted`, or `rejected`, with provenance and evidence. Direct outline edges and uniquely resolvable “see also” references are imported. Outline nodes outside the CSV remain in provenance; they do not create invented public subjects.

Files under each immutable dataset: `subjects/index.json.gz`, one compressed selection file per subject, one compressed file per accepted passage, and `subjects/report.json`. The browser loads only the small subject/edge index, one subject, and the displayed source records. Source cache is capped at 20 records; results paginate by 10 selections and group adjacent selections by source.

## Matching and limitations

Source-ID selections search only the specified exact source IDs. Missing IDs are reported. ID-free selections use rare-token source postings to identify all candidates capable of containing the full normalized excerpt. Normalization handles Unicode decomposition, case, diacritics, whitespace, and punctuation by tokenizing; it does not alter source wording. Every normalized occurrence is counted, including repeated wording within one source. Five or more words and a single occurrence permit automatic exact/normalized acceptance. Short or repeated matches are ambiguous.

When exact and normalized matching fail, ID-free approximate retrieval uses the top 12 sources from up to eight rare words. Local windows propose paragraph ranges using distinct-word coverage. Omission-mark fragments can propose ordered separate ranges across paragraphs. These are **always approximate**, never automatically published as located passages. Coverage is evidence, not a probability. Candidate-source and location truncation are explicit. Up to eight approximate alternatives are retained. Translation variants, bracketed editorial additions, unknown citations, and passages outside this corpus may remain unmatched. This conservative lexical baseline is ready for later editorial or AI-assisted improvements; it does not claim every selection has been located.

Related-subject suggestions use only accepted passage ranges. Two subjects share evidence when their selected ranges overlap within a source paragraph. Score = shared paragraph units / union of the subjects' selected paragraph units (Jaccard). At least two shared units are required. Duplicate selections do not multiply these units. This is a size-normalized textual connection, not a claim of conceptual equivalence. Imported structure and editorial conceptual links need no textual overlap.

## Commands

From the repository root:

```sh
# Refresh public source data, retaining raw responses in the tracked snapshot:
node scripts/fetch-subjects.mjs
# Resume an interrupted refresh using saved categories:
node scripts/fetch-subjects.mjs --resume

# Full offline build, including catalogue, subject matching and graph:
node --max-old-space-size=6144 scripts/build.mjs
node --test tests/*.test.mjs
node scripts/serve.mjs
```

To match just the first three subjects against the full English corpus after an existing collection build, set `SUBJECT_LIMIT=3` and run `node --max-old-space-size=6144 scripts/build-subjects.mjs`. In PowerShell: `$env:SUBJECT_LIMIT='3'`; remove it with `Remove-Item Env:SUBJECT_LIMIT` before a full build. A prototype report is written separately. Never deploy a subset build.

The full report is `subject-import-report.json`: selections processed, per-status totals, notices, distinct passages, duplicate and overlapping ranges, duplicate subject URLs, missing categories, encoding fallbacks, imported/suggested/reviewed relationships, and unused review decisions. Build fails on unexpected missing category responses and invalid/stale confirmed mappings. A full refresh should be reviewed before committing the new snapshot.

The supplied “the human body” URL times out and is absent from the current outline. At the user's direction this entry remains visible with an unavailable notice. `data/subject-source-exceptions.json` records that explicit exception; it does not suppress other import failures. Refresh skips known unavailable categories unless `--retry-unavailable` is provided. Thus the initial snapshot contains 659 distinct successful category responses for 660 available subject entries, plus one unavailable entry. Categories with a successful response but no directly assigned selections (for example, meditation) are reported separately as empty subjects; the browser points readers toward connected subjects.

## Editorial review

Open `subjects.html?review=1&subject=SUBJECT_ID`. The editorial view includes approximate, ambiguous, unmatched, and rejected selections. Expand a selection's review section to inspect evidence and alternatives, open sources, choose a candidate, and edit its JSON paragraph/range coordinates. Confirm validates the source version, paragraph number and boundaries; reject retains provenance. Selections with a confirmed mapping appear in the public view after rebuilding.

Add conceptual connections by choosing another subject, relationship type, status, and a supporting note. To edit or reject an existing connection, use its endpoints and type. Decisions are saved only in that browser until **Export decisions** is used. Load the existing `data/subject-edits.json` first to continue a previous review session; exported files contain the current local decision set. The “Inspect or copy current decisions” panel also exposes the JSON for review or manual copying if a browser blocks the download. Replace `data/subject-edits.json` with the exported file, rebuild, inspect the report, test, commit, and push. Git is the durable review history. Public visitors cannot change the published dataset. No editorial decision is silently accepted on the server.

## Verification and deployment

The first three real subjects were used for the prototype. Manually inspected examples include BH11400 paragraph 1 (exact excerpt), BH00002 paragraph 12 (punctuation boundary), AB04760 paragraphs 1–3 (one excerpt spans three paragraphs), AB01183 paragraph 2 (translation wording differs, stays approximate), and ABU1737 (unmatched). A real repeated-wording example, “We testify that He is One…”, occurs in BH00005 paragraph 156 and BH00336 paragraph 14; both source files were checked and the selection remains ambiguous. `tests/subjects.test.mjs` exercises repeated text, Unicode/punctuation offsets, missing IDs, cross-paragraph matching, omissions, source citation parsing, and outline/cross-reference import. Generated-data tests validate all stored accepted ranges against actual source text and version hashes.

Push tested changes to the existing repository's `main` branch. The existing GitHub Pages workflow builds offline from the versioned corpus and subject snapshot, tests the output, and deploys `dist/`. Query-string links and relative assets work under `/PI_browser/`. The Windows source updater carries the subject snapshot and edits into its validation build. It does not refresh remote subject selections automatically. Keep the total published artifact below the collection test's 1 GB bound.
# Subject directory order

The directory defaults to Thematic order from `subjects - reference.docx` and
also offers Alphabetical order. `order=alphabetical` in the URL selects
alphabetical order and survives subject navigation and browser history; an
absent or any other value (including legacy `order=thematic` and
`order=canonical` links) shows Thematic order. Subject labels keep their CSV
colour family; `src/theme.css` supplies the approved day and night display
shades, each with at least 4.5:1 contrast on the theme's paper (see DESIGN.md).

After updating the reference document, run
`powershell -File scripts/extract-subject-order.ps1` and commit the regenerated
`src/subject-order.json` alongside the reference. The extractor reads document
paragraphs in order, matches names after Unicode normalization and removal of
punctuation/spacing, and fails if any CSV subject is missing. It preserves the
exact CSV names, retains both punctuation variants in CSV order at their shared
reference position, and imports the 19 main document headings as unlinked sections and ignores entries absent from the
authoritative CSV. The JSON records the reference file's SHA-256 digest; ordinary
site builds copy this small asset without requiring Word or PowerShell.
