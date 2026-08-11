# Attribution

Per-pack provenance. Rule-level provenance lives in the `source` and `modified`
fields of each rule JSON under `packages/packs/rules/`.

| Ours | Upstream | License | What changed |
|---|---|---|---|
| `rules/scale/space-off-scale.json` | impeccable `cramped-padding` | Apache-2.0 | Regex detection replaced by an IR assertion against the project scale |
| `rules/a11y/tiny-text.json` | impeccable `tiny-text` | Apache-2.0 | Threshold kept; detection re-expressed as an IR assertion |
| `rules/craft/nested-card.json` | impeccable `nested-cards` | Apache-2.0 | Rewritten as a predicate over IR parent links |
| `rules/craft/monotonous-spacing.json` | impeccable `monotonous-spacing` | Apache-2.0 | Rewritten as an aggregate rule with a minimum sample size |
| `rules/craft/flat-type-hierarchy.json` | impeccable `flat-type-hierarchy` | Apache-2.0 | Rewritten as a surface-scoped aggregate rule |

## Deliberately not carried over

The three designer names from design-motion-principles are omitted. That project
states its subjects neither authored nor endorsed it; carrying the names into a
different product would imply an endorsement that does not exist. The motion
principles themselves are retained, expressed through the `motion` field of
design systems in Phase 2.
