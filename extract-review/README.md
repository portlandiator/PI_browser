# Extract review

Each CSV includes every retained selection from that source without an accepted paragraph mapping, including outside-author quotations. The Inventory review CSV includes an **extract** column from item metadata, joined by Supplied ID to PIN. Blank values mean no metadata extract is available for that ID. Fill in **Assign ID**, **Assign paragraph** (one-based, as in the Catalog reader), and **Notes**. Leave outside-catalogue quotations blank. Candidate scores are lexical coverage, not probabilities. Original files are unchanged. Duplicates removed from these queues remain recorded in input-report.json and the retained selection provenance.

For exact highlight selection, use the website’s Passage review utility and export its decisions. CSV assignments can be returned for incorporation with paragraph/range validation.

The September 2026 Evernote decisions preserve exclusions and notes across rebuilds. Evernote_scrape-resolved.csv lists the 174 newly matched rows with IDs, paragraph numbers, and evidence. Reference leads on unresolved rows are suggestions, not accepted mappings.
