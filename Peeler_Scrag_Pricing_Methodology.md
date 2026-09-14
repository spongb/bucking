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
        eligibleSpecies: ['YELLOW_POPLAR', 'CUCUMBER', 'MAGNOLIA', 'ASPEN',
          'BASSWOOD', 'BUCKEYE', 'SWEETGUM', 'SYCAMORE'],
        minSED: 8, maxSED: 24,
        notes: 'Columbia accepted species; minimum SED 8" inside bark and maximum scaling diameter 24" inside bark.'
    },
    scrag: {
        label: 'Scrag',
        pricePerTon: 30,
      eligibleSpecies: null,      // mixed hardwood, with field-spec exclusions
      excludedSpecies: ['PINE', 'SPRUCE', 'FIR', 'BASSWOOD'],
      minSED: 6, maxSED: 15,
      rejectDefectTypes: ['rot', 'end_check'],
      notes: '#3/pallet grade. No pine, spruce, fir, or basswood; 6"-15" diameter range; no rot, splits, or banana-shaped sweep.'
    }
};
```

The peeler eligibility also incorporates the Columbia Forest Products sheet provided
for this project (revised 08/06/2013): accepted species are poplar, cucumber,
magnolia, aspen, basswood, buckeye, sweetgum, and sycamore; minimum SED is 8" inside
bark; maximum scaling diameter is 24" inside bark; and specified lengths are 8'10"
and 17'6". The sheet's grade-specific defect limits and MBF price columns are not
fully represented by the current single weight-priced product model.

The scrag figures come from the WV northern-hardwood market spec provided for this
feature (scrag is the mixed-hardwood #3/pallet market). The scrag field notes exclude
pine, spruce, fir, and basswood, accept a 6"-15" small-end diameter range, and favor
lengths that are multiples of 7 or 8 feet.

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

### `PEELER_LENGTHS_FT`

Peeler logs in the Columbia sheet are specified at 8'10" and 17'6", not the prior
prior 10.5'/9.5'/8.5' assumptions. This constant holds those lengths, longest first, so
length selection prefers the longest bolt that fits.

Critically, **these lengths already include the mill's trim allowance** — unlike
sawlog lengths, `scoreSegment()` does not subtract the trim input from a peeler
candidate's physical length before matching it against `PEELER_LENGTHS_FT` (see
"Wiring Into Segment Scoring" below). Adding trim on top of these figures would
double-count it.

### `cubicVolumeFt3()` and `scoreAsProduct()`

- `cubicVolumeFt3(buttDiaIn, topDiaIn, lengthFt)` applies Smalian's formula (average of
  butt/top cross-sectional area, times length) to get true cubic volume. This is
  deliberately **not** the Doyle formula — Doyle bakes in a lumber-recovery discount
  that has nothing to do with a log's actual mass.
- Yellow Poplar peelers use the Columbia Forest Products regression supplied for this
  project instead of green density:
  `WeightLb = -744.5 - 40.1*Dia + 5.23*Dia^2 + 87.5*Length - 353.4*Butt + 32.1*(Butt*Dia)`.
  `Dia` is the current small-end diameter in inches, `Length` is feet, and `Butt` is
  1 for the first butt log and 0 for an upper log. The equation is reported as
  significant at p < 0.0001 with R^2 = 90.8%.
- `scoreAsProduct(product, buttDiaIn, topDiaIn, lengthFt, species)`:
  1. Normalizes `species` and checks it against `PRODUCT_SPECS[product].eligibleSpecies`.
     If the species isn't allowed (e.g. Red Oak offered as Peeler), it returns
     `{ value: 0, ineligible: true, reason: "<species> is not accepted as <product>..." }`
     instead of throwing — a mismatched product choice just teaches a $0 lesson.
  2. Checks the segment's small-end diameter against `minSED`/`maxSED`. Out-of-range
     diameter also returns an ineligible $0 result with a reason string.
    3. Otherwise: Yellow Poplar peelers use the regression weight; other products use
      `tons = cubicVolumeFt3(...) * density / 2000`; `value = tons * pricePerTon`.

---

## Wiring Into Segment Scoring

`scoreSegment(startFt, endFt, defects, product = 'sawlog')` gained a `product`
parameter. Nominal-length selection (which standard length fits the physical cut) is
now **product-aware**:

- `product === 'sawlog'` (default): matches against the sawlog standard-length ladder
  (16/14/12/10/8 ft) after subtracting the trim input.
- `product === 'scrag'`: matches against 16/14/8/7 ft after subtracting the trim input.
- `product === 'peeler'`: matches against `PEELER_LENGTHS_FT` (8'10"/17'6")
  instead, and **skips the trim subtraction entirely** (`trim = 0`) — those lengths
  already have trim baked in, per the market spec.

Pricing differs the same way as before: `product === 'sawlog'` uses Doyle volume ×
AHMI grade price; `'peeler'`/`'scrag'` compute butt/small-end diameter at the cut,
call `scoreAsProduct()`, and return that result instead. `volumeBF` is `null` on
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

`computeOptimal()` originally only ever scored candidate segments as sawlogs, using a
single candidate-length list (8/10/12/14/16 ft, each with the trim allowance added).
It now does two things:

1. **Builds its candidate cut list from both length sets.** Each candidate carries
   whether trim applies to it:

   ```js
   const candidateLengths = [
       ...[8, 10, 12, 14, 16].map(len => ({ len, includeTrim: true })),   // sawlog
       ...PEELER_LENGTHS_FT.map(len => ({ len, includeTrim: false })),    // peeler
   ];
   ```

   For each `{ len, includeTrim }`, the candidate end position is
   `startFt + len + (includeTrim ? trim : 0) + ecDeduction` — so a peeler-length
   candidate's physical span is exactly `len` (plus any end-check deduction), with no
   trim added on top.

2. **Evaluates all three products against whichever physical segment each candidate
   produces**, and keeps whichever is worth the most:

   ```js
   let bestProduct = null;
   let bestValue   = -1;
   for (const product of ['sawlog', 'peeler', 'scrag']) {
       const seg = scoreSegment(startFt, endFt, currentDefects, product);
       if (seg.nomLen === 0 || seg.gradeInfo.ineligible) continue;
       if (seg.value > bestValue) { bestValue = seg.value; bestProduct = product; }
   }
   if (bestProduct === null) continue;
   ```

   This checks all three products (not just an already-viable sawlog result) because
   a candidate built from a peeler length very often resolves to `nomLen === 0` when
   scored as a sawlog (its physical span rarely lines up with a valid sawlog length
   once trim is subtracted), and vice versa. The first implementation of this
   evaluation loop only fell through to peeler/scrag when the *sawlog* scoring had
   already succeeded — which meant every peeler-length candidate was silently
   discarded before peeler-specific lengths existed to expose the bug.

The DP's backtracking array (`choiceProduct`, parallel to the existing `choice` array)
records which product won at each retained cut, so the reconstructed solution returns
`{ optCuts, optValue, optProducts }`. The "Score This Stem" handler passes
`optProducts` into `scoreSegments()` for the optimal side, so the displayed optimal
plan — and its dollar total — genuinely reflects the best achievable mix of sawlog,
peeler, and scrag pieces, including peeler-length-specific cuts, not a sawlog-only
ceiling.

Scrag now has its own 7/8-foot-multiple candidate lengths in the DP, alongside the
peeler-specific candidates.

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
| `script.js` | Added `PRODUCT_SPECS`, `PEELER_LENGTHS_FT`, `SPECIES_DENSITY`, `SPECIES_DISPLAY_NAME`, `SPECIES_CODE_MAP`, `normalizeSpecies()`, `displaySpeciesName()`, `cubicVolumeFt3()`, `scoreAsProduct()`. Extended `scoreSegment()`/`scoreSegments()` with a `product`/`productOverrides` parameter, including product-specific length matching and trim handling for peeler. Added `pieceProduct[]` state, `setPieceProduct()`, and radio-button rendering in `updateSegments()`. Extended `computeOptimal()` to build its candidate cut list from both sawlog and peeler length sets and to evaluate/backtrack through all three products (`choiceProduct`, `optProducts`). Added `COLORS.defect.millDefect` (pink) so mill-projected defects are visually distinct from real seam/quality defects. Updated the results panel to show tons instead of bf/clear-faces for weight-priced segments. |
| `index.html` | Added a "Weight-Priced Products" table to the Grading Reference panel describing peeler/scrag price, eligible species, min SED, and quality requirements, including the testing-value caveat. |
