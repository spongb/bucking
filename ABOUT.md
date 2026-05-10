# Bucking Trainer — Project Overview

A browser-based interactive log bucking training tool built for WVU Forestry education. Users practice cutting a hardwood stem into value-maximizing log segments, scored against the AHMI (Appalachian Hardwood Manufacturers, Inc.) sawlog grading matrix. After each stem the game reveals a dynamic-programming optimum and explains exactly how each cut decision — and each defect interaction — affected the final grade and value. The goal is to build intuition for the relationship between log length, scaling diameter, defect placement, and grade yield.

---

## Background and Purpose

In the timber supply chain, there is a clear division of responsibility:

1.  **The Logger's Role:** At the landing, the logger assesses a tree stem based on its external characteristics: length, diameter, taper, sweep, and visible defects (knots, seams, rot). Their goal is to buck the stem into a set of logs that will yield the highest possible price from the mill. They are paid based on the grade and volume of the *delivered logs*.

2.  **The Mill's Role:** The mill takes the delivered logs and processes them into finished products, like lumber. The price they offer for logs of a certain grade is a **proxy** for the value they expect to recover from it. For example, a high-grade "Prime" log is expected to yield a high volume of valuable clear lumber, so the mill pays a premium for it.

This trainer focuses exclusively on the **logger's decision-making problem**. It challenges the user to make the best cuts based on external signs to maximize the value of the delivered logs, according to a standard mill-provided price list.

---

## How It Works

### User Workflow

1. A stem is loaded from the dataset (real or synthetic) and displayed on a canvas. Species, total length, butt diameter, and top diameter are shown above the canvas.
2. The user clicks on the stem canvas to place cut marks. Each click snaps to the nearest 0.5-ft increment and adds a vertical cut line.
3. Right-clicking a cut line removes it. The user may rotate the stem (keyboard or button) to inspect all four faces before committing cuts.
4. When satisfied, the user clicks **Score Log**. The game evaluates each resulting segment using the AHMI grading matrix, displays grade, board feet (Doyle rule), and dollar value per segment, and sums a total value.
5. The optimal solution is revealed: the game shows the DP-computed best set of cuts, the maximum achievable value, and a natural-language explanation of where the user's cuts diverged from optimal and why.
6. The user proceeds through five stems per session and receives a cumulative score.

### Log Diagram Features

**Main canvas (log profile):** Draws a tapered trapezoid representing the stem in side view. Defects are rendered as colored bands at their precise start/end foot positions. The butt is on the left, top on the right. Cut lines appear as vertical lines with foot-position labels. Hover over any position to see a tooltip with the scaling diameter at that point (interpolated linearly between butt and top) and the foot position. The canvas resizes responsively to the browser window.

**Face defect map (face canvas):** A four-lane horizontal strip below the main canvas. Each lane represents one face (F1–F4), and defect blocks are drawn in the lane(s) of every face they affect. Rotating the log cycles which face is displayed on top — the lane labels shift to reflect the new orientation (triangle markers indicate Top, Right, Bottom, Left). This lets the user examine each face individually and plan cuts to keep defect-free faces intact.

**Rotation:** The stem can be rotated 90° per step using the Rotate button or a keyboard shortcut. Rotation affects only the face map display — the main profile view is face-agnostic.

**Right-click to remove cut:** Right-clicking directly on an existing cut line removes it without affecting other cuts.

**Labels:** Each cut line is labeled with its foot position. After scoring, each segment is annotated with its grade, Doyle board footage, and dollar value.

**Face orientation indicator:** A small legend in the face map header shows which face index is currently on top, disambiguating the four lanes as the user rotates.

---

## Grading Model

### AHMI Hardwood Sawlog Matrix

Grade is determined by two factors:

1. **Small-end scaling diameter (SED)** — computed via the Doyle rule from the log's small-end diameter, itself interpolated from the stem's linear taper at the cut position.
2. **Number of clear faces** — the count of the log's four faces that are free of disqualifying defects anywhere along the log's length. A face is "blocked" if any defect with `facesAffected` containing that face index runs through any portion of the log segment.

