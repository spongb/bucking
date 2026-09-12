# Stem Reconstruction Methodology

## Purpose

This document describes the process for reconstructing individual tree stem shapes from the **Utilization Study data** — field-collected tree-length measurements taken across multiple plots (currently 9 populated plots out of 10 sheets, with hundreds more expected). The goal is a repeatable, well-documented procedure that can be applied consistently to every new plot without re-deriving the logic each time.

The output of this process is a **stem JSON file per plot** (e.g., `Plot1_Stems_Master.json`), plus a combined all-plots file (`Millstudy_Stems.json`), containing one entry per reconstructed stem with its geometry, defect data, and full traceability back to the original field row.

---

## 1. Source Data Structure

Each plot's Utilization Study sheet records trees log-by-log, with these columns:

| Column | Meaning |
|---|---|
| Plot #, Tree # | Identifies the tree; ties every derived stem back to source |
| Species | Species code (see Section 1.1) |
| Base Dia | Diameter at the base of the tree (0 ft), sometimes marked "JUMP BUTT" |
| DBH | Diameter at breast height (used as a fallback base diameter for Jump Butt trees) |
| Log #, Product | Log sequence number and product class (SL=Sawlog, PL=Peeler, PW=Pulpwood, PR=Post/Rail, SC=Scragg, FW=Firewood, CULL) |
| Length | Length of that log, in feet |
| SE Dia | Small-end diameter of that log, in inches |
| Section: Length, % Sound | Internal soundness defect |
| Sector: Length, % Circum | Surface defect covering a % of circumference |
| Interior: Length, Dia. | Internal defect with its own diameter |
| Sweep: Length, Displacmnt | Gradual lateral bend over a length span |
| Crook: Length, Displacmnt | Sharp local bend over a length span |
| Free-text notes | Fork markers ("FORK #1", "BASE OF FORK", "BASE OF PIECE"), CULL context, jump butt, no data, etc. |

Some trees are marked **"All PW"** (no sawlog-grade data), **"JUMP BUTT"** (irregular base, sometimes with recoverable data via DBH), **"NO DATA"** / **"NO BASE DIAMETER DATA"**, or have a **"BAD [n]' section"** note. These require a case-by-case judgment call (see Section 6).

### 1.1 Species Code Reference (Confirmed as of 2026-09-12)

The Utilization Study and Mill Study datasets use overlapping but not identical species code sets. Below is the current confirmed/unconfirmed status. **Do not treat unconfirmed codes as reliable for species-specific matching or reporting** — they are working guesses only.

**Confirmed codes:**

| Code | Species |
|---|---|
| CH | Cherry |
| HM | Hard Maple |
| SM | Soft Maple |
| CO | Chestnut Oak |
| HK | Hickory |
| RO | Red Oak |
| WO | White Oak |
| YP | Yellow Poplar |
| WAL | Walnut |

**Unconfirmed codes (flagged, pending verification):**

| Code | Working Guess | Confidence |
|---|---|---|
| BO | Black Oak | Unconfirmed |
| SO | Scarlet/Southern/Swamp Oak | Unconfirmed |
| AB | Unclear | Unconfirmed, very low |
| SW | Unclear | Unconfirmed, very low |
| RM | Red Maple | Unconfirmed, medium |
| SG | Sweetgum | Unconfirmed, medium |
| SY | Sycamore | Unconfirmed, medium |
| DLM | Unclear — may not be a species code at all | Unconfirmed |
| SPS | Unclear | Unconfirmed |

**Full-name species recorded only in the Utilization Study (no corresponding mill-study code exists):** ASPEN, BASS (Basswood), BEECH, BIRCH, BUCKEYE, CUC (likely Cucumber Tree/Magnolia, unconfirmed), LOCUST.

**Action required:** any stem tagged with an unconfirmed code, or with a full-name species that has no mill-study counterpart, will always fall back to the diameter+B/U matching level (see `Mill_Defect_Projection_Methodology.md`, Section 2) since species-specific matching is impossible for these. This is expected and does not need to be treated as an error, but should not be silently assumed correct either.

---

## 2. Building the Base Stem Backbone

For every usable tree:

