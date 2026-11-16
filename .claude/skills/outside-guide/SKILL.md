---
name: outside-guide
description: Give one study guide its quotations from beyond the Bahá’í writings and open a pull request for it, following OUTSIDE.md. Use when the owner asks to do the next study guide, names a guide to be read with outside quotations, or types /outside-guide with or without a guide's slug.
---

# One study guide with outside quotations

Guide asked for: $ARGUMENTS

1. Read `OUTSIDE.md` in the repository root, all of it. It is the method; follow it step by step.
2. Work on one guide only: the one named above (its slug, as in `study-guides/outside/<slug>.json`, or its title), or, when none is named, the first that `node scripts/outside-guide.mjs status` lists and that no open pull request already covers.
3. Do the work in this session, one step at a time, without helper agents.
4. Finish with the pull request that OUTSIDE.md describes, and tell the owner in a few lines what the guide now holds, what you left out and why, and anything they should look at before merging.
