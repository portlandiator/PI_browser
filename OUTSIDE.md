# Study guides read with quotations from beyond the Bahá’í writings

Each study guide can be read with as many quotations from other scriptures, philosophy, literature and public life as it shows of its own. This file is the whole method for doing that to one guide in one session. Read it through before starting; nothing else needs to be read first.

## What exists

- A guide shows at most 100 of its own quotations and, after each reading, the outside quotations chosen for it. The site builds that page in place of the guide's study-guide view when the guide's plan is marked published (DESIGN.md describes the page). The guide's own files (`study-guides/*-batch.json`, `editorial.json`) are never edited in this work.
- Each guide has one file, `study-guides/outside/<slug>.json`: its plan (`status` draft or published, the `rule` of the cut, the readings `kept`, an `introduction`, `questions`, the placements in `outside`) and, in `library`, the quotations first recorded for it. Together the files' libraries are one library: any guide may place a quotation recorded for another, by its id.
- `node scripts/outside-guide.mjs` does the mechanical work and needs no build: it reads the guide from the published site (or from `dist/` when there is a build). `study-guides/outside/unityhumanity.json` is the first guide done and the model for the rest.

## One guide, step by step

1. **Choose the guide.** The owner's choice, or else the first that `node scripts/outside-guide.mjs status` lists. Look at the open pull requests first: one titled “Study guide with outside quotations: …” means that guide is taken.
2. **Start it.** `node scripts/outside-guide.mjs brief <slug>` writes the draft plan and `reports/outside-guides/<slug>.brief.md`. Read the brief completely, in parts if it is long: every reading kept, with its number in the guide. A plan that already exists is resumed, not restarted.
3. **Choose against the content.** For each reading ask what it says, argues or pictures, and what in the world's writing answers that. Work through the parts in order, and give each part about as many outside quotations as it keeps of the guide's own (the brief shows both numbers).
4. **Reuse before searching.** `node scripts/outside-guide.mjs find <word> ...` searches every quotation recorded so far, and the brief shows what other guides placed against the same passage. A quotation already recorded is placed by its id and costs nothing to verify again.
5. **Record what is new.** Find a page that holds the text of the work, look at the wording with `show`, then `record` it (below). The wording is cut from the page; it is never typed or pasted.
6. **Place it.** `node scripts/outside-guide.mjs place <slug> <id> --after <n> --relation adjacent|contrast|complement --why "<note>" [--with <n>,<n>]`. `<n>` is the reading's number in the guide; `--with` names further readings the quotation was chosen for. `unplace` withdraws one. Further readings can be named on a placement already made by adding their keys (the brief gives each after its number) to its `responds` list in `study-guides/outside/<slug>.json`, then running `check <slug> --offline`.
7. **Write the frame.** `set <slug> introduction "<one paragraph>"` and `set <slug> questions "<q1>" "<q2>" ...` (three to six). Both are written for these readings and their company; the guide's own, shown in the brief, are for the whole guide and are not reused.
8. **Check.** `node scripts/outside-guide.mjs check <slug>` validates the plan, reads every source page again, prints a summary and writes a page to look at (`reports/outside-guides/<slug>.html`). Open that page once in a browser (a screenshot will do) and read a section of it as a reader would. Then `check <slug> --publish` marks the plan published.
9. **Publish.** Run `node --test tests/study-guide-outside.test.mjs`. Commit `study-guides/outside/<slug>.json` alone, push, and open a pull request titled “Study guide with outside quotations: <guide's title>” with the summary that `check` printed as its body. Asking for this work is asking for that pull request. The owner merges it; the site then builds the page.

If the session runs short before the guide is finished, commit and push the draft as it stands (a draft changes nothing on the site) and say where it stopped; `brief <slug>` in a new session resumes it.

## Recording a quotation

```
node scripts/outside-guide.mjs show <url> "<a phrase>" ["<another>"]     # the page around each phrase; add --browser for sites that refuse plain requests
node scripts/outside-guide.mjs record <slug> <id> <url> --from "<first words>" --to "<last words>" \
  --author "…" --work "…" --locator "…" --year "…" --sort-year <n> --translator "…" --translation-year "…" \
  --tradition "…" --kind sacred|philosophy|literature|public|proverb --rights <status> --rights-note "…"
```