1. Start the profile at height 0 ft with the recorded **Base Dia** (or DBH, if Base Dia was "JUMP BUTT" and DBH is usable — see Section 6).
2. Walk each log in sequence, accumulating height (`cumulative_height += log_length`) and recording the **SE Dia** at that cumulative height.
3. Each point in the profile is stored as `{heightFt, diameterIn, source}`, where `source` identifies exactly which field (base dia, or which log's SE dia) it came from — this is what allows tracing any point back to the original sheet.
4. **CULL segments are retained in the backbone**, not discarded — a CULL log still occupies real length and has a real (if lower-grade) diameter. It is additionally flagged in `meta.cullOnThisStem` for downstream defect/grade handling.
5. **Duplicate log numbers** (seen occasionally, e.g. two rows both labeled "Log 6") are treated as sequential sub-segments (6a, 6b) in the order they appear, not merged or treated as an error.

This produces one continuous straight-line taper profile per tree, before any fork or shape-defect handling.

---

## 3. Fork Handling

### 3.1 The Core Principle

A tree with a fork is not one continuous stem — physically, forks are cut off at the landing before bucking and become **independent stems** at that point. Reconstructing a forked tree as one long backbone misrepresents how it is actually processed.

### 3.2 Detection

Forks are identified from free-text notes in the source sheet: `"FORK #1"`, `"FORK #2"`, `"BASE OF FORK"`, or `"BASE OF PIECE"` (an equivalent marker seen in some plots). Every such marker is treated as a **fork base** — the point where the current stem ends and a new independent stem begins.

### 3.3 Splitting Logic

1. Walk the tree's log sequence. When a fork-base marker is hit, terminate the current stem there. Record its length, butt diameter (inherited from wherever *that* stem's own origin was), and its diameter at the fork base.
2. Start a new stem. Its local height resets to 0 at the fork point. Its butt diameter is **inherited from the parent stem's diameter at the fork base** — this is an approximation, since a fork's true starting cross-section is smaller than the parent's (the parent's cross-section is physically shared between forks), but it is not independently measured in this data. This is explicitly flagged (`source: "..._INHERITED_AS_NEW_STEM_ORIGIN"`).
3. If a fork itself forks again (seen in several trees), repeat step 2 recursively.
4. Continue until the tree's log list is exhausted.

### 3.4 Stem ID Convention

- The main stem keeps the tree's original number: `{plot}-{treeNum}` (e.g., `1-13`).
- Each fork gets a decimal sub-ID in cut order: `{plot}-{treeNum}.{forkIndex}` (e.g., `1-13.1` for the first fork, `1-13.2` for the second).
- Every stem — main or fork — carries explicit `plot` and `treeNum` fields (not just embedded in the ID string), so any stem can always be traced back to its original source row without string-parsing.

### 3.5 Complexity Tagging

Every stem produced by fork-splitting is tagged `"complexityTag": "complex"` with a `complexityReason` string explaining the judgment made. This allows filtering the full dataset for every stem that needs a second look.

### 3.6 CULL-at-Fork Coincidence

If a CULL-flagged log coincides with a fork base, the fork boundary takes precedence: the current stem terminates there, and the CULL flag is retained as metadata on the segment where it occurred.

---

## 4. Shape Defects: Sweep and Crook

Sweep and crook are **geometric** defects — they bend the stem's centerline — and are modeled differently from each other despite using the same recorded units (Length + Displacement).

### 4.1 Sweep — Smooth Bow

Modeled as a **parabolic lateral offset**: zero displacement at both ends of the recorded length, peaking at the recorded displacement value at the midpoint, returning to zero at the far end.

```
offset(t) = displacement × 4 × t × (1 − t),  where t ∈ [0, 1] across the recorded length
```

### 4.2 Crook — Sharp Kink

Modeled as a **fast ramp to full displacement within the first ~30% of the recorded length, then held constant** for the remainder.

```
offset(t) = displacement × min(1, t / 0.3),  where t ∈ [0, 1] across the recorded length
```

### 4.3 Attachment, Anchoring, and Length Clipping

