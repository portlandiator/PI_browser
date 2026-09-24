# Claude working notes: Partial Inventory browser

Read AGENTS.md first; it holds the project invariants. Then read DESIGN.md before interface work, SKILL.md before corpus/reader/search work, SUBJECTS.md before Subject view or editorial tools, and THEMATIC-MATRIX.md (if present locally) only for the offline scoring pilot. README.md is the user-facing overview.

## Which document wins
- Code and tests are ground truth for current behaviour. When guidance disagrees with them, confirm with the owner before changing code, then correct the guidance.
- DESIGN.md is the authoritative interface specification. Later paragraphs in DESIGN.md refine earlier ones (for example, the curated 18-field filter rail at its end).
- The "Enhanced catalogue metadata" paragraph is duplicated in AGENTS.md, README.md and SKILL.md. Keep those three copies identical; DESIGN.md has its own version, which must agree with them.

## Facts verified against the code (2026-09-23)
- Subject directory defaults to Thematic order; only `order=alphabetical` switches (src/subjects.mjs).
- Subject colours: CSV hex values map to theme-aware day/night shades in src/theme.css via src/subject-colors.mjs.
- Catalogue details omit Subjects and Citation count and place Extract after Word count (src/translation-status.mjs `catalogueDetails`).
- The filter rail is the curated list in src/catalog-filters.mjs; there are no availability filters.
- The public subject graph has no zoom controls or duplicate related-subject list.

## Working environment
- The owner works on Windows in a Dropbox folder (`C:\Users\steve\Dropbox\AI_project\PI explorer`). Claude may reach it only through file staging, not a shell, so builds and tests run in Claude's own workspace on a copy, and the owner publishes with `Update-Collection.cmd` or a normal Git push.
- Several docs use CRLF line endings. Preserve each file's existing line endings and UTF-8 encoding; watch for mojibake (`â€™`, `â†’`) when editing.
- Do not edit the immutable source folders (`original_texts - copy`, `translated_texts - copy`, `metadata - copy`, `pdf_volumes - copy`). Root `*.log` files and `.qa/` are ignored working output.
- The owner's local folder can hold uncommitted work that is not on GitHub (as of 2026-09-23: the passage review utility, passage citations and thematic-matrix scripts). Never publish it without the owner's explicit approval; compare against `origin/main` before pushing.
- Earlier development was done with ChatGPT/Codex; references to "Codex" as maintainer in the docs mean whichever assistant is maintaining the project.
- Never force-push, change repository visibility, or upload an unfiltered source archive (`python scripts/archive-sources.py --check`).
