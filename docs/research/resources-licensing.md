> Research notes gathered with AI assistance in November 2026 for [the translation model](../translation-model.md). Every claim carries its source link; items that could not be confirmed are marked "unverified". This is a practical survey, not legal advice.

# External resources for word tooltips and dictionaries: licensing and practicality

Researched 2026-11-05. Every claim has a linked source. Items marked **unverified** could not be confirmed from a primary page. This is a practical survey, not legal advice.

## Summary

| Resource | Usable for us? | License / terms | Link |
|---|---|---|---|
| Bahá'í Reference Library (en/fa/ar) | With conditions: non-commercial, copyright notice, no alteration; ask before shipping derived data | BIC copyright; [bahai.org/legal](https://www.bahai.org/legal) | https://www.bahai.org/library/ |
| BWC transliteration list (~480 terms) | With conditions (same terms as above) | BIC copyright | https://www.bahai.org/library/transliteration/ |
| Gail, *Bahá'í Glossary* (1955/57) | Uncertain: possibly public domain in the US, but renewal is unverified; ask the NSA of the US | © 1955 NSA of the US | https://bahai-library.com/3498 |
| Steingass (1892) text | Yes. The book is public domain | Public domain | (scans) |
| Steingass, DSAL digitization | No for bundling (no derivatives) | CC BY-NC-ND 2.0 | https://dsal.uchicago.edu/dictionaries/steingass/ |
| Lane, Perseus/Alpheios TEI XML | Yes, with attribution and share-alike | CC BY-SA 3.0 US (Alpheios); Perseus "free" availability terms | https://github.com/laneslexicon/lexicon_xml |
| ejtaal Arabic Almanac (scans) | Link only | Code GPL-3; no terms for the scans | https://ejtaal.net/aa/ |
| Hans Wehr | No (in copyright) | © Harrassowitz and others; Wehr died 1981 | — |
| Dehkhoda (official) | Link only | "All rights reserved", Dehkhoda Institute | https://dehkhoda.ut.ac.ir/fa/dictionary |
| Mo'in (via Abadis) | Link only (bundling risky) | Abadis: free use with source credit; publisher rights unclear | https://abadis.ir/moeen/ |
| Wiktionary / Kaikki (en-wiktionary Persian and Arabic) | Yes, with attribution and share-alike for the data | CC BY-SA 4.0 (and GFDL) | https://kaikki.org/dictionary/rawdata.html |
| Hazm | Yes (code); model licenses unverified | MIT | https://github.com/roshan-research/hazm |
| CAMeL Tools | Yes (code MIT); default morphology DB is GPL v2; s31 DB needs a paid LDC licence | MIT / GPL v2 / LDC | https://github.com/CAMeL-Lab/camel_tools |
| Farasa | No (research only) | QCRI research-only | https://farasa-api.qcri.org/ |
| Mishkal | Yes at build time; GPL if redistributed | GPL-3.0 | https://github.com/linuxscout/mishkal |
| Stanza (fa, ar) | Yes | Apache-2.0 (code and models) | https://huggingface.co/stanfordnlp/stanza-ar |
| M. W. Thomas transcription glossary | Ask the compiler | Posted with "editor" permission | https://bahai-library.com/4763 |
| Ocean / CTAI | Link only; terms unverified | Not stated | https://bahai-education.org/categories/tools |

---

## 1. Bahá'í Reference Library

