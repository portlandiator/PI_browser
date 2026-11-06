# Translation model for word study and translator tools

How the reader's translator tools should work, based on how Bahá'í translation is actually done. Research date: November 2026. Each claim cites its source; anything unconfirmed is marked **unverified**. This is a practical survey, not legal advice.

## How Bahá'í translation is done

- **Shoghi Effendi set the model.** His English is deliberately elevated: he took the King James Bible as his model because it is "an authoritative one and in beautiful English" (letter of 28 October 1949, in the Research Department compilation [*Literary Style—Translation*](https://bahai-library.com/pdf/compilations/compilation_literary_style_translation.pdf)). The same compilation describes his "very beautiful and poetic style in English using many words which might be considered archaic" (29 October 1973).
- **Context decides the rendering, not a fixed word list.** Translators "frequently have to use various different synonyms in English to give the best translation of the same Arabic or Persian word when it appears in different contexts. Conversely, they may have to use the same English word in different contexts to translate various different words in the original. In doing this they attempt to follow the example set by Shoghi Effendi" (31 May 1981, letter on behalf of the Universal House of Justice to a National Translation and Revision Committee; same compilation, verified).
- **Literal translation is not the goal.** "A literal translation is often a bad one… a translator is at times compelled to convey the meaning of the original by means of a form of words suited to the language" (29 October 1973, same compilation).
- **Authorized vs provisional.** "Individual believers are free to translate into English any of the Holy Writings for their own use. Such translations may also be issued electronically, and may be published in circulars or journals without review by anyone other than the editors of the publications, but they must, in all cases, be clearly labeled as 'provisional translations'" ([Policies Governing Authorized and Provisional Translations, 4 July 1999, Appendix II, point 2](https://www.bahai.org/library/authoritative-texts/the-universal-house-of-justice/messages/19990704_001/1), verified). Books and pamphlets of new translations go through review at the Bahá'í World Centre (same document).
- **Authorized volumes reuse Shoghi Effendi's translations** where he translated a passage and aim at conformity with his style elsewhere (per the research report; volume prefaces such as the Kitáb-i-Aqdas and *Summons of the Lord of Hosts* list his passages — **unverified** in detail here).
- **Other languages** are generally translated from the authorized English, consulting the originals where the English is ambiguous (research report; **unverified** in detail here).

## The model we follow

1. **Show how the words were actually rendered.** For a Persian/Arabic word, show the authorized paragraphs where it occurs, with their English, and every attested rendering. Never present one fixed equivalent as *the* translation. This follows the 1981 guidance above.
2. **Keep authorized and provisional strictly apart.** Label every text and suggestion by status. Anything this tool produces (dictionary glosses, Bahá'í English renderings, statistics) is provisional study material, labelled AI-generated where it is. Where possible, distinguish Shoghi Effendi's own translations from later authorized ones. The catalog's Translations field cites sources (e.g. GPB, GWB for his works; SWAB for a later compilation), which could support that.
3. **Original beside translation, always.** The reader already pairs them; tools must keep the source paragraph and its exact version.
4. **Explain, don't simplify.** Glossaries, tooltips, notes and the pronunciation guide sit beside the text; the published text is never altered (Vowel marks add signs to the source letters only).
5. **Statistics are hints, not alignment.** Co-occurrence between an original word and English words in authorized paragraphs may be shown as "often appears with", never as a claimed word-for-word match (AGENTS.md).

## Resources we may use

| Resource | Use | Terms |
|---|---|---|
| This collection's authorized texts (1,413 paired with originals; 9,893 paragraphs; ~913k English words) | Concordance and attested renderings | Already published on this site |
| Lane, *Arabic–English Lexicon*, Perseus/Alpheios TEI XML ([lexicon_xml](https://github.com/laneslexicon/lexicon_xml)) | Arabic dictionary entries, cited per entry | Free with attribution; Alpheios copy CC BY-SA 3.0 US |
| Wiktionary via [Kaikki](https://kaikki.org/dictionary/rawdata.html) | Persian/Arabic glosses and forms | CC BY-SA 4.0: attribution, share-alike, kept in its own folder |
| Steingass (1892) | Persian dictionary | Book is public domain, but the [DSAL digitization](https://dsal.uchicago.edu/dictionaries/steingass/) is CC BY-NC-ND (no derived data); a fresh OCR of the book would be needed |
| Hazm (MIT), CAMeL Tools (MIT; default morphology DB GPL v2), Stanza (Apache-2.0) | Build-time lemmas and analysis | Run at build time; do not commit large models |
| Bahá'í World Centre transliteration list (~480 terms) | Transliteration checks | BIC copyright: ask before shipping derived data |
| Gail, *Bahá'í Glossary* (1955) | Term glosses | Copyright status unclear: ask the National Spiritual Assembly of the US |
| Hans Wehr, Dehkhoda, Mo'in, Farasa, Ocean | — | Not usable for bundled data; outbound links at most |

Detailed findings and sources: the research notes behind this page (translation practice; resources and licensing), kept with the pull request that added it.

## Build order

1. **Concordance of authorized renderings** (no outside data needed). Done on `feature/translation-resources`: `concordance/`, built by `scripts/build-concordance.mjs`.
2. **Attested renderings in the tooltip**, from the concordance, labelled as statistics. Done on `feature/translation-resources`: "In authorized translations" and Show passages (`src/concordance-view.mjs`).
3. **Review workflow** for dictionaries: `source` and `reviewed` columns; start with entries marked uncertain.
4. **Lane entries** beside AI glosses for Arabic words, with citation.
5. **Build-time morphology** (Hazm / CAMeL Tools) to extend coverage beyond Volume 164.
6. Permission requests (BIC transliteration list, Gail's glossary) before using those sources.
