# Mill Study Defect Projection Methodology

## Purpose

This document describes the process for projecting real, observed log defects from the **mill study log data** (`Defect-Data.xlsx`) onto the geometric segments of **reconstructed stems** (produced by the Stem Reconstruction process — see `Stem_Reconstruction_Methodology.md`). The goal is a repeatable procedure that produces realistic, physically-grounded, traceable defect placements on synthetic stem segments, reproducible across future plots and future mill study datasets.

**This is the output schema now required by the downstream bucking training software and must be treated as a fixed contract (see Section 8).**

---

## 1. Source Data: The Mill Study Log Data

`Defect-Data.xlsx` contains one sheet per diameter class (10in, 11in, 12in, ... 17+in). Each row is one real, individually scaled log with:

| Column | Meaning |
|---|---|
| SPP | Species code (see Section 1.1 of `Stem_Reconstruction_Methodology.md` for the confirmed/unconfirmed crosswalk) |
| Scaling D1, Scaling D2 | Small-end and large-end diameters (in) |
| Length (ft) | Log length |
| Trim (in) | Trim allowance |
| (B/U) | Butt or Upper — position in the tree. Only two values exist: `B` or `U`. |
| Clear Faces | Number of the log's 4 faces that are defect-free |
| Defects (Number) | Total defect count |
| Defects Side 1–4, each split into `<=3"`, `>3"<=6"`, `>6"` | **Defect counts** by side and size class — these are counts of how many defects fall in each bucket, NOT lengths or positions. See Section 4 for why this distinction matters. |

**Load procedure:** read each sheet skipping the multi-row header (data starts row 4), tag rows with `SheetDiaClass`, concatenate all sheets, strip whitespace from `SPP`/`BU`, and assign a stable `MillRowId` to every row for traceability.

---

## 2. Matching Key Hierarchy

1. **Primary match: Species + Diameter Class + B/U.** Filter to rows matching all three.
2. **Fallback: Diameter Class + B/U only** (species dropped), applied automatically if the primary pool has fewer than **15 logs**.
3. Every projection result records `matchLevel`, so fallback usage is never silent.

**Note:** any stem tagged with an unconfirmed species code, or a full-name species with no mill-study counterpart (see `Stem_Reconstruction_Methodology.md` Section 1.1), will always use the fallback path since no species-specific pool can exist for it.

---

## 3. Diameter Class Assignment and Length-Proximity Selection

A stem segment's diameter is rounded to the nearest whole inch and clamped to 10–17. Within the matched pool, the **5 closest-length candidates** to the segment's actual length are identified, and one is drawn at random from that shortlist (true bootstrap, `random_state=None`, no fixed seed). This avoids inventing a proportional-scaling formula — every projected defect profile comes from a real log that was genuinely close in both diameter class and length.

---

## 4. Point Defects With Physical Footprint (Corrected Methodology)

### 4.1 The Problem With the Original Approach