The matrix maps (SED, clear faces) to a lumber grade:

| Clear Faces | SED (Doyle, bf) |
|---|---|
| 4 | Prime |
| 3 | Select+ / Select |
| 2 | No. 1+ / No. 1 |
| 1 | No. 2+ / No. 2 |
| 0 | No. 3 |

(Exact grade thresholds within each face count are resolved by SED tier.)

### Standard Log Lengths

Valid log lengths are **8, 10, 12, 14, and 16 feet**. The game enforces these standard lengths — the user places cut marks and the game selects the largest valid length that fits within each cut interval.

### Trim Allowance

A trim allowance (default 4 inches, user-configurable) is subtracted from each segment before scoring. A 16-foot log cut with 4" trim is scored as a 15'8" log, for example. The DP solver incorporates trim internally.

### Prices

Dollar value per board foot is loaded from `prices.json` at startup and falls back to hardcoded defaults if the file is unavailable. Prices are keyed to grade names (Prime, Select+, Select, No. 1+, No. 1, No. 2+, No. 2, No. 3). `prices.json` is plain JSON and can be edited freely.

### Defect Types

**knot_cluster** — A tight group of knots on one or two faces. Assessed as a face penalty: each face listed in `facesAffected` is blocked for any log that contains the defect. Placed preferentially in the upper (top-end) portion of the stem, reflecting the natural crown-knot distribution of hardwoods.

**seam** — A longitudinal shake, wind shake, or internal crack running along the stem face. Assessed as a face penalty on 1–2 faces. Can occur anywhere on the stem. Common in ash (shake) and cherry (pitch seams).

**sweep** — A gradual arc or bow in the stem, measured by its maximum deviation in inches (`widthIn`). Rather than a face penalty, sweep triggers a **diameter deduction**: the scaling diameter used for Doyle board-foot calculation is reduced by the sweep magnitude (in inches) for any log that spans the sweep zone. A severe sweep can drop a log from one Doyle tier to a lower one without blocking any face.

**rot** — Decay, stain-rot, or fungal stain. Assessed as a face penalty on 1–3 faces. Has a 50% probability of being placed near the butt (0–4 ft), reflecting butt rot patterns common in Appalachian oaks. The remaining 50% can appear anywhere.

**end_check** — A radial end split at the butt end of the stem. Affects all four faces visually (the full cross-section splits). Rather than a face penalty, an end check triggers a **length deduction**: the effective log length of any segment that starts at or within the check zone is shortened by the check's linear extent (in feet). This removes usable footage from the butt log, potentially dropping it from one standard length to the next shorter one.

---

## Optimal Solver

### Algorithm

The optimal bucking solution is computed by **dynamic programming on a 0.5-ft grid** over the stem length.

- **State:** position along the stem in 0.5-ft steps (n steps for an n-ft stem).
- **Transitions:** at each position, try all five standard log lengths (8, 10, 12, 14, 16 ft). For each candidate end position, score the resulting log segment (applying defect penalties, sweep diameter deductions, and end-check length deductions) to get a dollar value. Store the maximum.
- **Direction:** the DP scans **backward from the top end** toward the butt. `dp[i]` = maximum value achievable from position `i` to the top. The butt log is always anchored at position 0.
- **Complexity:** O(n × k) where n = number of 0.5-ft steps (≈ 80 for a 40-ft stem) and k = 5 (standard lengths). Very fast.
- **Backtracking:** along with the value at each cell, the solver stores the cut choice (log length selected). After the forward pass, cut positions are recovered by following stored choices from butt to top.

### Defect Handling Inside DP

- **Sweep deduction:** when evaluating a candidate segment, the solver checks whether any sweep defect overlaps the segment. If so, the segment's small-end diameter is reduced by the sweep's `widthIn` value before computing Doyle board feet and looking up grade.
- **End-check deduction:** when the segment starts at the butt (position 0) and an end check is present, the segment's effective length is shortened by the check extent before selecting the largest fitting standard length.
- Both deductions interact with grade: a diameter deduction can drop Doyle footage enough to change grade tier, and a length deduction can prevent a 16-ft log from qualifying.

