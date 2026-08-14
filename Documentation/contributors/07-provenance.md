# Provenance

kala is a greenfield product that harvests proven material from three prior projects rather
than re-deriving it. This page records what came from where, and the licensing that follows
from it.

A greenfield product that harvests proven material from three prior projects rather than
re-deriving it.

| Project | License | What was taken |
|---|---|---|
| [impeccable](https://github.com/pbakaus/impeccable) | Apache-2.0 | Detector heuristics and thresholds for 5 rules; the inline-waiver design |
| [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | MIT | Surface and guidance material; the persisted-design-system pattern; 350 rows (`styles.csv`/`colors.csv`/`typography.csv`) reshaped into the catalog fallback tier |
| [design-motion-principles](https://github.com/kylezantos/design-motion-principles) | MIT | The frequency gate, and the motion guidance in the `animate` playbook |

Rules carrying a `source` also carry `modified: true`, and a test enforces that pairing.
Detection logic was re-expressed as declarative assertions over the IR, replacing the
original regular expressions.

### The licensing files, and why there are four

| File | Required by | Purpose |
|---|---|---|
| `LICENSE` | — | **This project's own licence**: Apache-2.0, copyright 2026 archish9 |
| `LICENSES/Apache-2.0.txt` | Apache-2.0 §4(a) | Verbatim copy of impeccable's incoming licence |
| `LICENSES/MIT.txt` | MIT terms | Copyright and permission notice for the two MIT sources |
| `NOTICE` | Apache-2.0 §4(b), §4(d) | States that files were modified, and carries attribution forward |
| `ATTRIBUTION.md` | nothing | Ours: a human-readable table of what came from where |

Incoming licences cannot be merged or summarised — each must be reproduced unchanged — so
there is one file per licence.

Apache-2.0 was chosen for the project itself because it is the most restrictive licence
already binding it. MIT material can be redistributed under Apache-2.0; the reverse is not
true.

Apache-2.0 §6 grants no trademark rights. This project is not affiliated with, endorsed by,
or branded as any of the above. Full detail in [NOTICE](../../NOTICE) and
[ATTRIBUTION.md](../../ATTRIBUTION.md).

**Deliberately not carried over:** the three designer names from
`design-motion-principles`. That project states its subjects neither authored nor endorsed
it; carrying the names into a different product would imply an endorsement that does not
exist. The principles are retained through the `motion` field of design systems.