An earlier version of this methodology treated the `<=3"`, `3-6"`, `>6"` counts as if they described defect *lengths spanning the segment*, which produced defects that visually stretched across the entire remaining length of a stem segment in the downstream bucking trainer. This was incorrect: **these size classes describe the physical size of each individual defect** (e.g., a knot's own diameter), not a span of the log's length that the defect "controls."

### 4.2 Corrected Model

Each defect is treated as a **point feature with its own physical footprint** along the log's length axis:

1. **Random position**: every individual defect is placed at a random point along its segment (true random scatter, confirmed design decision — not evenly spaced, not fixed).
2. **Random footprint size**, sampled from within its size-class bucket:

| Size Class | Footprint Range | Basis |
|---|---|---|
| `le3in` | uniform(0.5in, 3.0in) | Directly bounded by the bucket definition |
| `3to6in` | uniform(3.0in, 6.0in) | Directly bounded by the bucket definition |
| `gt6in` | uniform(6.0in, 12.0in) | **EXPLICIT ASSUMPTION** — the source data has no upper bound for this bucket; 12in was chosen as a working ceiling and should be revisited if better guidance becomes available |

3. Defects are placed independently on each of the 4 sides, using the matched mill log's actual per-side counts (after random side rotation — see Section 5).

### 4.3 Same-Side Overlap Merging

Within a single side only, if two or more defects' footprints physically overlap or touch (one defect's end position ≤ another's start position), they are merged into a single **zone** representing one continuous affected section of wood — e.g., two adjacent `>6"` defects placed touching each other become one ~12"+ zone, matching real-world physical reality (two touching defects consume one continuous stretch of the log, not two independently-floating markers).

**Merging rules, confirmed:**
- Merging applies **only within the same side**. A defect on Side 1 and a defect on Side 2 never merge, even if they occupy the identical height range — they represent independent surface features on different faces.
- Merging triggers **only on genuine overlap or touching** (`start ≤ previous_end`), never on mere proximity. Two separate 3" knots sitting near each other but not touching remain two distinct defects (e.g., two knots next to each other should not become one — this was explicitly confirmed).

### 4.4 Data Retained

Both levels of detail are preserved per side:
- `individualDefects`: every placed defect with its size class, footprint, and position — for full traceability and audit.
- `mergedZones`: the consolidated view after same-side overlap merging — for accurate visual rendering and volume-impact calculations.

---

## 5. Random Side Rotation

The mill data's four sides (Side 1–4) are arbitrary labels with no fixed physical meaning. A random permutation of `[1,2,3,4]` is generated per projection and used to map the drawn mill log's sides onto the segment's own sides, avoiding any systematic bias toward always placing the "worst" mill-log side in the same position. Each side's `sourceMillLogSide` field preserves which original mill-log side it came from.

---

## 6. Bootstrap Sampling — True Randomness

**No fixed random seed** is used anywhere in this pipeline: not for mill log selection, not for side rotation, and not for individual defect positioning/footprint sizing. Every run produces different results on identical input geometry. This is a deliberate design choice, preserving realistic variability and enabling future Monte Carlo-style comparisons across multiple realizations. If a reproducible reference example is needed, fix a `random_state` explicitly for that one run and document it — do not assume any prior run's output can be regenerated.

Every output file carries a `realization` block (`realizationId`, `generatedAt`, explanatory note) making clear that the file represents one specific random draw, not a canonical or reproducible result.

---

## 7. Full Traceability

Every projected defect (at both the log-match level and the individual-defect level) carries a `sourceMillLogRowId` — the stable row index in the concatenated mill dataframe — allowing any projected defect to be traced back to the exact row and diameter-class sheet it came from in `Defect-Data.xlsx`.

---

## 8. Required Output Schema (Fixed Contract for Bucking Trainer)

**As of 2026-09-12, the following schema is a required contract specified by the downstream bucking training software. Any future refactor of this pipeline must continue to emit output matching this exact structure — fields may be added, but these must not be renamed, removed, or restructured without confirming with the receiving team first.**

For every stem, `meta.millDefectProjections` is a list, one entry per segment:

```
{
  "segStartHeightFt": <float>,
  "segEndHeightFt": <float>,
  "segmentLengthFt": <float>,
  "sides": {
    "side1": { ... },
    "side2": { ... },
    "side3": { ... },
    "side4": { ... }
  }
}
```

Each `sideN` object must include:

```
{
  "defectCounts": { "le3in": <int>, "3to6in": <int>, "gt6in": <int> },
  "individualDefects": [
    {
      "sizeClass": "le3in" | "3to6in" | "gt6in",
      "footprintIn": <float>,
      "centerIn": <float>,
      "startIn": <float>,
      "endIn": <float>
    },
    ...
  ],
  "mergedZones": [
    {
      "zoneStartIn": <float>,
      "zoneEndIn": <float>,
      "zoneLengthIn": <float>,
      "memberDefectCount": <int>
    },
    ...
  ]
}
```

Additional fields (`sourceMillLogSide`, `memberSizeClasses`, `isMerged`, `matchLevel`, `sourceMillLogRowId`, `sourceMillLog`, `poolSize`, `lengthDiffFt`, `diameterClassUsed`, `buPosition`) may also be present for traceability and debugging, but the fields listed above are the minimum required set and must always be present with these exact names.

---

## 9. Applying This to a Reconstructed Stem

1. Break the stem's profile into segments (each pair of consecutive profile points).
2. Mark the first segment on the stem as Butt; all others as Upper.
3. For each segment: match a mill log (Sections 2–3), rotate sides (Section 5), place point defects with footprints on each side (Section 4.2), merge same-side overlaps (Section 4.3).
4. Attach the resulting projection object — matching the Section 8 schema exactly — to `meta.millDefectProjections`.
5. Retain every `sourceMillLogRowId` used across the whole plot in a summary table for the traceability record.

---

## 10. Reproducing This Process on Future Data Batches

1. Re-run Section 1's load procedure against new mill data, verifying header structure and column order haven't shifted.
2. Re-validate the 15-log fallback threshold (Section 2) against the new data's species distribution.
3. Re-check the diameter class range (Section 3) if new logs fall well outside 10–17".
4. Re-confirm the `gt6in` footprint ceiling (currently 12in, Section 4.2) — this is an assumption, not derived from data, and should be revisited if better guidance becomes available.
5. Keep the no-fixed-seed bootstrap (Section 6) as default for production runs.
6. Confirm any new or previously-unconfirmed species codes against a domain expert before relying on species-specific matching for them (see `Stem_Reconstruction_Methodology.md` Section 1.1) — do not guess.
7. Always retain the `sourceMillLogRowId` trace table for every run.
8. Validate output against the Section 8 schema contract before handing off to the bucking trainer.

---

## 11. Known Open Items

- The `gt6in` footprint ceiling (12in) is an explicit, undocumented-in-source-data assumption (Section 4.2) and may need revision.
- Several species codes remain unconfirmed (see `Stem_Reconstruction_Methodology.md` Section 1.1): BO, SO, AB, SW, RM, SG, SY, DLM, SPS. Stems using these codes always fall back to diameter+B/U matching, which is expected but should be tracked.
- The 5-candidate length-proximity shortlist size (Section 3) has not been tuned against alternative values.
- Cross-side merging (i.e., whether a defect visible on 2 adjacent sides should ever be treated as one physical feature) was explicitly excluded from this methodology per confirmed design decision — same-side merging only.
- See Section 12 for an open question on whether matching should be normalized per foot of log length.

---

## 12. Distribution Validation (2026-09-13)

### 12.1 What was checked

A validation pass compared the defect distribution of the projected stem segments against the real mill-study log pool (`Defect Data.xlsx`), stratified by diameter class and B/U position. This surfaced two distinct problems, both now fixed. It also confirmed the core projection math itself was never at fault: a fidelity check (does a projected segment's `defectCounts` exactly equal its cited `sourceMillLogRowId` row's counts?) passed on every segment throughout the investigation.

### 12.2 Problem 1 — stale source pool (data provenance)

`Defect Data.xlsx` was not tracked in git prior to this investigation. Its on-disk file-modification timestamp was found to be ~3h46m *after* the `realization.generatedAt` timestamp recorded inside the original `Millstudy_Stems.json`, meaning the spreadsheet had been edited some time after that file was generated. There is no way to recover the exact spreadsheet state that produced the original file, so its output cannot be reconciled or reproduced.

**Fix:** `Defect Data.xlsx` is now committed to git, so this cannot silently recur — any future edit is visible in history, and any generated output can be tied to an exact commit of the source spreadsheet.

**Consequence for existing data:** the original file was renamed to `Millstudy_Stems_original_untracked-pool.json` rather than deleted or overwritten, since it may still be useful for other purposes, but it should not be treated as reconcilable against the current `Defect Data.xlsx`. `Millstudy_Stems.json` (the name consumed by `script.js`) now refers to a fresh realization regenerated against the current, tracked spreadsheet, reusing the same stem/segment geometry (heights, lengths, B/U position, diameter class — all independent of the mill defect pool) and redrawing only the mill-log matching and defect placement.

### 12.3 Problem 2 — tie-breaking bias in candidate selection

Independent of the stale-pool issue, the candidate-selection step (Section 3) has an implicit tie-breaking hazard: each diameter-class sheet in `Defect Data.xlsx` is internally sorted by clear-face count, and mill log lengths cluster heavily on round numbers, so most length-proximity queries land on a large tie group (candidates at equal distance from the target length) rather than a clean ranking. Within a tie group, row order and total defect count are strongly negatively correlated (r ≈ −0.73 to −0.85 across sampled groups) — i.e., the worst-defect logs are listed first within a tied length.

Any implementation that ranks candidates with a **stable sort** (Python's default, and most language/library default sorts) will silently prefer the first-listed — and therefore highest-defect — row whenever a tie exists, without that bias appearing anywhere in the code as a deliberate choice. This is very easy to introduce unintentionally and does not show up as a fidelity failure, since each drawn segment's counts still exactly match a real row.

**Fix:** shuffle the eligible candidate pool before ranking by length distance, on every draw, so ties break randomly instead of favoring sheet order. Confirmed in isolated testing: with a stable sort, a from-scratch reconstruction of the documented "5-nearest, uniform draw" rule overshot the pool mean by ~96% (7.87 vs. 4.01); with randomized tie-breaking, the same rule overshoots by only ~9-15% (see 12.4). Widening the candidate window (5 → 15 → 20) or capping reuse per row, tested in isolation with correct tie-breaking, made negligible additional difference — tie-breaking was the dominant effect, not window size.

### 12.4 Residual ~12-15% overshoot — expected, not a bug

Even with both fixes applied, projected segments run modestly higher than the pool baseline (confirmed stable across 15 independent re-realizations: mean 4.48, σ=0.14, vs. pool mean 4.01 — about +12%; a single regenerated realization measured +15%). This is attributable to the length-proximity matching design itself:

- Reconstructed stem segments trend slightly longer on average than the mill pool (~11.5 ft vs. ~10.85 ft).
- The real mill data has a mild positive correlation between log length and total defect count (r ≈ 0.14).

Matching on absolute length therefore pulls very slightly toward the higher-defect side of the pool. This is a small, understood, and stable effect — not a remaining implementation bug.

### 12.5 Final comparison table (post-fix, current `Millstudy_Stems.json` vs. current `Defect Data.xlsx`)

Overall: pool mean 4.008 / median 2, vs. projected mean 4.617 / median 2.0 (4-clear-face share 28.8% vs. 29.2%; 0-clear-face share 12.7% vs. 14.7%).

| Diameter class | Pool n | Pool mean | Proj n | Proj mean | Gap |
|---|---|---|---|---|---|
| 10in | 340 | 7.559 | 278 | 7.978 | +5.5% |
| 11in | 437 | 5.995 | 104 | 6.731 | +12.3% |
| 12in | 519 | 5.145 | 102 | 5.353 | +4.0% |
| 13in | 621 | 4.395 | 108 | 3.398 | **−22.7%** |
| 14in | 515 | 3.571 | 101 | 3.644 | +2.0% |
| 15in | 470 | 3.115 | 92 | 2.663 | −14.5% |
| 16in | 388 | 2.415 | 94 | 2.372 | −1.8% |
| 17+in | 889 | 2.161 | 287 | 2.495 | +15.5% |

| B/U | Pool mean | Proj mean | Gap |
|---|---|---|---|
| B (butt) | 1.749 | 1.794 | +2.6% |
| U (upper) | 5.233 | 5.774 | +10.3% |

Every diameter class falls within roughly ±15% of its pool baseline except **13in, at −22.7%**, which is the one bucket worth watching on a future re-realization (n=108 for that bucket, so this could still be ordinary bootstrap variance — the 15-rep stability check in 12.4 was only run at the aggregate level, not per-bucket). A per-diameter-class x B/U breakdown was also computed and showed much larger swings (up to ±100%), but at n=14-27 per cell that is expected small-sample bootstrap noise, not a signal.

### 12.6 Open question — length-normalized matching (not yet resolved)

Should the matching step normalize by length (e.g., match on defects-per-foot rather than raw defect count, or scale the drawn counts by the ratio of segment length to source length) to eliminate the residual ~12-15% overshoot described in 12.4? Or is matching absolute defect counts from a length-proximate real log the intended behavior, on the theory that defect count doesn't scale linearly with length anyway?

This has not been decided and the matching logic has **not** been changed to address it. It depends on how the downstream projections are actually consumed (e.g., whether absolute defect count or defect density is the thing that needs to be realistic for the bucking trainer's purposes) — flagging for whoever owns that modeling choice rather than guessing.

---

## 12.7 Follow-up: the 13in outlier, resolved

The 13in diameter class was the one bucket in the Section 12.5 table falling outside the general ±15% pattern (−22.7% vs. pool). A follow-up investigation, scoped narrowly to this bucket, resolved it into two separate findings.

### 12.7.1 The aggregate 13in gap is noise — confirmed, no action needed

15 independent realizations of the (corrected) matching step, scoped to the 13in bucket alone (n=108 queries/rep), gave:

- Mean of means: 4.00 (pool baseline: 4.395) — a −8.9% average gap, far smaller than the single-realization −22.7%
- Per-rep gaps ranged from **−20.1% to +5.8%**, landing on both sides of the pool baseline across the 15 reps

A gap that bounces to both sides of zero across repeated realizations is ordinary small-sample bootstrap variance (n=108), not a stable effect. The original −22.7% reading was simply an unlucky draw near the tail of this distribution. **No action needed on the 13in aggregate finding.**

### 12.7.2 A distinct, one-sided finding: 13in-Upper species composition

Splitting the same 15 reps by B/U revealed something qualitatively different from noise: the **13in-Upper (BU='U') sub-slice undershot its pool baseline (5.461) in all 15 of 15 realizations**, with gaps ranging from about −8% to −30% and never crossing to positive. A truly noisy metric lands on both sides of baseline over repeated trials; landing on the same side every single time points to a real, directional mechanism.

Two candidate mechanisms from Section 12.4's general explanation were checked and ruled out:

- **Length-matching direction:** 13in-U segments trend *longer* than the 13in-U pool average (11.18 ft vs. 10.56 ft), and the 13in-U pool's own length↔defect correlation is positive (r = +0.240, even stronger than the whole-pool +0.140). This predicts a slight *overshoot*, not the observed undershoot — the general length-matching artifact from 12.4 does not apply here and in fact runs the wrong direction.
- **Fallback-pool anomaly:** only 11 of 90 queries (12%) used the diameter+BU fallback pool; by construction that pool is identical to the full 13in-U pool (mean 5.461), so it cannot itself be the source of a skew.

The actual mechanism is **species composition** in the 79 (of 90) queries that used species-specific primary matching. Species-specific 13in-U sub-pool means vary widely, and low-defect species were drawn far more often than high-defect ones:

| Species | Sub-pool mean | Times drawn |
|---|---|---|
| YP | 3.585 | 35 |
| CH | 2.042 | 9 |
| CO | 4.364 | 9 |
| HM | 3.833 | 5 |
| SM | 6.636 | 13 |
| RO | 5.235 | 2 |
| WO | 7.526 | 4 |
| BO | 8.262 | 2 |

YP alone accounts for 39% of draws at a sub-pool mean (3.585) well below the 5.461 pool-wide average, while the two highest-mean species (WO, BO) were drawn only 4 and 2 times respectively. Weighting each species' sub-pool mean by its actual draw count gives an expected mean of **4.51** — a **−17.4%** gap versus the 5.461 pool-wide baseline — which closely matches the **−18.9%** average gap actually observed across the 15 reps (mean of means 4.43). This arithmetic reconciliation confirms species composition, not noise or a matching bug, fully explains the one-sided 13in-U undershoot.

- **Open interpretive question (unresolved, distinct from Section 12.6):** is the species mix among stems that produce a 13in-Upper segment an accurate reflection of the true species composition of the reconstructed stand at that diameter/position — in which case species-aware matching is correctly surfacing a real property of the Utilization Study data — or is it an artifact of how the bucking/stem-reconstruction process selects which stems yield a 13in-Upper segment, in which case the bucking/stem-selection logic (not the defect-matching logic covered in this document) would be the place to look? This has not been investigated and requires looking at the stem reconstruction pipeline (`Stem_Reconstruction_Methodology.md`), not this document.

**Summary:** this investigation thread — original distribution comparison, stale-pool fix, tie-breaking fix, 13in aggregate noise check, and the 13in-Upper species-composition finding — is now fully documented and closed. No further action is pending except the two explicitly-flagged open questions: length-normalized matching (Section 12.6) and the species-skew interpretation above (Section 12.7.2).