### Explanation Generation

After each stem, the game generates a natural-language explanation comparing the user's cuts to the optimal cuts. For each segment where they differ, the explanation describes: what grade the user achieved, what grade was possible, which defect caused the downgrade (if any), and whether a different cut position would have excluded that defect.

---

## Dataset

### Real Tree Data

The real tree data was sourced from the original HW Buck software's binary data files — `.shp` (stem profile) and `.def` (defect record) formats. These were **reverse-engineered** from raw binary/text dumps: the `.shp` format records sequential height/diameter measurement pairs; the `.def` format records defect records with type code, circumferential position (0–35 on a 36-stop clock), height position, and lateral width in inches.

The dataset contains **150 real trees** across four species:

| Species | Count |
|---|---|
| Sugar Maple | 113 |
| Red Maple | 20 |
| Red Oak | 14 |
| Yellow Birch | 3 |

Trees that are too short to yield even one 8-ft log, or with a top diameter below 7", are excluded during dataset build.

### Eleven Defect Type Codes (Reverse-Engineered)

| Code | Game Type | Notes |
|---|---|---|
| K | knot_cluster | Standard knot cluster |
| BU | knot_cluster | Burl |
| LD | knot_cluster | Knot/limb defect |
| SE | sweep | Diameter deduction; `widthIn` = sweep magnitude |
| DY | rot | Decay |
| SR | rot | Stain/rot |
| SN | rot | Stain |
| UW | seam | Unspecified wound/defect |
| F | seam | Fork (blocks all 4 faces) |
| BE | end_check | Bole end check (length deduction) |
| H | seam | Hole |

Only K, BU, SE, and F are referenced in original HW Buck user documentation. The remaining seven codes were inferred from field-count patterns in the raw `.def` files.

### Synthetic Trees

`hw-stems/generate-synthetic.js` generates approximately **165 additional stems** across 8 Appalachian hardwood species representative of the central Appalachian region (WV, VA, KY, TN):

| Species | Count |
|---|---|
| Yellow Poplar | 30 |
| Red Oak | 25 |
| White Oak | 25 |
| White Ash | 20 |
| Black Cherry | 20 |
| Black Walnut | 15 |
| Basswood | 15 |
| Shagbark Hickory | 15 |

Synthetic trees are assigned `treeNum` values starting at 1001. Stem dimensions (length, butt diameter, taper) and defect counts are sampled from species-specific distributions calibrated to typical Appalachian sawlog-quality stems. Defect type weights reflect each species' characteristic defect profile (e.g., oaks skew toward knot clusters; ash and cherry skew toward seams; walnut includes more sweep).

---

## Comparison to Value Recovery Simulators

It is important to distinguish this tool from more complex academic and commercial simulators like OSU's BUCK or the system described by Wang et al. (2004).

| Feature | Bucking Trainer (This Project) | Advanced Value Simulators (e.g., OSU BUCK) |
| :--- | :--- | :--- |
| **Primary Goal** | **Train** users on log grading and defect isolation. | **Maximize** lumber value recovery by simulating the sawing process. |
| **Value Model** | **Proxy-based:** Value is based on the grade of the delivered log. | **Product-based:** Value is the sum of the prices of all individual boards sawn from the log. |
| **Defect Model** | **External:** Defects are 2D features that block one or more of the four log faces. | **Internal:** Defects are 3D volumes that interrupt saw lines and reduce lumber grade/yield. |

In essence, this trainer simulates the logger's problem of maximizing *log value*, while advanced simulators model the mill's problem of maximizing *lumber value*. Both use dynamic programming, but they optimize for different value models. This tool correctly models the economic reality faced by a logger at the landing.

---

## Comparison: HW Buck (Original Software)

HW Buck was a commercial Windows desktop application used by WVU Forestry and Appalachian industry for hardwood bucking optimization education and training. The original data files used in this project came from the HW Buck distribution.

### Key Differences

**File formats:** HW Buck used proprietary binary `.shp` (stem profile) and `.def` (defect record) formats. Eleven defect type codes were reverse-engineered for this project; most have no documentation in the original HW Buck user materials.

