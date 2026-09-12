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
- No validation has yet been done comparing projected defect rates/positions against any independent ground truth.
- Cross-side merging (i.e., whether a defect visible on 2 adjacent sides should ever be treated as one physical feature) was explicitly excluded from this methodology per confirmed design decision — same-side merging only.
