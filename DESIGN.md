# Partial Inventory browser

## Purpose
A calm public reading room for browsing and searching the supplied Baha'i texts. The collection, search controls, and reading surface are the product. No accounts, feedback, AI answers, or promotional landing page.

## Visual direction
An archival catalogue with contemporary controls: warm ivory paper, forest green ink, muted olive accents, hairline separators, generous reading margins. A small open-book mark is the only illustration. No decorative photography is needed.

### Tokens
- Paper: #f7f6f0; reading page: #fffefa; ink: #203a32.
- Secondary text: #627069; rule: #dddfd4; accent: #8b6c36.
- Selection: #e7ede4; highlight: #f6e5aa.
- Controls: system sans-serif; headings/English text: Georgia; Persian/Arabic: locally hosted Noto Naskh Arabic when available, with Tahoma and serif fallbacks.
- Body controls: 14–16px. English reading: 20px, line-height 1.85. Original reading: 23px, line-height 2.05. User size range: 85–135%.

## Collection view
Compact persistent masthead with wordmark and Collection / About navigation. Main heading and search immediately follow. A large search input accepts words, quoted phrases, and filename IDs. Search language is explicit. Metadata filters occupy a left rail on desktop and a collapsible region on mobile. Result rows show source ID, descriptive title or incipit, metadata, and a contextual excerpt. Counts and pagination reflect the active filters. Missing values are explicit.

## Reader
Back-to-results navigation retains query, filters, sort, and pagination. Header presents the ID, supplied title or a transparent fallback, author, and metadata. Parallel / English / Original controls and text-size controls remain easy to reach. English is left; original is right. Equal-count documents pair paragraphs with subtle numbers and a central rule. Matching counts are not asserted to be editorially verified alignment. Unequal-count documents use two independent columns and state why. On narrow screens, matching pairs stack English then original; unequal flows are separate language sections. Footnotes appear in a dedicated section with backlinks.

## State and accessibility
Deep links use query parameters so GitHub Pages can serve every state without server routing. Results announce completion to assistive technology. Labels remain visible; controls have at least 40px hit areas. Focus is visible. Loading, unavailable text, no matches, invalid IDs, and failed fetches have distinct messages and recovery actions. User text-size and language display preferences are stored locally; no visitor tracking.

## Architecture choice
The 161 MB source corpus benefits from a build-time index and on-demand retrieval. Native ES modules avoid framework overhead. Gzip-compressed positional postings, sharded by token hash, support exact phrases and original-language normalization with no hosted search service. A worker keeps searching and filtering off the main thread. Each reading record is fetched separately. Dates are filtered as source strings, retaining calendar and uncertainty notation. GitHub Actions builds from the versioned source archive and deploys dist/.

## Verification
Inspect the full collection import report; measure output size against the 1 GB GitHub Pages limit. Test whole-word and phrase semantics, RTL normalization, paragraph boundaries, malformed/nested LaTeX, metadata CSV quoting, direct ID lookup, missing counterparts, filter combinations, URL back/forward, desktop and narrow layouts, and note navigation.

## Enhanced catalogue metadata

Import the single UTF-8 CSV in `metadata - copy/`, joining its `PIN` column to full text filenames. All source columns generate filter controls and appear in catalogue details, including empty values. Categorical selections use OR within a field and AND across fields; counts exclude the current field’s own selection. Word count supports numeric bounds; dates remain source strings. Field columns load on demand in the search worker. Preserve raw metadata in records. Render only reconstructed HTTP(S) anchors with escaped labels; retain local drive references as visible text. Source hyperlink labels and destinations are searchable.