**Veneer grade:** HW Buck included a Veneer grade tier that intercepts before the sawlog matrix — certain high-quality segments could be upgraded to veneer pricing. This trainer omits veneer because veneer specifications are highly buyer-specific, vary by species and regional market, and are not part of the standard AHMI sawlog matrix used for educational grading exercises.

**Rot defect weighting:** HW Buck weighted rot-type defects (DY, SR, SN) as a **2× face penalty** — a rot defect blocked two faces instead of one. This trainer uses a uniform **1× face penalty** for all defect types, consistent with the simplified AHMI rules used for pedagogical grading. The `facePenalty` field in each defect object can be restored to 2 for rot types if HW Buck severity weighting is desired.

**Platform:** HW Buck was single-user, Windows-only, requiring installation. This trainer is browser-based with no installation required.

**Explanation:** HW Buck revealed the optimal solution numerically but did not explain why it differed from the user's cuts. This trainer generates natural-language explanations of how each cut decision interacted with defects and grade thresholds.

**Taper model:** Both use linear interpolation between two endpoint diameters (butt and top) to estimate diameter at any point along the stem. HW Buck's `.shp` format records multiple measurement heights, but the game currently uses only the first and last for interpolation, consistent with the two-endpoint model.

---

## Comparison: buckR (R Package, Bennemann et al. 2025)

**Citation:** Bennemann, C., Lussier, J.-M., & Labelle, E. R. (2025). An Open-Source Tree Bucking Optimizer Based on Dynamic Programming. *Forests*, 16(5), 780. https://doi.org/10.3390/f16050780

Both this trainer and buckR use dynamic programming to solve the log bucking optimization problem. The algorithmic core — evaluating all candidate cut positions and propagating value backward — is shared. The differences lie in resolution, grading model, defect handling, and purpose.

### Comparison Table

| Dimension | This Trainer | buckR |
|---|---|---|
| Cut resolution | 0.5 ft (6") | 1 cm (~0.4") |
| Taper model | Linear interpolation, 2 endpoints | Empirical profile at 1 cm intervals from harvester data |
| Grading standard | AHMI matrix (SED × clear faces) | User-defined product specs (Lmin, Lmax, SEDmin, SEDmax, price) |
| Defect model | Face-based penalty integrated into DP; sweep/end-check deductions | External user input; no built-in defect-to-grade mapping |
| Multiple products | All 5 standard lengths tested per DP cell | Single product specification per run |
| Data standard | AHMI hardwood sawlog rules | StanForD 2010 (harvester machine data) |
| Platform | Browser, no installation | R package |
| Primary purpose | Training and pedagogy | Research and production optimization |

### Algorithmic Note on Grid Resolution

buckR's 1 cm grid on a 15-meter stem produces approximately 1,500 DP positions. This trainer's 0.5-ft grid on a 40-ft stem produces approximately 80 positions. buckR's finer resolution is appropriate for harvester-level precision, where the cutting head can be positioned to within centimeters. A 0.5-ft resolution matches realistic human cut placement accuracy with a chainsaw in the woods, and is coarser than the 1-ft resolution typical of log-length bucking rules. The computational cost difference is negligible for either resolution on modern hardware — the design choice is about matching the tool to the operational context.

### Where buckR Is Stronger

- Real machine taper data (1 cm empirical profiles from harvester sensors) rather than a two-endpoint linear model.
- Flexible product market definitions: any combination of length range, SED range, and price can be specified, making it applicable to any wood products market.
- Peer-reviewed methodology with formal validation.
- Native metric and StanForD 2010 compatibility for integration with harvester data workflows.
- Multi-product runs across an entire harvest operation, not single-stem evaluation.

### Where This Trainer Is Stronger

