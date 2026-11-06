# Dictionaries

The Catalog reader's word tooltip and word study rows (Words: original / Words: English) look words up in the dictionaries listed in `dictionaries.json`. Each build and interface refresh publishes them as small lookup files in `dictionaries/` on the site (`scripts/build-dictionaries.mjs`); editing a dictionary does not rebuild the collection.

Readers can also add their own dictionary file with the reader's **Dictionaries** button. It stays in their browser and is never uploaded.

## File format

A spreadsheet saved as tab-separated (TSV, preferred) or comma-separated (CSV) UTF-8 text. The first row names the columns; names are case-insensitive and columns may be in any order.

| Column | Required | Meaning |
|---|---|---|
| `form` | yes | The word as written in the text (`headword` and `word` are accepted too). Diacritics, Arabic/Persian letter variants (ي/ی, ك/ک) and joiners are ignored when matching, as in search. |
| `vocalized` | | The same word with its vowel signs (ḥarakát), matching `translit`, e.g. نور → نُور. Shown by the Vowel marks toggle. It must have exactly the letters of `form`; published dictionaries are rejected otherwise (`vowelled` and `harakat` are accepted as column names). |
| `lemma` | | Dictionary headword, e.g. the singular of a plural. |
| `lang` | | `fa`, `ar`, `fa/ar` or `en`. Guessed from the script when empty. |
| `translit` | | Pronunciation in the Bahá'í transliteration system (á í ú, ‘ ’, ḥ ṣ ḍ ṭ ẓ, kh sh gh th dh ch zh). |
| `pos` | | Part of speech, including any attached particles or suffixes, e.g. `noun pl.`, `adj.`, `verb 3sg pres.`, `prep. + noun`. |
| `root` | | The Arabic root with hyphens between its letters, e.g. ق-و-م for قوم; empty for words without one. |
| `gloss` | yes (or `definition`) | A short gloss printed under the word in word study, ideally one word. |
| `rendering` | | The word as Shoghi Effendi's authorized translations would render it, e.g. امر → the-Cause, بشارت → glad-tidings, انّ → verily. Shown instead of `gloss` when the reader chooses the Bahá'í English gloss style (`gloss=bahai` in the URL), where words with the `elevated` tag whose rendering differs from the gloss are marked, and after the gloss on the tooltip's gloss line (`bahai`, `bahai english` and `elevated` are accepted as column names). |
| `tags` | | Categories, comma-separated without spaces, from: `elevated` (Elevated style: words of the elevated, literary, archaic, Arabic or honorific register as the authorized translations render them), `archaic` (rare or obsolete in modern Persian/Arabic, typical of 19th-century usage), `literary` (understood but bookish, not used in speech), `religious` (general religious or theological vocabulary), `bahai` (a Bahá'í-specific term or sense), `quranic` (a Qur'anic phrase or allusion), `mystical` (a Sufi or philosophical term), `honorific` (a title or term of respect), `meaning-shift` (the usual modern meaning differs from the meaning here) and `arabic-loan` (an Arabic word used inside Persian). |
| `modern` | | The everyday modern equivalent, e.g. سماء → آسمان. Only given with the `archaic`, `literary` or `meaning-shift` tag. |
| `modern_translit` | | Pronunciation of the modern equivalent in the Bahá'í transliteration system (`modern translit` and `modern pronunciation` are accepted as column names). Given exactly when `modern` is. |
| `modern_gloss` | | A short English gloss of the modern equivalent (`modern meaning` is accepted). Given exactly when `modern` is. |
| `shift` | | For meaning-shift entries: what the word means here vs. its usual modern meaning, in one sentence, e.g. "Here: a religious community. Today: a nation." (`meaning shift` and `shift note` are accepted). Shown in the tooltip after the tags as "Meaning shift: …". |
| `definition` | | A fuller learner's definition. |
| `usage` | | One or two sentences on how the word is generally used in the Bahá'í Writings. |
| `notes` | | Grammar, sources, or "uncertain reading". |
| `kjv` | | For an archaic English word: a King James Bible verse where it occurs, as `Book chapter:verse` with the book's full name, e.g. `Matthew 4:24` (`bible`, `bible verse`, `bible reference`, `kjv verse` and `kjv reference` are accepted). |
| `kjv_text` | | A short verbatim excerpt of that verse containing the word (about 15 words at most), e.g. `sick people that were taken with divers diseases and torments`. Shown in the tooltip as “King James Bible: “…excerpt…” — reference”. Only allowed with `kjv`: published dictionaries are rejected otherwise and personal ones drop it (`kjv text`, `kjv excerpt`, `kjv quote`, `bible text` and `bible excerpt` are accepted). |
| `status` | | `unreviewed`, `uncertain` or `reviewed` (any case; `review` and `review status` are accepted as column names). Empty counts as unreviewed. Published dictionaries are rejected for any other value. |
| `reviewer` | | Who reviewed the entry, with initials or a name and optionally a date, e.g. `SL 2026-11-05`. Only allowed when `status` is `reviewed`. |