- **What it covers.** The library is "the authoritative online source of Bahá'í writings": the Writings of Bahá'u'lláh, the Báb, 'Abdu'l-Bahá and Shoghi Effendi, messages of the Universal House of Justice, and other literature ([bahai.org/library](https://www.bahai.org/library/)). The Persian edition offers the original texts, for example the Kitáb-i-Aqdas, Íqán and Hidden Words ([fa downloads](https://www.bahai.org/fa/library/authoritative-texts/downloads)). `bahai.org/ar/library/` served English content when fetched. The Arabic portal is the legacy [reference.bahai.org/ar/](https://reference.bahai.org/ar/), which carries Arabic, Persian and English.
- **Downloads.** The English library offers PDF, DOCX, DOCX† (full diacritics) and HTML, though not every title has every format ([en downloads](https://www.bahai.org/library/authoritative-texts/downloads)). The Persian library offers PDF, Word (DOCX) and HTML (XHTML), with fewer formats for some titles ([fa downloads](https://www.bahai.org/fa/library/authoritative-texts/downloads)). These are structured text, not scans. Both download pages point to the Legal page for terms.
- **Terms (current site).** Source: [bahai.org/legal](https://www.bahai.org/legal), updated 5 September 2022.
  - "The Bahá'í International Community retains full legal protection for its Content."
  - Use must not misrepresent "the intent of the original source".
  - Use must carry "Copyright © Bahá'í International Community", with attribution.
  - For text, no editing is permitted; only audio-visual content may be cropped or edited for size.
  - Commercial use needs permission (termsofuse@bahai.org).
  - Permission may be withdrawn at any time.
- **Terms (legacy site).** Source: [reference.bahai.org/en/terms.html](https://reference.bahai.org/en/terms.html). "You have permission to freely make and use copies of the text", provided the copyright notice and source reference are attached, the content is not "modified or altered in any way except to change the font or appearance", and the use is "solely for a non-commercial purpose."
- **Bundling.** Hosting the texts unaltered, with the notice, on a non-commercial public site fits these terms. Derived data such as phrase alignments, glossary pairs and lemmatized forms is not addressed. The "no editing" clause makes that a grey area, so ask termsofuse@bahai.org before shipping derived datasets. (This is our interpretation.)
- **Bonus: transliteration list.** *The Transliteration System Used in Bahá'í Literature* is available in PDF, DOCX and HTML ([page](https://www.bahai.org/library/transliteration/)). The DOCX includes a list headed "Transliteration of Some Arabic and Persian Words Used in Bahá'í Literature", about 480 entries in Latin script only, with no Arabic script. We counted these in the downloaded DOCX. It is under the same BIC terms.

## 2. Marzieh Gail, *Bahá'í Glossary*

- **Bibliographic details.** It was published by the Bahá'í Publishing Trust, Wilmette (56 pp.). Bahá'í Library Online hosts HTML and PDF copies, scanned in 2008 by bahaiglossary.org, with the permission field set to "publisher" ([bahai-library.com/3498](https://bahai-library.com/3498)).
- **Copyright notice and printings.** The notice reads "Copyright © 1955 by the National Spiritual Assembly of the Bahá'ís of the United States of America", printed 1957 ([copyright page](https://www.bahai-library.com/glossary/copyright.html)). There were at least four later printings, the fourth in 1969 ([about](https://bahai-library.com/glossary/about.html)).
- **Status.** US works published 1931–1963 with notice are public domain unless the copyright was renewed ([Cornell chart](https://guides.library.cornell.edu/copyright/publicdomain)). Whether it was renewed is **unverified**: the Stanford renewal database blocked automated queries. The later revised printings may carry their own copyright.
- **Practical note.** The text is short (a few hundred terms) and its structure is simple. Check for a renewal (the 1982–83 renewal records), or simply ask the NSA of the US / Bahá'í Publishing for permission.

## 3. Steingass, *Comprehensive Persian-English Dictionary* (1892)

- **Public domain.** Published in London by Routledge & K. Paul in 1892 ([DSAL](https://dsal.uchicago.edu/dictionaries/steingass/)). Steingass died in 1903 ([Wikipedia](https://en.wikipedia.org/wiki/Francis_Joseph_Steingass)). The text is public domain: works published before 1931 are public domain in the US ([Cornell](https://guides.library.cornell.edu/copyright/publicdomain)), and the author died more than 70 years ago.
- **DSAL digitization.** It is searchable text, last updated July 2019, and "licensed under a Creative Commons License", linked to **CC BY-NC-ND 2.0** ([DSAL](https://dsal.uchicago.edu/dictionaries/steingass/)). The no-derivatives term rules out reshaped tooltip data. Even a verbatim copy would need non-commercial use and attribution.
- **Third-party scrape.** T. S. Beers "downloaded all 69,888 entries from the DDSA version" into SQLite ([steingass.pages.dev/about](https://steingass.pages.dev/about)). The repository is MIT-licensed ([github.com/theodore-s-beers/steingass-scraper](https://github.com/theodore-s-beers/steingass-scraper), from the GitHub API), but MIT covers only the scraper's own code. The data comes from DSAL, so treat it as bound by DSAL's CC BY-NC-ND. (This is our interpretation.)
- **Clean route.** OCR public-domain scans ourselves. An Internet Archive scan is cited on [Wikipedia](https://en.wikipedia.org/wiki/Francis_Joseph_Steingass). The quality of any OCR is **unverified**.

## 4. Lane, *Arabic-English Lexicon* (1863–1893)

- **Public domain and coverage gap.** Lane died in 1876 at the letter Qāf. Volumes VI–VIII (1877–1893) were completed by Stanley Lane-Poole from notes and are "sketchy and full of gaps" ([Wikipedia](https://en.wikipedia.org/wiki/Arabic%E2%80%93English_Lexicon)). The text is public domain.
- **Perseus TEI XML.** The [laneslexicon/lexicon_xml](https://github.com/laneslexicon/lexicon_xml) repository holds "The Perseus XML files with amendments", about 37 files and 80 MB in total, TEI.2. Each file header says the text "may be freely distributed" provided you credit "Text provided by Perseus Digital Library, with funding from The U.S. Department of Education and The Max Planck Society", leave the statement intact, and "offer Perseus any modifications". The repository has no LICENSE file (GitHub API).
- **Alpheios edition.** The corrected copy at [alpheios-project/lan](https://github.com/alpheios-project/lan) states: "This work is licensed under a Creative Commons Attribution-ShareAlike 3.0 United States License." The format uses Buckwalter-transliterated roots ([laneslexicon.github.io](https://laneslexicon.github.io/news.html)).
- **Bundling.** Allowed. Keep the Perseus credit, license the derived data CC BY-SA, and offer corrections upstream.
- **ejtaal Arabic Almanac.** It shows mostly **page images** of Lane, Hans Wehr, Steingass, Hava and others, plus a text version of Lane derived from Perseus. Its code is under "GNU GPL v3"; there are no licence terms for the dictionaries themselves ([readme](https://ejtaal.net/aa/readme.html)). Linking to it is fine; do not copy the scans.
- **lexicon.quranic-research.net.** Wikipedia describes it as an optimized Perseus text ([Wikipedia](https://en.wikipedia.org/wiki/Arabic%E2%80%93English_Lexicon)). Its terms are **unverified** (TLS error when fetched).

## 5. Hans Wehr, *Dictionary of Modern Written Arabic*

- **Editions.** German original 1952; English edition (ed. J. M. Cowan) 1961, published by Harrassowitz; 4th edition 1979; Spoken Language Services editions from 1976 and 1994; German 6th edition December 2020 ([Wikipedia](https://en.wikipedia.org/wiki/A_Dictionary_of_Modern_Written_Arabic)).
- **Author.** Wehr died on 24 May 1981 ([Wikipedia](https://en.wikipedia.org/wiki/Hans_Wehr)).
- **Status.** In copyright: life + 70 runs to 2051 in Germany. The 1961 US publication would also need its renewal status checked, which is **unverified**. Later editions have their own copyright. **Not usable**; at most, link to it.

## 6. Dehkhoda and Mo'in

- **Dehkhoda.** The Dehkhoda Institute (University of Tehran) runs an online search at [dehkhoda.ut.ac.ir/fa/dictionary](https://dehkhoda.ut.ac.ir/fa/dictionary).
  - Footer: "© تمامی حقوق متعلق به مؤسسۀ لغت‌نامۀ دهخدا… است" ("all rights belong to the Dehkhoda Institute…").
  - No download or API is offered.
  - The institute said the lexicon "was used on different websites illegally" ([Tehran Times](https://www.tehrantimes.com/news/451139/Online-version-of-Dehkhoda-Lexicon-launched)).
- **Mo'in.** Abadis hosts Mo'in (publisher Amirkabir) with "استفاده از نوشتارهای این دیکشنری، با ذکر منبع، آزاد است" ("use of this dictionary's texts is free with credit to the source") ([abadis.ir/moeen](https://abadis.ir/moeen/)). Abadis may not hold the publisher's rights, which is **unverified**.
- **Legal background.** Under Iran's law, authors who died before 22 August 1980 are public domain there ([Commons notice](https://de.wikipedia.org/wiki/Datei:Dehkhoda_note.jpg)). Iran has no copyright relations with the US ([Wikipedia, citing Circular 38a](https://en.wikipedia.org/wiki/Iran%E2%80%93United_States_copyright_relations)). However, the institute's continuing editorial work and its database rights make bulk copying unwise. **Recommendation:** add "look up in Dehkhoda/Abadis" links only.

## 7. Wiktionary / Kaikki

- **License.** Wiktionary text is under "CC BY-SA 4.0" and the GFDL; "Reusers may comply with either license or both." Attribution may be given by hyperlink or URL to the pages reused. Modified content must be licensed under "CC BY-SA 4.0 or later", and the changes must be indicated ([Wikimedia Terms of Use §7](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use)).
- **Kaikki data.** Kaikki states no separate licence. It asks academic users to cite Ylönen (LREC 2022) and to link back to kaikki.org ([rawdata](https://kaikki.org/dictionary/rawdata.html)).
  - Persian (English-edition glosses): 17,651 distinct words, 91.3 MB JSONL ([Persian](https://kaikki.org/dictionary/Persian/index.html)).
  - Arabic: 177,029 word forms, 827.9 MB JSONL ([Arabic](https://kaikki.org/dictionary/Arabic/index.html)).
  - Both per-language files are marked "DEPRECATED" in favour of the full raw dump (2.9 GB gz).
- **Repository implications.** Keep the derived data in its own folder under CC BY-SA 4.0, with a credit and link to Wiktionary and kaikki.org, and note "modified". Share-alike applies to the dataset, not to unrelated site code; this is our interpretation and is commonly practised. Filter the data to the site's vocabulary to keep size down.

## 8. NLP tools for build time

- **Hazm (Persian).** MIT (GitHub API). The pip wheel is 0.9 MB ([PyPI](https://pypi.org/pypi/hazm/json)). The POS tagger, chunker and parser models are downloaded from Hugging Face ([README](https://github.com/roshan-research/hazm)). The model cards state no licence (**unverified**). This is fine at build time; only redistributing the models is a question.
- **CAMeL Tools (Arabic).** MIT (GitHub API, [PyPI](https://pypi.org/pypi/camel-tools/json)). Data packages ([packages](https://camel-tools.readthedocs.io/en/latest/reference/packages.html)):
  - `morphology-db-msa-r13`: 40.5 MB, **GPL v2**.
  - `disambig-mle-calima-msa-r13`: 88.7 MB, GPL v2.
  - `calima-msa-s31` requires a licensed copy of LDC SAMA 3.1 (LDC2010L01) ([db install docs](https://camel-tools.readthedocs.io/en/latest/_sources/reference/db_install.rst.txt)).
  - Using these at build time is fine. Shipping the GPL database itself would make that file GPL. Shipping its *output* (lemmas per word) is generally not restricted (our interpretation).
- **Farasa.** "for research purpose only… For non-research use, please contact us", and registration is required ([farasa-api.qcri.org](https://farasa-api.qcri.org/), as quoted in search results; the main site returned 403). The wrapper farasapy is MIT, but that does not change Farasa's terms. **Avoid.**
- **Mishkal (Arabic diacritization).** GPL-3.0 (GitHub API). The wheel is 0.8 MB ([PyPI](https://pypi.org/pypi/mishkal/json)). It is fine as a build-time tool; its output is ours.
- **Stanza.** Apache-2.0 code ([LICENSE](https://github.com/stanfordnlp/stanza)). The Hugging Face model cards for `stanza-fa` and `stanza-ar` say `apache-2.0`. Default packages are about 334 MB (fa) and 459 MB (ar) (HF API). That is too large to commit; download at build time and cache.
- **Node options.** No mature Node-native Persian or Arabic morphology tool was found in this survey. The practical route is Python at build time that writes JSON (**unverified**: the search for Node tools was not exhaustive).

## 9. Bahá'í term lists and concordances

- **Michael W. Thomas, *Arabic and Persian Transcription List with Meanings and Glossary*.** A "Comprehensive dictionary for Arabic and Persian names and terms" in PDF and DOCX, updated monthly (last edit 2026-06-17), with permission "editor" ([bahai-library.com/4763](https://bahai-library.com/4763)). This is the best candidate; ask the compiler.
- **Bahá'í Library Online policy.** Items are posted with permission of the author, editor or publisher. The site advises users to "contact authors and seek permission before redistributing" ([copyright notes](https://bahai-library.com/copyright)). Other lists there include Jonah Winters' short glossary and the Bahá'í World "Oriental words" list (per search results; not opened, **unverified**).
- **Ocean.** A downloadable, book-centred search library ([Bahaipedia](https://bahaipedia.org/Ocean)). Ocean 2.0 is a reader ([bahai-education.org](https://bahai-education.org/categories/tools)). No terms were found (**unverified**), and no Persian/Arabic concordance was found.
- **CTAI** (Chad Jones). Its pipeline uses "a concordance of over 105,000 occurrences in Shoghi Effendi's translations". It says "Everything here is freely available", but it states no licence and no download ([ctai.info](https://ctai.info)). It is potentially the most relevant source for translators; contact the author.
- **Official BWC transliteration list.** See §1.
