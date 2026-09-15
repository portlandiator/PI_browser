---
name: partial-inventory-reader
description: Maintain the Partial Inventory browser, including its bilingual reading layout, static corpus importer, metadata filters, and Persian/Arabic phrase search. Use for work in this project.
---

# Partial Inventory reader

Read [DESIGN.md](DESIGN.md) for the visual system. This project adapts the typography, contrast, and layout review principles of [gpt-tasteskill](https://github.com/Leonxlnx/taste-skill/blob/main/skills/gpt-tasteskill/SKILL.md) to a research reader. Marketing heroes, motion-heavy galleries, and randomized layouts are inappropriate to sustained reading.

## Corpus work

Inspect build-report.json after import. The supplied CSVs use Windows-1252; text files are predominantly UTF-8 with some Windows-1252 translations. Strictly attempt UTF-8 before a Windows-1252 fallback and report every fallback. Parse quoted, multiline CSV values correctly. Preserve missing fields and ambiguous dates as supplied.

File basenames are the IDs. Join metadata by the full ID. Include the union of source and metadata IDs. Missing counterparts and differing paragraph counts are data conditions to present honestly. Never infer paragraph correspondence by splitting prose at sentence boundaries.

Use the shared text parser for both indexing and display. Render nested footnotes, italics, quote macros, and transliteration accents safely. Preserve unknown commands visibly. Footnote references need unique language-specific IDs and return links.

## Search work

Use the same normalization in the builder and browser worker: Unicode decomposition, diacritic removal, Arabic/Persian yeh and kaf folding, digit folding, and zero-width spacing. Preserve the original document spelling. Exact words and quoted phrases must match whole tokens; phrases must respect token order and paragraph boundaries. Search terms must occur in the same language version, avoiding matches assembled from different translations.

Keep search in a worker. Fetch only relevant compressed index shards and displayed records. Test with English and original-language fixtures, punctuation, combining marks, missing versions, phrases spanning paragraph breaks, and repeated words.

## Reading experience

English appears first in DOM order and on the left in desktop parallel mode. Original paragraphs have explicit RTL direction. Mobile pairs remain consecutive. Unequal paragraph counts require independent flows and a notice; do not present them as aligned rows. Provide single-language modes and adjustable text size without hiding access to the other version.

Use warm paper backgrounds, dark green navigation, thin rules, readable serif text, and restrained sans-serif controls. Ensure keyboard focus, contrast, reduced motion, useful error states, and accessible form labels. Validate using actual long texts and actual footnotes, not only short invented examples.