Column names are case-insensitive; `part of speech` is accepted for `pos`, `category` and `categories` for `tags`, `modern equivalent` for `modern`, and `bahai usage` and `usage note` for `usage`. Tags are matched in any case, with spaces around commas ignored and repeats removed. A published dictionary is rejected for any tag not listed above; a personal dictionary simply drops it. The `register` column is replaced by the `elevated` tag; files that still have a `register` column are read: `elevated` (any case) adds the `elevated` tag, and any other value is ignored.

A form may have several rows, one per meaning; the first row is the one shown in word study and all of them appear in the tooltip.

Persian/Arabic rows are also found from the English side through the words of their gloss, so one dictionary serves both directions. Rows whose `form` is English are English → Persian/Arabic entries, used first for English words: put the Persian/Arabic equivalent in `gloss`, the English word's pronunciation written in Persian script in `translit` (God → گاد), and a definition in that language in `definition`. A dictionary's target language (Persian or Arabic) is detected from its letters, or set with `target` (`fa`, `ar`) in `dictionaries.json`; the reader's فارسی / العربية choice puts that language's dictionaries first. (`target` `en` marks a Persian/Arabic → English dictionary.)

English words can also be explained in modern English: a dictionary with `target` `modern` (detected when English headwords have glosses and definitions without Persian or Arabic letters) gives each archaic or literary English form its modern meaning in `gloss` (divers → various), and may add `kjv` and `kjv_text`. Its entries are looked up only for the word exactly as written, come first in the tooltip of an English word with “Modern: <gloss>”, the usage introduced by “In the translations:” and the King James Bible line, and are never used for the Words: English row, which keeps its Persian/Arabic equivalents. `archaic-english.tsv` is such a dictionary: the King James–style English of the authorized translations, its example verses checked against the eBible.org King James text (see its `source` in `dictionaries.json`).

When a word is not listed as written, the reader tries it with one common prefix and/or suffix removed (و، ب، ال، می، ها، ان، ات، ی …; English -s, -ed, -ing …) and says so in the tooltip.

## Reviewing entries

To review an entry, correct any field that is wrong, set `status` to `reviewed` and put your name or initials and the date in `reviewer`. Review `uncertain` entries first: they mark readings the author was unsure of. The reader's tooltip footer labels each entry Unreviewed, Uncertain reading or Reviewed (with the reviewer).

The site's review page, `dictionary-review.html?dict=<id>` (**Review entries →** in the reader's Dictionaries dialog), does this without a spreadsheet: choose a dictionary, enter your name or initials once, then work through the entries (uncertain first, 50 per page), edit any field, and use **Mark reviewed** (records your name and today's date) or **Mark uncertain**. Persian/Arabic entries can show their context in authorized translations. Edits stay in your browser as drafts until you choose **Download reviewed TSV**, which gives the whole file with only your edited rows changed. Replace the file of the same name here with it and open a pull request; the site publishes it once the pull request is merged. The build publishes each dictionary's source file unchanged as `<id>.tsv` (listed as `file` in `index.json`) for this page. The build counts entries per status in `index.json` (`review`). Keep `aiGenerated: true` in `dictionaries.json` (the reader's AI-generated label) until the whole dictionary has been reviewed.

## Adding a published dictionary

Put the file here and add an entry to `dictionaries.json`: `id` (lower-case letters, digits and hyphens), `name`, `file`, and optionally `description`, `source`, `aiGenerated: true` for machine-generated content, which the reader labels as AI-generated, and `about`: a list of 3–4 plain-text paragraphs (scope, what an entry is, contents, how it was made and its limits) that the build passes to `index.json` with the dictionary's counts of entries, distinct forms and uncertain entries (`entries`, `forms`, `uncertain`), shown as “About this dictionary” in the Dictionaries dialog, the dictionary browser and the review page.