- `--from` and `--to` are a few words each, as they stand on the page; capitals, spacing and the style of quotation marks and dashes do not matter. Repeat the pair to leave something out: the parts are joined with “ … ”.
- `--verse` keeps a poem's lines. `--after "<marker>"` starts looking below a heading when the phrase also occurs earlier. `--strip '<regex>'` removes verse numbers or note marks. `--fix "page reading=>correct reading"` declares a scanning error. `--caveat` and `--currency` add a note on the text or on how well known it is. `--secondary` marks wording taken from a reference work that quotes the text, for use only where no text of the work can be reached, with a caveat saying so. A site the tool has not met needs `--label "<its name>"`.
- A `--strip` pattern is applied to the passage as the page has it, before its spacing is tidied; capitals do not matter. The check then applies it to the whole page in one line of lower case, so it has to fit both. Internet Archive scans (`…_djvu.txt`) separate words with two spaces and break lines anywhere: write `\s+` between words, never a single space. A running head or footnote inside a passage of a scan is removed with a pattern anchored on the words either side, for example `(?<=lead\s+me)\s*\*[\s\S]*?\.(?=\s+from\s+darkness)`.
- `--fix` is applied after the spacing is tidied and may be given several times. A word hyphenated at a line end is easier to declare with `--fix "your- selves=>yourselves"` than to strip. A space before `;`, `:`, `!` or `?` is removed by the tool and needs no fix; `--from` and `--to` still give the phrase as the page has it (`--to "Fairy Queen ?"`). Drop capitals at Wikisource put a space after the first letter (“S ome keep the Sabbath”): record from the page's reading (`--from "S ome keep"`) and repair it with `--fix "S ome=>Some"`. Read the wording that `record` prints: a broken word or a misread letter is recorded as it stands unless it is declared.
- Two sources are ready-made. `--kjv "Matthew 7:12"` (no address needed) is the King James Bible at Bible Gateway: give `--from`, `--to`, `--year`, `--sort-year` and `--tradition "New Testament"` or `"Hebrew Bible and Apocrypha"`. It takes a range too (`--kjv "Psalm 137:1-4"`); the verse numbers are removed. `--pickthall 49:13` is Pickthall's Qur’an at the Quranic Arabic Corpus and takes the whole verse; add `--from`/`--to` for part of it.
- `--pickthall` takes one verse only. For several consecutive verses of Pickthall, record from `https://tanzil.net/trans/en.pickthall`, one plain-text page of the whole translation whose lines are marked `20|25|`, with `--strip '\d+\|\d+\|' --label "Tanzil"` and the details that `--pickthall` supplies given by hand: `--work "Qur’an 20:25–28" --year "7th century" --sort-year 630 --translator "Marmaduke Pickthall" --translation-year 1930 --tradition "Qur’an and hadith" --kind sacred --rights public-domain --rights-note "Translation published 1930; translator d. 1936."`
- The id is short, lower case and hyphenated, and says who and what: `mill-minus-one`, `psalm-shepherd`, `quran-know-one-another`.
- `--year` is text and may be uncertain (“c. 200 CE”, “4th century BCE”); `--sort-year` is one whole number, negative before the common era.
- `--tradition` reuses the labels in use (the tool lists them when a new one appears): Hebrew Bible and Apocrypha; New Testament; Early Christian; Rabbinic and modern Judaism; Qur’an and hadith; Persian and Sufi poetry; Hindu scripture; Sikh scripture; Jain scripture; Buddhist texts; Chinese classics; Greek and Roman; European literature and thought; American literature and public life; Modern India; Africa; Indigenous North America; International declarations.
- `record` refuses a passage that the checker cannot find again on its page, so whatever is recorded is verifiable.

Rights, decided for each quotation and for its translation:

| `--rights` | when | limit |
|---|---|---|
| `public-domain` | author and translator died more than 70 years ago, or the text is an official public document | none |
| `public-domain-us` | published in the United States before 1931, the author or translator not yet 70 years dead | 60 words |
| `open-licence` | published under a Creative Commons or similar licence; the note names it | none |
| `in-copyright` | anything else | 60 words, and only where the passage matters |

The note says why in a few words (“Translator d. 1897.”, “Author d. 1968; three sentences.”).

Where to look: Wikisource, Project Gutenberg, the Internet Archive's full texts, Bible Gateway, the Quranic Arabic Corpus, Tanzil, Sefaria, New Advent, Access to Insight, sunnah.com (with `--browser`), and the publishing body's own site for declarations, speeches and court opinions. sacred-texts.com does not serve automated readers and ctext.org asks not to be scraped: use neither; the same translations are elsewhere.

