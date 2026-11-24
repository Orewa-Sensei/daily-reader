# The Daily Reader

A personal literary journal that presents one essay, one short story, and one article in each daily edition.

## Discovery model

The app uses live discovery by default and a rolling reserve for offline use.

- **Project Gutenberg via Gutendex:** live catalogue metadata and plain-text files for selected English-language original works. The app currently restricts this feed to an explicit author allowlist and conservative subject/title classification; it does not assume that every English edition is an English original.
- **OpenAlex:** live discovery of English-language open-access humanities research articles. Open-access status is not treated as a blanket reproduction licence; articles open at their source.
- **Curated catalogue:** verified individual works and translations with explicit original language, display language, and named translator metadata.

Every daily edition has three distinct slots: essay, short story, and article. Candidate selection excludes reading history, saved works, previously displayed works, the current edition, and all works in the reserve. A title/author fingerprint supplements source IDs to reduce duplicate editions across different catalogue records.

## Language policy

- English originals are presented in English.
- Hindi originals may be presented in Hindi, and only when explicitly marked as Hindi originals.
- Other non-English originals are eligible only when a published English translation and a named translator are recorded.
- Unknown or vague translation credits (for example, “various translators”) fail the eligibility gate.
- Machine-generated translations are not treated as published translations.

The policy is enforced in `recommendation-engine.js`, not merely displayed as a label.

## Five-day reserve and offline behaviour

The reserve stores up to five complete editions (15 distinct works) in local storage. It is replenished whenever the app is online and source APIs return enough eligible candidates. The queue validator rejects malformed editions, incorrect slot order, invalid language metadata, and cross-day duplicate IDs.

Plain-text works are cached in IndexedDB separately from reading history. Reading history stores metadata only, preventing large texts from exhausting local storage. Contemporary/open-access articles are linked to their source and are not copied into the offline text store.

If discovery returns fewer than five days, the app keeps the smaller valid reserve and reports the actual count; it does not fabricate readings to fill the quota.

## Source and editorial limitations

Live discovery is intentionally conservative. The Gutenberg adapter currently recognises a defined set of English-language authors and uses catalogue subjects to distinguish essays from short stories. OpenAlex provides scholarly article records, not a complete feed of literary magazines. Hindi originals and translated works outside the curated catalogue require source-level verification before they can enter the pool.

The app does not invent summaries, biographies, publication years, or translator credits. Unverified metadata is labelled as such or omitted.

## Development

No build step or third-party JavaScript package is required for the PWA.

```bash
npm test
```

Regression tests cover the language gate, three-slot edition selection, five-day queue integrity, deduplication, and exclusion of read/reserved works.

## Files

- `app.js` — reader UI, history, edition lifecycle, and reserve orchestration
- `discovery.js` — live source adapters, candidate validation, queue, and IndexedDB text cache
- `recommendation-engine.js` — strict language gate and diversity-aware selector
- `catalogue.js` — curated, source-linked catalogue entries
- `sw.js` — PWA shell cache
- `tests/reader.test.cjs` — regression tests
