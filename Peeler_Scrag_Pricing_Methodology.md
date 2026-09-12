# Peeler & Scrag Pricing — Implementation Notes

This document explains how weight-priced products (peeler and scrag logs) were added
alongside the existing AHMI sawlog grading model in the bucking trainer. It covers the
data model, the pricing math, species handling, the UI, and how these products were
wired into the DP optimal solver — plus known limitations and a testing caveat that
should be reverted before any real deployment.

---

## Why a Separate Pricing Path

The AHMI sawlog matrix (`getGradeAndPrice` in `script.js`) prices a log by **grade ×
Doyle board feet**. Peeler and scrag logs are not graded or sold that way in the WV
northern-hardwood market — they are bought and sold **by the green ton**, based on
species and small-end diameter (SED) eligibility, not clear-face count. Reusing the
Doyle/grade pipeline for these products would be both wrong (Doyle deliberately
underscales small/low-grade logs, which is exactly the wood these products are made
from) and misleading (there's no "grade" to assign).

So peeler and scrag get their own valuation path — `scoreAsProduct()` — that computes
real cubic volume and converts it to weight, rather than reusing the BF/grade pipeline.

---

## Data Model

All of the following live near the top of `script.js`, next to the existing `PRICES` table:

### `PRODUCT_SPECS`

One entry per weight-priced product, holding price and eligibility rules:

```js
const PRODUCT_SPECS = {
    peeler: {
        label: 'Peeler',
        pricePerTon: 500,           // see "Testing Value" section below
        eligibleSpecies: ['YELLOW_POPLAR'],
        minSED: 12, maxSED: null,
        notes: 'Yellow-poplar only. Straight & round, pith centered, no sweep/rot/splits, min SED 12"-14".'
    },
    scrag: {
        label: 'Scrag',
        pricePerTon: 30,
        eligibleSpecies: null,      // any species — mixed-hardwood market
        minSED: 6, maxSED: 14,
        notes: '#3/pallet grade. Sound wood only (no rot/metal); knots & moderate sweep tolerated.'
    }
};
```

These figures come from the WV northern-hardwood market spec provided for this feature
(yellow-poplar dominates the peeler market; scrag is the mixed-hardwood #3/pallet
market — red oak, hard maple, cherry, birch, beech, hickory, poplar culls).

### `SPECIES_DENSITY`

Green wood density (lb/ft³) by canonical species, used to convert a log's cubic volume
to weight. Based on USDA Forest Products Lab Wood Handbook green-weight figures.
Yellow-poplar (38 lb/ft³) is notably higher than its oven-dry weight (~26-28 lb/ft³)
because the species carries very high moisture content when green — an early version
of this table used the dry figure by mistake, which under-priced every peeler log by
about 30%.

### `SPECIES_CODE_MAP` / `normalizeSpecies()` / `displaySpeciesName()`

The stem datasets are inconsistent about species representation — `trees.json` uses
full uppercase names (`"YELLOW POPLAR"`), while `Millstudy_Stems.json` uses short codes
(`"YP"`, `"RO"`, `"SM"`, ...). Neither the density table nor the eligibility rules can
key off either format directly, so `SPECIES_CODE_MAP` maps every known code and full
name to one canonical key (e.g. `YELLOW_POPLAR`). `normalizeSpecies(raw)` performs the
lookup; `displaySpeciesName(raw)` does the same lookup but returns a friendly label
(`"Yellow Poplar"`) for anywhere a species is shown in the UI — this also fixed a
cosmetic bug where the stem header displayed raw codes as `"Yp"` instead of a real name.

### `cubicVolumeFt3()` and `scoreAsProduct()`

- `cubicVolumeFt3(buttDiaIn, topDiaIn, lengthFt)` applies Smalian's formula (average of
  butt/top cross-sectional area, times length) to get true cubic volume. This is
  deliberately **not** the Doyle formula — Doyle bakes in a lumber-recovery discount
  that has nothing to do with a log's actual mass.
