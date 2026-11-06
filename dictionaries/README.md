# Dictionaries

The Catalog reader's word tooltip and word study rows (Words: original / Words: English) look words up in the dictionaries listed in `dictionaries.json`. Each build and interface refresh publishes them as small lookup files in `dictionaries/` on the site (`scripts/build-dictionaries.mjs`); editing a dictionary does not rebuild the collection.

Readers can also add their own dictionary file with the reader's **Dictionaries** button. It stays in their browser and is never uploaded.

## File format

A spreadsheet saved as tab-separated (TSV, preferred) or comma-separated (CSV) UTF-8 text. The first row names the columns; names are case-insensitive and columns may be in any order.

| Column | Required | Meaning |
|---|---|---|
| `form` | yes | The word as written in the text (`headword` and `word` are accepted too). Diacritics, Arabic/Persian letter variants (ي/ی, ك/ک) and joiners are ignored when matching, as in search. |
| `gloss` | yes (or `definition`) | A short gloss printed under the word in word study, ideally one word. |
| `vocalized` | | The same word with its vowel signs (ḥarakát), matching `translit`, e.g. نور → نُور. Shown by the Vowel marks toggle. It must have exactly the letters of `form`; published dictionaries are rejected otherwise (`vowelled` and `harakat` are accepted as column names). |
| `lemma` | | Dictionary headword, e.g. the singular of a plural. |
| `lang` | | `fa`, `ar`, `fa/ar` or `en`. Guessed from the script when empty. |
| `translit` | | Pronunciation in the Bahá'í transliteration system (á í ú, ‘ ’, ḥ ṣ ḍ ṭ ẓ, kh sh gh th dh ch zh). |
| `definition` | | A fuller learner's definition. |
| `notes` | | Grammar, sources, or "uncertain reading". |
| `rendering` | | The word as Shoghi Effendi's authorized translations would render it, e.g. امر → the-Cause, بشارت → glad-tidings, انّ → verily. Shown instead of `gloss` when the reader chooses the Bahá'í English gloss style (`gloss=bahai` in the URL), and beneath the gloss in the tooltip (`bahai`, `bahai english` and `elevated` are accepted as column names). |
| `register` | | `elevated` or `plain`: whether the original word belongs to the literary, archaic, Arabic or honorific register. Elevated words are marked in the Bahá'í English gloss style and labelled in the tooltip (`style` is accepted as a column name). Published dictionaries are rejected for any other value. |
| `status` | | `unreviewed`, `uncertain` or `reviewed` (any case; `review` and `review status` are accepted as column names). Empty counts as unreviewed. Published dictionaries are rejected for any other value. |
| `reviewer` | | Who reviewed the entry, with initials or a name and optionally a date, e.g. `SL 2026-11-05`. Only allowed when `status` is `reviewed`. |

A form may have several rows, one per meaning; the first row is the one shown in word study and all of them appear in the tooltip.

Persian/Arabic rows are also found from the English side through the words of their gloss, so one dictionary serves both directions. Rows whose `form` is English are English → Persian/Arabic entries, used first for English words: put the Persian/Arabic equivalent in `gloss`, the English word's pronunciation written in Persian script in `translit` (God → گاد), and a definition in that language in `definition`. A dictionary's target language (Persian or Arabic) is detected from its letters, or set with `target` (`fa`, `ar`) in `dictionaries.json`; the reader's فارسی / العربية choice puts that language's dictionaries first.

When a word is not listed as written, the reader tries it with one common prefix and/or suffix removed (و، ب، ال، می، ها، ان، ات، ی …; English -s, -ed, -ing …) and says so in the tooltip.

## Reviewing entries

To review an entry, correct any field that is wrong, set `status` to `reviewed` and put your name or initials and the date in `reviewer`. Review `uncertain` entries first: they mark readings the author was unsure of. The build counts entries per status in `index.json` (`review`). Keep `aiGenerated: true` in `dictionaries.json` (the reader's AI-generated label) until the whole dictionary has been reviewed.

## Adding a published dictionary

Put the file here and add an entry to `dictionaries.json`: `id` (lower-case letters, digits and hyphens), `name`, `file`, and optionally `description`, `source` and `aiGenerated: true` for machine-generated content, which the reader labels as AI-generated.