- Finding a page: the tool does not search the web, and no helper for that is kept in the repository. These addresses answer a plain request, and `show` reads them like any page. Wikisource's search API refuses bursts; its search page does not: `https://en.wikisource.org/w/index.php?search=…&ns0=1&fulltext=1`, with an exact phrase in double quotes and `intitle:` to narrow. For a scanned book, `https://archive.org/advancedsearch.php?q=title:(…)&output=json` finds the scan (`+AND+mediatype:texts` in the query and `&fl[]=identifier&fl[]=title&fl[]=year` keep the answer short) and `https://archive.org/metadata/<identifier>/files` names its `…_djvu.txt` file, which is not always named for the identifier; record from `https://archive.org/stream/<identifier>/<file>`.
- Sources that have worked: `https://shakespeare.mit.edu/<play>/full.html` (needs `--label "The Complete Works of William Shakespeare (MIT)"`); `https://classics.mit.edu/<author>/<work>.mb.txt` (Legge's Analects, Rehatsek's Gulistan); `https://www.tertullian.org/fathers/` (Ramsay's Juvenal; needs `--label "The Tertullian Project"`); CCEL (Wesley's Journal); New Advent, whose text of the Confessions changes “Thou” to “You” (say so in a caveat); Sefaria by its API address, as in the Mishnah entries (`https://www.sefaria.org/api/texts/Mishnah_Berakhot.9.3?context=0&ven=Mishnah_Yomit_by_Dr._Joshua_Kulp`).
- Wikisource's page “Tâo Teh King” does not give Legge's wording (it has “The Tao that can be described”); the scan `in.ernet.dli.2015.499132` does, with “Tâo” misread, which `--fix` restores.
- Project Gutenberg was still answering HTTP 503 on the evening of 2026-11-16. While it does, look for the same book at Wikisource or among the Internet Archive's scans.

## Choosing and writing

The owner's rules: an outside quotation is chosen because it is widely known, because it says something close to the reading, or because it stands in contrast or as a complement to it, which is not the same as contradicting it. It is chosen against what the guide's quotations say, not against the guide's title.

- **alongside** (`adjacent`): the same idea or image in another voice. A parallel is rarely an equivalent: the note says whose voice it is and where its scope differs (a congregation, the believers, one nation).
- **in contrast** (`contrast`): a serious view that pulls the other way, set beside the reading so that both are seen more clearly. The note says what is at stake and usually ends in a question.
- **complement**: what the reading leaves unsaid, its other half or its limit. Usually ends in a question too.
- Roughly two in three stand alongside. A part with no contrast or complement at all has probably been read too kindly.
- The note (`--why`) is one to three plain sentences of at least twelve words. It names what in the reading the quotation answers. It may quote a few words of the reading. It does not praise, and it does not say more about the Bahá’í text than the reading shows.
- Prefer the best-known wording of a well-known text, and a passage of 15 to 80 words. Look beyond the Bible and the modern West when another tradition has as good a parallel; do not force one that has not.
- Never manufacture: no saying without a traceable source, however popular; no attribution, date or translator that the page does not support; no song lyrics. A well-known saying that had to be left out is listed in the plan's `leftOut` (`saying`, `attributed`, `reason`) so that the next session does not look for it again.
- An equal number is the aim. Where honest parallels run out, place fewer and say why with `set <slug> shortfall "<sentence>"`. Never pad.

The introduction is one paragraph that opens on the guide's own first move and names some of the company, close and contrary. The questions set readings and outside voices side by side; the last may gather the whole.

## Keeping the cost down

- If the environment refuses a source site or the published site (a network policy, not a fault of the page), say so and stop: the owner sets the network access.
- One guide, one session, one thing at a time. Do not start helper agents: seven of them, sent to locate sources in parallel, once used up the owner's allowance in half an hour and finished nothing.
- Use `show` with a phrase instead of reading whole pages, and `find` before any search of the web.
- Work in batches of about ten `record` and `place` commands to a shell call. The prayer guide (`generalprayers`), the first taken through these steps in one session, cost about 45 minutes of clock time for its 100 outside quotations: 94 newly recorded and 6 reused.
- Change only `study-guides/outside/<slug>.json`. Other guides' files are read, not edited, and the project's documents are not touched for a routine guide, so that pull requests from several sessions never collide.

## What the tools do with the guide

- A guide within the limit is kept whole (`whole`). A longer guide whose arc names sections, each a run of readings under one editor's note, gives each section its share of the 100 in proportion to its length (`proportional`); any other long guide is divided into ten equal stretches of its reading order and treated the same way (`stretches`). Within a part, readings wholly in authorized translation are taken first, in reading order. The plan records the rule and the readings it kept.
- If the guide is edited after its plan was written, nothing breaks: the site builds the page from the readings that remain, and `brief`, the build and the tests say that the plan needs review. `brief <slug> --recut` applies the rule again and keeps every placement whose reading is still kept.
- `node scripts/verify-outside-quotations.mjs [--guide <slug>] [--write]` reads source pages again at any time and reports wording that is no longer found.