- **AHMI hardwood grading with defect-face interaction** — the pedagogical core of the tool. buckR has no built-in defect-to-grade mapping; users must supply external grade assignments. This trainer models how specific defect types (knots, seams, sweep, rot, end checks) interact with the four-face clear-face grading system, which is the central learning objective.
- **Explanation generation** — natural-language feedback on why the user's cuts differed from optimal, referencing specific defects and grade thresholds.
- **Visual interactivity** — canvas-based stem diagram, face defect map, rotation, hover tooltips, and direct cut placement.
- **Hardwood-specific dataset** — 150 real Appalachian hardwood stems plus ~165 synthetic stems across 8 commercially important species.

---

## Files

| File | Description |
|---|---|
| `index.html` | Main application page. Defines the canvas elements, controls panel (trim input, rotate button, score/next buttons), and segment results panel. Loads `style.css`, `script.js`, `prices.json`, and `hw-stems/trees.json` at startup. |
| `style.css` | Responsive layout styles. WVU brand colors (blue/gold). Canvas container, segment card grid, legend, and tooltip styles. |
| `script.js` | All game logic: tree dataset loading, log rendering (main canvas + face map canvas), cut placement and drag handling, AHMI grading (`scoreSegment`), sweep diameter deduction (`applySweepDeduction`), end-check length deduction, DP optimal solver (`computeOptimal`), explanation generation, session scoring, and rotation display. |
| `hw-stems/trees.json` | Combined tree dataset. First ~150 entries are real trees from HW Buck (treeNum 1–150). Entries with treeNum >= 1001 are synthetic trees generated by `generate-synthetic.js`. Rebuilt by running either build script. |
| `hw-stems/build-dataset.js` | Reads every `TREE*.shp` + `TREE*.def` pair from the `Shapes/` and `DEFECTS/` subdirectories, converts them to the game's defect model, and writes the real-tree portion of `trees.json`. Run once after obtaining the original HW Buck data files. |
| `hw-stems/generate-synthetic.js` | Generates synthetic stems for 8 Appalachian species and appends them to `trees.json` starting at treeNum=1001. Idempotent — strips previously-generated synthetic trees before writing new ones. Safe to re-run. |
| `hw-stems/parser.js` | Low-level parsers for the HW Buck `.shp` and `.def` binary/text formats. Exposes `parseShp()` and `parseDef()`. Used by `build-dataset.js`. |
| `prices.json` | Grade-to-price mapping in dollars per board foot (Doyle). Keys: Prime, Select+, Select, No. 1+, No. 1, No. 2+, No. 2, No. 3. Edit freely to reflect local market conditions. |

---

## Running / Setup

### Local Development Server

The game uses `fetch()` to load `hw-stems/trees.json` and `prices.json` at startup. Browsers block `fetch()` on `file://` URLs, so you must serve the project from a local HTTP server:

```bash
# Option 1: Node.js (npx, no global install needed)
npx serve .

# Option 2: Python 3
python -m http.server

# Option 3: Python 2
python -m SimpleHTTPServer
```

Then open `http://localhost:3000` (serve) or `http://localhost:8000` (Python) in your browser. Opening `index.html` directly via double-click will still work — the game falls back to randomly-generated logs — but the real tree dataset and prices will not load.

### Rebuilding trees.json from Real HW Buck Data

Requires the original HW Buck `Shapes/` and `DEFECTS/` directories inside `hw-stems/`:

```bash
node hw-stems/build-dataset.js
```

This overwrites `trees.json` with the real trees only (treeNum 1–N). Run `generate-synthetic.js` afterward to re-append the synthetic trees.

### Adding / Refreshing Synthetic Trees

```bash
node hw-stems/generate-synthetic.js
```

This strips any existing synthetic trees (treeNum >= 1001) from `trees.json` and appends a freshly-generated set. The random seed is not fixed, so each run produces a different dataset. Run this after `build-dataset.js` or any time you want a new synthetic batch.

### Editing Prices

Open `prices.json` in any text editor and change the dollar-per-board-foot values. The file is loaded fresh at each page load, so changes take effect on the next browser refresh. No build step required.

```json
{
  "Prime":   2.50,
  "Select+": 2.10,
  "Select":  1.80,
  "No. 1+":  1.50,
  "No. 1":   1.20,
  "No. 2+":  1.00,
  "No. 2":   0.80,
  "No. 3":   0.30
}
```