- `scoreAsProduct(product, buttDiaIn, topDiaIn, lengthFt, species)`:
  1. Normalizes `species` and checks it against `PRODUCT_SPECS[product].eligibleSpecies`.
     If the species isn't allowed (e.g. Red Oak offered as Peeler), it returns
     `{ value: 0, ineligible: true, reason: "<species> is not accepted as <product>..." }`
     instead of throwing — a mismatched product choice just teaches a $0 lesson.
  2. Checks the segment's small-end diameter against `minSED`/`maxSED`. Out-of-range
     diameter also returns an ineligible $0 result with a reason string.
  3. Otherwise: `tons = cubicVolumeFt3(...) * density / 2000`, `value = tons * pricePerTon`.

---

## Wiring Into Segment Scoring

`scoreSegment(startFt, endFt, defects, product = 'sawlog')` gained a `product`
parameter. The nominal-length selection (which standard length fits the physical cut)
is unchanged and shared across all three products — only what happens *after* a valid
nominal length is found differs:

- `product === 'sawlog'` (default): unchanged — Doyle volume × AHMI grade price.
- `product === 'peeler'` or `'scrag'`: computes butt/small-end diameter at the cut,
  calls `scoreAsProduct()`, and returns that result instead. `volumeBF` is `null` on
  these segments (there is no board-foot figure — display code checks for this).

`scoreSegments(cutList, defects, productOverrides = [])` takes a per-segment-index
array of product choices and threads them through to `scoreSegment`.

---

## User-Facing Bucking (Manual Cuts)

Each piece box (rendered by `updateSegments()`) shows three radio buttons — **Sawlog /
Peeler / Scrag** — ahead of the piece's length/diameter detail, left-justified in one
row. The selection is held in a module-level `pieceProduct[]` array, indexed by piece
position.

`pieceProduct` is reset (to `[]`) any time the cut list changes shape — adding a cut,
removing a cut, loading a new stem, or hitting Reset — because inserting or removing a
cut shifts every later piece's index, and a stale array would silently mis-attribute a
product choice to the wrong physical piece. A drag that repositions an existing cut
(without changing the cut *count*) does not reset it.

Clicking **Score This Stem** passes `pieceProduct` into `scoreSegments(cuts,
currentDefects, pieceProduct)`, so "Your Value" reflects whatever product each piece
was assigned. The results panel:

- Shows `tons` instead of `bf` / clear-face count for any segment priced as a
  weight product (both in the narrative explanation and in the Log-by-log
  "Your Bucking" / "Optimal Bucking" cards).
