# Partial Inventory browser

## Purpose
A calm public reading room for browsing and searching the supplied Baha'i texts. The collection, search controls, and reading surface are the product. No accounts, feedback, AI answers, or promotional landing page.

## Visual direction
An archival catalogue with contemporary controls: warm ivory paper, forest green ink, muted olive accents, hairline separators, generous reading margins. A small open-book mark is the only illustration. No decorative photography is needed.

### Tokens
- Paper: #f7f6f0; reading page: #fffefa; ink: #203a32.
- Secondary text: #627069; rule: #dddfd4; accent: #8b6c36.
- Selection: #e7ede4; highlight: #f6e5aa.
- English throughout: locally hosted EB Garamond (including italic and variable weights); Persian/Arabic: locally hosted Scheherazade New, regular and bold.
- Body controls: 14–16px. English reading: 20px, line-height 1.85. Original reading: 23px, line-height 2.05. User size range: 85–135%.

## Catalog view
Identical masthead geometry on both pages: book icon and wordmark, Catalog view / Subject view / About the collection navigation, then an upper-right Dark mode switch. The theme preference persists locally across navigation and reloads; default is light. Dark mode uses deep green paper, light ink, muted borders, and warm readable highlights throughout, including dialogs, graphs, controls, and the reader. Print remains light. Main heading and search immediately follow. A large search input accepts words, quoted phrases, and filename IDs. Searches always include both languages. Results default to Citation count, highest first, with Text ID breaking ties. Citation count totals the listed entries in Manuscripts, Publications, Translations, and Musical interpretations; empty entries do not count. All metadata fields start closed; opening one is a reader choice. The filter rail has no separate “Refine collection” heading. The “Refine search” heading has Reset on its right, without a field count. Period values follow the first occurrence of their labels in column 2 of `period_renaming.csv`; uncertain variants follow their base label. Sort choices read ID, Citation count, Volume, and Date. Metadata filters occupy a left rail on desktop and a collapsible region on mobile. Result rows show source ID, descriptive title or incipit, metadata, and a contextual excerpt. Counts and pagination reflect the active filters. Missing values are explicit.

## Subject view

Use the same reading-room typography and paper. Preserve every subject CSV row and its exact color; all labels retain the same theme-aware paper background. The searchable subject directory defaults to Thematic order and offers Alphabetical or Thematic order from `subjects - reference.docx`, with the choice retained in the URL. Thematic order includes the document’s 19 main headings as non-clickable section labels. The selected subject, a bounded neighborhood graph, ordinary related links, then paginated selections grouped by source, in descending source citation count (the same totals as Catalog view), with source ID and paragraph number breaking ties. Imported/reviewed links use solid lines; suggestions use dashed lines and explicit labels. Graph nodes show complete subject names, wrapping to as many lines as needed; node height and row spacing grow to fit. Graph navigation always has ordinary link equivalents. Public matched selections show only a linked source ID and parallel source paragraphs with the selected English wording highlighted. The passage list has no author, volume, availability, or language-display filter row. Imported excerpts and provenance remain available in the editorial workspace. Missing originals display “Original text unavailable” in left-to-right English. Original paragraphs use the same number with an explicit unverified-correspondence notice. Uncertain matches belong in the editorial view. Editorial decisions are local drafts exported to a versioned file, with no account or runtime server.

## Reader
Back-to-results navigation retains query, filters, sort, and pagination. Header presents the ID, supplied title or a transparent fallback, author, and metadata. The Date / Recipient / Place summary substitutes Period for an absent Date when Period is available. Parallel / English / Original controls and text-size controls remain easy to reach. English is left; original is right, without an extra language-heading row above the columns. Equal-count documents pair paragraphs with subtle numbers and a central rule. Matching counts are not asserted to be editorially verified alignment; the equal-count explanatory line is omitted. Unequal-count documents use two independent columns and state why. On narrow screens, matching pairs stack English then original; unequal flows are separate language sections. Footnotes appear in a dedicated section with backlinks.

## State and accessibility
Deep links use query parameters so GitHub Pages can serve every state without server routing. Results announce completion to assistive technology. Labels remain visible; controls have at least 40px hit areas. Focus is visible. Loading, unavailable text, no matches, invalid IDs, and failed fetches have distinct messages and recovery actions. User text-size and language display preferences are stored locally; no visitor tracking.

## Architecture choice
The 161 MB source corpus benefits from a build-time index and on-demand retrieval. Native ES modules avoid framework overhead. Gzip-compressed positional postings, sharded by token hash, support exact phrases and original-language normalization with no hosted search service. A worker keeps searching and filtering off the main thread. Each reading record is fetched separately. Dates are filtered as source strings, retaining calendar and uncertainty notation. GitHub Actions builds from the versioned source archive and deploys dist/.

## Verification
Inspect the full collection import report; measure output size against the 1 GB GitHub Pages limit. Test whole-word and phrase semantics, RTL normalization, paragraph boundaries, malformed/nested LaTeX, metadata CSV quoting, direct ID lookup, missing counterparts, filter combinations, URL back/forward, desktop and narrow layouts, and note navigation.

## Enhanced catalogue metadata

Import the single UTF-8 CSV in `metadata - copy/`, joining its `PIN` column to full text filenames. All source columns generate filter controls; availability dropdowns are omitted. Catalogue details retain empty values but omit Subjects and the derived Citation count. Source metadata remains intact; generated Period labels use `period_renaming.csv`, with original values retained separately in each changed record. Categorical selections use OR within a field and AND across fields; counts exclude the current field’s own selection. Word count supports numeric bounds; dates remain source strings. Field columns load on demand in the search worker. Preserve raw metadata in records. Render only reconstructed HTTP(S) anchors with escaped labels; retain local drive references as visible text. Source hyperlink labels and destinations are searchable.
