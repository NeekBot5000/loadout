# Catalog audit

Builds `catalog/catalog.json` and `docs/catalog-audit.md`. Nothing from a repo is extracted or run;
archives are read as data.

```
node tools/catalog-audit/audit.mjs tools/catalog-audit/shortlist.json <work-dir> 8
node tools/catalog-audit/build-catalog.mjs <work-dir>/results.json
```

- `engine/src/rules.js` flags lines for a person to read. A hit is not a verdict.
- `decisions.mjs` holds the verdicts: repos and skills left out, and repos whose high-risk hits were
  read by hand and cleared. Re-read new hits before adding a repo to `CLEARED_HIGH`.
- Community entries are pinned to the audited commit (`ref`). To take an update, re-run the audit,
  read what changed, then rebuild.