- Surfaces the ineligibility reason directly (e.g. *"Red Oak is not accepted as
  Peeler in this market."*) rather than just showing $0 with no explanation.

---

## Wiring Into the DP Optimal Solver

`computeOptimal()` originally only ever scored candidate segments as sawlogs. It now
evaluates **all three products** for every candidate `(startFt, nomLen)` pair and keeps
whichever is worth the most — the same mechanism it already used to pick the best
*length* is now also used to pick the best *product*:

```js
const sawSeg = scoreSegment(startFt, endFt, currentDefects, 'sawlog');
if (sawSeg.nomLen === 0) continue;
let bestProduct = 'sawlog';
let bestValue   = sawSeg.value;
for (const product of ['peeler', 'scrag']) {
    const altSeg = scoreSegment(startFt, endFt, currentDefects, product);
    if (!altSeg.gradeInfo.ineligible && altSeg.value > bestValue) {
        bestValue = altSeg.value;
        bestProduct = product;
    }
}
```

The DP's backtracking array (`choiceProduct`, parallel to the existing `choice` array)
records which product won at each retained cut, so the reconstructed solution returns
`{ optCuts, optValue, optProducts }`. The "Score This Stem" handler passes
`optProducts` into `scoreSegments()` for the optimal side, so the displayed optimal
plan — and its dollar total — genuinely reflects the best achievable mix of sawlog,
peeler, and scrag pieces, not a sawlog-only ceiling.

**Scope note:** the DP explores standard sawlog lengths (8/10/12/14/16 ft) at every
candidate position and evaluates all three products against each resulting piece. It
does *not* separately search peeler-specific lengths (8'6", 10'6") or scrag-specific
lengths — those markets' preferred lengths aren't yet part of the candidate-length set.
A future refinement could add product-specific candidate lengths if that distinction
matters for training purposes.

---

## ⚠️ Testing Value — Revert Before Real Use

`PRODUCT_SPECS.peeler.pricePerTon` is currently set to **500**, not the real WV market
average of **~$107/ton** ($85–$130 range per KDF/WVU Appalachian Hardwood Center data).

At the real price, a single piece's peeler value (a few tenths of a ton) essentially
never outweighs even a mediocre sawlog grade, so the DP would never select it and the
feature would be effectively invisible to a user testing/exercising the bucking tool.
The price was inflated so peeler selections actually show up in both manual scoring
and the DP optimal solution during development/testing.

This is flagged in two places so it isn't missed:
- A code comment directly above `pricePerTon: 500` in `script.js`.
- A red "TESTING VALUE" note in the in-app Grading Reference panel
  (`index.html`, Weight-Priced Products table), next to the real $85–$130/ton range.

**Before any real deployment, `pricePerTon` for peeler should be reset to ~107** (or
whatever current market data supports), and it's worth re-checking how often peeler
gets selected by the DP at that realistic price — it may rarely or never win, which is
the economically correct behavior, not a bug.

---

## Known Limitations

- **Density figures are approximate.** `SPECIES_DENSITY` values are calibrated against
  general USDA Wood Handbook green-weight figures, not a species-by-species
  cross-check. Only yellow-poplar, red oak, and hard maple were explicitly given in
  the sourcing spec for this feature; the rest were extrapolated and should be
  verified before being treated as production-grade numbers.
- **No product-specific length preferences in the DP.** As noted above, the solver
  reuses the sawlog standard-length set (8–16 ft) for every product rather than
  searching peeler's 8'6"/10'6" veneer-block lengths or scrag's 8–12 ft range
  directly.
- **Single flat price per product**, not a species- or size-tiered price (e.g. real
  peeler pricing varies with SED — 16"+ logs command more than 12" logs). The current
  model uses one `pricePerTon` regardless of size within the eligible SED range.
- **Manual "Your Bucking" product choice does not affect what the DP considers.** The
  per-piece radio buttons only affect the user's own scored value; the DP always
  searches its own product choice independently for its "Optimal" comparison. This is
  intentional — the DP is meant to represent the true achievable optimum regardless of
  what the user picked — but it means a user cannot "lock in" scrag for a piece and see
  the DP respect that constraint.

---

## Files Touched

| File | Change |
|---|---|
| `script.js` | Added `PRODUCT_SPECS`, `SPECIES_DENSITY`, `SPECIES_DISPLAY_NAME`, `SPECIES_CODE_MAP`, `normalizeSpecies()`, `displaySpeciesName()`, `cubicVolumeFt3()`, `scoreAsProduct()`. Extended `scoreSegment()`/`scoreSegments()` with a `product`/`productOverrides` parameter. Added `pieceProduct[]` state, `setPieceProduct()`, and radio-button rendering in `updateSegments()`. Extended `computeOptimal()` to evaluate and backtrack through all three products (`choiceProduct`, `optProducts`). Added `COLORS.defect.millDefect` (pink) so mill-projected defects are visually distinct from real seam/quality defects. Updated the results panel to show tons instead of bf/clear-faces for weight-priced segments. |
| `index.html` | Added a "Weight-Priced Products" table to the Grading Reference panel describing peeler/scrag price, eligible species, min SED, and quality requirements, including the testing-value caveat. |