Every sweep/crook note is anchored to its recorded log number's actual height span within its stem. If a tree was split by forking, the note is reattached to whichever specific stem (main, `.1`, `.2`, etc.) that log lives on. If a defect's recorded length exceeds the log segment it's attached to, the curve is clipped to fit, with the original length preserved in `clippedFromOriginalLengthFt` and a `clipNote` explaining the adjustment.

---

## 5. Quality Defects: Section, Sector, Interior

These are **not** geometric. Each is attached to its originating log's height span (same anchoring/clipping rules as sweep/crook) and stored in `meta.qualityDefects` with its type, span, and recorded value (`% Sound`, `% Circumference`, or internal defect diameter respectively). No stem shape change results from these.

---

## 6. Tree Exclusions

| Condition | Treatment |
|---|---|
| "All PW" | No sawlog-grade log data recorded; excluded |
| "JUMP BUTT" with usable DBH | Base diameter substituted with DBH; reconstruction proceeds, documented as an approximation |
| "JUMP BUTT" with no other data | Excluded |
| "NO DATA" / "NO BASE DIAMETER DATA" | Excluded |
| "BAD [n]' section at base" | Excluded |
| Tree number present but zero usable log rows | Excluded ("No log rows recorded") |

Excluded trees are recorded in the output's `excludedTrees` list with plot, tree number, and reason — never silently dropped.

---

## 7. Stem Output Schema Summary

Each plot produces one JSON file (`Plot{N}_Stems_Master.json`), plus a combined `Millstudy_Stems.json` across all plots, with:

```
{
  "plot": <int>,
  "reconstructionDate": <string>,
  "realization": { "realizationId": <string>, "generatedAt": <string>, "note": <string> },
  "schemaNote": <string>,
  "stems": [
    {
      "stemId": "<plot>-<treeNum>[.<forkIndex>]",
      "plot": <int>,
      "treeNum": <int>,
      "forkIndex": <int or null>,
      "species": <string, raw code from source data>,
      "stemType": "unforked" | "main" | "fork",
      "length": <float, ft>,
      "butt": <float, in>,
      "top": <float, in>,
      "profile": [ {heightFt, diameterIn, source}, ... ],
      "meta": {
        "cullOnThisStem": [...],
        "shapeDefects": [...],
        "qualityDefects": [...],
        "millDefectProjections": [...],   -- see Mill_Defect_Projection_Methodology.md for full schema
        "complexityTag": "complex" | null,
        "complexityReason": <string or null>
      }
    },
    ...
  ],
  "excludedTrees": [ {plot, treeNum, reason}, ... ]
}
```

---

## 8. Applying This to New Plots

1. **Parse the raw sheet** into per-tree log lists, capturing Base Dia, DBH, each log's Product/Length/SE Dia, and any Section/Sector/Interior/Sweep/Crook values with their associated log number. Keep every tree row visible through this step — do not drop rows with missing LogNum before checking for exclusion conditions (an earlier bug silently dropped All-PW/No-Data/Jump-Butt trees before they could be logged as excluded).
2. **Flag exclusions** per Section 6 before building anything.
3. **Build the straight backbone** per Section 2 for every remaining tree.
4. **Detect and split forks** per Section 3.
5. **Attach shape defects** (sweep/crook) per Section 4.
6. **Attach quality defects** (section/sector/interior) per Section 5.
7. **Project mill-study defects** onto every segment — see `Mill_Defect_Projection_Methodology.md`.
8. **Assemble and save** the plot's master JSON, plus update the combined `Millstudy_Stems.json`.
9. **Review all `complexityTag: "complex"` stems** manually before relying on them downstream.

---

## 9. Known Open Items (as of this version)

- Fork butt diameters are inherited from the parent stem's fork-base diameter, which slightly overstates each fork's true starting size (Section 3.3).
- Several species codes remain unconfirmed (Section 1.1) — BO, SO, AB, SW, RM, SG, SY, DLM, SPS. These should not be treated as verified until follow-up confirmation is obtained.
- A few sweep/crook records show minor length-vs-log-span mismatches (~0.4 ft), most likely due to field rounding; these are clipped automatically but the underlying cause has not been confirmed against original field notes.
- Plot 10's sheet was found to be empty/placeholder in the source file; no trees were reconstructed from it.
