// ─── Game State ────────────────────────────────────────────────────────────
const TOTAL_LOGS = 5;
let currentLogIndex = 0;
let logScores = [];
let cuts = [];
let pieceProduct = []; // per-piece override: 'sawlog' (default), 'peeler', or 'scrag'
let dragIdx = -1;
let totalLength, buttDia, topDia, currentTree;
let currentDefects = [];
let logRotation = 0; // 0–3: which face index is currently on top
let viewMode = '2d'; // '2d' | '3d'

// ─── Branding Colors ───────────────────────────────────────────────────────
// Centralized color palette. These should align with variables in style.css
const COLORS = {
    wvuBlue: '#002855',
    wvuGold: '#EAAA00',
    wvuSlate: '#5A5A5A',
    wvuFog: '#C0C8D8',
    wvuCloud: '#F5F8FF',
    wvuSky: '#EAF0FA',
    barkBrown: '#5C3317',
    feedback: {
        success: '#27ae60',
        warning: '#e67e22',
        error: '#c0392b',
    },
    defect: {
        knot: '#8B4513',
        seam: '#444444',
        sweep: '#DAA520',
        rot: '#8B0000',
        millDefect: '#E91E8C',
    }
};

// ─── Grade Prices (per board foot) ────────────────────────────────────────
// Loaded from prices.json at startup; falls back to these defaults if unavailable.
let PRICES = {
    'Prime': 2.50, 'Select+': 2.10, 'Select': 1.80,
    'No. 1+': 1.50, 'No. 1': 1.20, 'No. 2+': 1.00, 'No. 2': 0.80, 'No. 3': 0.30
};

// ─── Weight-Priced Products (Peeler / Scrag) ──────────────────────────────
// WV northern-hardwood market, 2026: yellow-poplar dominates the peeler
// market; scrag is the mixed-hardwood #3/pallet market. Both are sold by the
// green ton, so value comes from cubic volume x species green density, not
// from Doyle BF (Doyle drastically underscales small/low-grade logs).
// Preferred peeler bolt lengths (longest first, so the DP/scoreSegment length
// search prefers the longest bolt that fits, same preference order as the
// sawlog standard lengths). These already include the mill's trim allowance,
// so no separate trim is subtracted for peeler segments.
const PEELER_LENGTHS_FT = [10.5, 9.5, 8.5];

const PRODUCT_SPECS = {
    peeler: {
        label: 'Peeler',
        // TESTING VALUE — real market avg is $107/ton ($85-$130, WV yellow-poplar
        // veneer, KDF/AHC Aug 2026); that price never beats a sawlog grade at the
        // volumes a single piece weighs, so the DP would never pick it. Bumped
        // here so peeler bucking choices are actually exercisable/testable in
        // the optimizer. Revert to 107 once real DP behavior isn't needed.
        pricePerTon: 500,
        eligibleSpecies: ['YELLOW_POPLAR'],
        minSED: 12, maxSED: null,
        notes: 'Yellow-poplar only. Straight & round, pith centered, no sweep/rot/splits, min SED 12"-14".'
    },
    scrag: {
        label: 'Scrag',
        pricePerTon: 30, // avg of $20-$40/ton, WV/PA #3-pallet mixed hardwood
        eligibleSpecies: null, // any species — mixed-hardwood market
        minSED: 6, maxSED: 14,
        notes: '#3/pallet grade. Sound wood only (no rot/metal); knots & moderate sweep tolerated.'
    }
};

// Green density (lb per cubic ft) by canonical species — per USDA Forest
// Products Lab Wood Handbook Table 4-7 (weight of green wood, moisture
// included). Used to convert log cubic volume to weight for peeler/scrag
// pricing. Yellow-poplar in particular carries very high green moisture
// content, so its green weight (38) is well above its oven-dry weight
// (~26-28, which is what's sometimes quoted loosely as "density").
const SPECIES_DENSITY = {
    YELLOW_POPLAR: 38, RED_OAK: 62, WHITE_OAK: 64, BLACK_OAK: 56, SCARLET_OAK: 58,
    CHESTNUT_OAK: 54, HARD_MAPLE: 56, SUGAR_MAPLE: 56, RED_MAPLE: 50, ASH: 48,
    BLACK_CHERRY: 45, BLACK_WALNUT: 58, BASSWOOD: 47, HICKORY: 66, BEECH: 58,
    BIRCH: 57, YELLOW_BIRCH: 57, LOCUST: 65, CUCUMBER: 44, DEFAULT: 50
};

// Friendly display name by canonical species key — used anywhere a species
// is shown to the user, so a dataset's raw code ("YP") or all-caps name
// ("YELLOW POPLAR") both render the same way ("Yellow Poplar").
const SPECIES_DISPLAY_NAME = {
    YELLOW_POPLAR: 'Yellow Poplar', RED_OAK: 'Red Oak', WHITE_OAK: 'White Oak',
    BLACK_OAK: 'Black Oak', SCARLET_OAK: 'Scarlet Oak', CHESTNUT_OAK: 'Chestnut Oak',
    HARD_MAPLE: 'Hard Maple', SUGAR_MAPLE: 'Sugar Maple', RED_MAPLE: 'Red Maple',
    ASH: 'Ash', BLACK_CHERRY: 'Black Cherry', BLACK_WALNUT: 'Black Walnut',
    BASSWOOD: 'Basswood', HICKORY: 'Hickory', BEECH: 'Beech', BIRCH: 'Birch',
    YELLOW_BIRCH: 'Yellow Birch', LOCUST: 'Black Locust', CUCUMBER: 'Cucumber Tree'
};

// Maps both dataset species codes (e.g. "YP") and full names (e.g. "YELLOW POPLAR")
// to one canonical key used by SPECIES_DENSITY / SPECIES_DISPLAY_NAME / PRODUCT_SPECS.eligibleSpecies.
const SPECIES_CODE_MAP = {
    YP: 'YELLOW_POPLAR', 'YELLOW POPLAR': 'YELLOW_POPLAR', POPLAR: 'YELLOW_POPLAR',
    RO: 'RED_OAK', 'RED OAK': 'RED_OAK',
    WO: 'WHITE_OAK', 'WHITE OAK': 'WHITE_OAK',
    BO: 'BLACK_OAK', 'BLACK OAK': 'BLACK_OAK',
    SO: 'SCARLET_OAK', 'SCARLET OAK': 'SCARLET_OAK',
    CO: 'CHESTNUT_OAK', 'CHESTNUT OAK': 'CHESTNUT_OAK',
    HM: 'HARD_MAPLE', 'HARD MAPLE': 'HARD_MAPLE',
    SM: 'SUGAR_MAPLE', 'SUGAR MAPLE': 'SUGAR_MAPLE',
    RM: 'RED_MAPLE', 'RED MAPLE': 'RED_MAPLE',
    WA: 'ASH', 'WHITE ASH': 'ASH', ASH: 'ASH',
    CH: 'BLACK_CHERRY', 'BLACK CHERRY': 'BLACK_CHERRY', CHERRY: 'BLACK_CHERRY',
    WN: 'BLACK_WALNUT', 'BLACK WALNUT': 'BLACK_WALNUT',
    BASS: 'BASSWOOD', BASSWOOD: 'BASSWOOD',
    HK: 'HICKORY', 'SHAGBARK HICKORY': 'HICKORY', HICKORY: 'HICKORY',
    BEECH: 'BEECH',
    BIRCH: 'BIRCH', 'YELLOW BIRCH': 'YELLOW_BIRCH',
    LOCUST: 'LOCUST', CUC: 'CUCUMBER', CUCUMBER: 'CUCUMBER'
};

function normalizeSpecies(raw) {
    if (!raw) return null;
    const key = String(raw).trim().toUpperCase();
    return SPECIES_CODE_MAP[key] || null;
}

// Canonical display name for a raw species code/name; falls back to a
// title-cased version of the raw value when it isn't in the species map.
function displaySpeciesName(raw) {
    if (!raw) return 'Hardwood';
    const key = normalizeSpecies(raw);
    return SPECIES_DISPLAY_NAME[key] || String(raw).toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// Smalian's formula: average of butt/top cross-sectional area x length.
function cubicVolumeFt3(buttDiaIn, topDiaIn, lengthFt) {
    const areaFt2 = d => Math.PI / 4 * (d / 12) ** 2;
    return (areaFt2(buttDiaIn) + areaFt2(topDiaIn)) / 2 * lengthFt;
}

// Values a segment as a weight-priced product (peeler/scrag) instead of a
// graded sawlog. Returns an ineligible result (value 0, reason set) rather
// than throwing, so a mismatched product choice just teaches a $0 lesson.
function scoreAsProduct(product, buttDiaIn, topDiaIn, lengthFt, species) {
    const spec = PRODUCT_SPECS[product];
    const speciesKey = normalizeSpecies(species);

    if (spec.eligibleSpecies && !spec.eligibleSpecies.includes(speciesKey)) {
        return { grade: spec.label, pricePerBF: 0, value: 0, ineligible: true,
                 reason: `${displaySpeciesName(species)} is not accepted as ${spec.label} in this market.` };
    }
    if (topDiaIn < spec.minSED || (spec.maxSED && topDiaIn > spec.maxSED)) {
        return { grade: spec.label, pricePerBF: 0, value: 0, ineligible: true,
                 reason: `Small-end diameter ${topDiaIn.toFixed(1)}" is outside the ${spec.minSED}"${spec.maxSED ? '-' + spec.maxSED + '"' : '"+'} range for ${spec.label}.` };
    }

    const density = SPECIES_DENSITY[speciesKey] ?? SPECIES_DENSITY.DEFAULT;
    const volumeFt3 = cubicVolumeFt3(buttDiaIn, topDiaIn, lengthFt);
    const tons = (volumeFt3 * density) / 2000;
    const value = Math.round(tons * spec.pricePerTon);

    return { grade: spec.label, pricePerBF: null, value, tons: +tons.toFixed(2), ineligible: false };
}

// ─── Sweep Deduction Rule ─────────────────────────────────────────────────
// AHMI rule: Diameter rule = Gross Sweep / 4; Length rule = Gross Sweep / 3
// Options: 'diameter' or 'length'. Deductions that round down to zero are ignored.
const SWEEP_RULE = 'diameter';

// ─── Stem Datasets ──────────────────────────────────────────────────────────
// HW Buck and synthetic stems share the game schema. Mill-study stems are
// normalized below because their source file retains the reconstruction model.
let realTrees = [];
let selectedDataset = 'millstudy';
let usedTreeIndices = new Set(); // avoid repeating trees within a session

function normalizeMillStudyStem(stem) {
    const defects = [];
    const shapeDefects = stem.meta?.shapeDefects || [];
    shapeDefects.forEach(defect => {
        const startFt = defect.startHeightFt;
        const endFt = Math.min(stem.length, startFt + defect.lengthFt);
        if (endFt <= startFt) return;
        defects.push({
            type: 'sweep',
            label: defect.type === 'crook' ? 'Crook' : 'Sweep',
            color: defect.type === 'crook' ? COLORS.defect.seam : COLORS.defect.sweep,
            facePenalty: 1,
            startFt,
            endFt,
            widthIn: defect.displacementIn,
            facesAffected: [0],
        });
    });

    const qualityDefects = stem.meta?.qualityDefects || [];
    qualityDefects.forEach(defect => {
        const startFt = defect.startHeightFt;
        const endFt = Math.min(stem.length, startFt + defect.lengthFt);
        if (endFt <= startFt) return;
        defects.push({
            type: 'seam',
            label: defect.type[0].toUpperCase() + defect.type.slice(1),
            color: COLORS.defect.seam,
            facePenalty: 1,
            startFt,
            endFt,
            facesAffected: [0, 1, 2, 3],
        });
    });

    const millDefectProjections = stem.meta?.millDefectProjections || [];
    millDefectProjections.forEach(projection => {
        const startFt = Math.max(0, projection.segStartHeightFt);
        const endFt = Math.min(stem.length, projection.segEndHeightFt);
        if (endFt <= startFt) return;

        const projectedSides = projection.projectedSides || projection.sides || {};
        Object.entries(projectedSides).forEach(([sideName, sideDefects]) => {
            const face = Number(sideName.replace('side', '')) - 1;
            if (face < 0 || face > 3) return;

            const zones = sideDefects?.mergedZones || [];
            if (zones.length > 0) {
                zones.forEach(zone => {
                    const zoneStartFt = startFt + Math.max(0, Number(zone.zoneStartIn) || 0) / 12;
                    const zoneEndFt = startFt + Math.min(
                        (Number(projection.segmentLengthFt) || (endFt - startFt)) * 12,
                        Number(zone.zoneEndIn) || 0,
                    ) / 12;
                    if (zoneEndFt <= zoneStartFt) return;
                    defects.push({
                        type: 'seam',
                        label: `Mill defect${zone.memberDefectCount > 1 ? 's' : ''} (${zone.memberDefectCount || 1})`,
                        color: COLORS.defect.millDefect,
                        facePenalty: 1,
                        startFt: zoneStartFt,
                        endFt: Math.min(endFt, zoneEndFt),
                        facesAffected: [face],
                    });
                });
                return;
            }

            // Compatibility with the previous count-only projection schema.
            const counts = sideDefects?.defectCounts || sideDefects || {};
            const total = ['le3in', '3to6in', 'gt6in']
                .map(size => Number(counts[size]) || 0)
                .reduce((sum, count) => sum + count, 0);
            if (total > 0) {
                defects.push({
                    type: 'seam',
                    label: `Mill defects (${total})`,
                    color: COLORS.defect.millDefect,
                    facePenalty: 1,
                    startFt,
                    endFt,
                    facesAffected: [face],
                });
            }
        });
    });

    // Real diameter-at-height samples and sweep centerline offsets, carried
    // through so the 3D viewer can build actual taper/bend geometry instead
    // of a straight-line interpolation between butt and top diameter.
    const profile = (stem.profile || []).map(p => ({ h: p.heightFt, d: p.diameterIn }));
    const sweepCurve = [];
    (stem.meta?.shapeDefects || []).forEach(def => {
        (def.curvePoints || []).forEach(cp => sweepCurve.push({ h: cp.heightFt, off: cp.lateralOffsetIn }));
    });
    // Adjacent shape-defects repeat the boundary height; drop the duplicate.
    const sweepCurveDeduped = sweepCurve.filter((p, i) => i === 0 || Math.abs(p.h - sweepCurve[i - 1].h) > 1e-6);

    return {
        treeNum: stem.stemId,
        species: stem.species,
        stemType: stem.stemType,
        length: stem.length,
        butt: stem.butt,
        top: stem.top ?? stem.profile?.[stem.profile.length - 1]?.diameterIn ?? stem.butt,
        defects,
        profile,
        sweepCurve: sweepCurveDeduped,
    };
}

function getDatasetTrees(allTrees, millStudy) {
    if (selectedDataset === 'millstudy') return millStudy.stems.map(normalizeMillStudyStem);
    const isSynthetic = selectedDataset === 'synthetic';
    return allTrees.filter(tree => (tree.treeNum >= 1001) === isSynthetic);
}

function updateDatasetStatus() {
    const status = document.getElementById('datasetStatus');
    if (status) status.textContent = `${realTrees.length} stems available`;
}

function pickLog() {
    if (realTrees.length === 0) return generateLog(); // fallback
    // Avoid repeats until all trees have been used
    if (usedTreeIndices.size >= realTrees.length) usedTreeIndices.clear();
    let idx;
    do { idx = Math.floor(Math.random() * realTrees.length); }
    while (usedTreeIndices.has(idx));
    usedTreeIndices.add(idx);
    return realTrees[idx];
}

// ─── Random Log Generator (fallback when trees.json unavailable) ───────────
function generateLog() {
    const lengths  = [24, 28, 32, 36, 40, 44, 48];
    const buttDias = [14, 16, 18, 20, 22, 24, 26];
    const tapers   = [3, 4, 5, 6, 7, 8];
    const length = lengths [Math.floor(Math.random() * lengths.length)];
    const butt   = buttDias[Math.floor(Math.random() * buttDias.length)];
    const taper  = tapers  [Math.floor(Math.random() * tapers.length)];
    const top    = Math.max(6, butt - taper);
    return { length, butt, top };
}

// ─── Random Defect Generator (fallback) ───────────────────────────────────
const DEFECT_POOL = [
    { type: 'knot_cluster', label: 'Knots', color: COLORS.defect.knot, minLen: 2, maxLen: 5,  weight: 3, facePenalty: 1 },
    { type: 'seam',         label: 'Seam',  color: COLORS.defect.seam,  minLen: 3, maxLen: 8,  weight: 3, facePenalty: 1 },
    { type: 'sweep',        label: 'Sweep', color: COLORS.defect.sweep, minLen: 4, maxLen: 10, weight: 2, facePenalty: 1 },
    { type: 'rot',          label: 'Rot',   color: COLORS.defect.rot,   minLen: 2, maxLen: 4,  weight: 1, facePenalty: 2 },
];

function generateDefects(logLength) {
    const defects    = [];
    const numDefects = Math.floor(Math.random() * 4) + 1;
    const totalW     = DEFECT_POOL.reduce((s, d) => s + d.weight, 0);

    function pickType() {
        let r = Math.random() * totalW;
        for (const d of DEFECT_POOL) { r -= d.weight; if (r <= 0) return d; }
        return DEFECT_POOL[DEFECT_POOL.length - 1];
    }

    for (let i = 0; i < numDefects; i++) {
        const t          = pickType();
        const len        = t.minLen + Math.random() * (t.maxLen - t.minLen);
        const startFt    = 2 + Math.random() * (logLength - len - 4);
        const numFaces   = Math.floor(Math.random() * 4) + 1;
        const available  = [0, 1, 2, 3];
        const facesAffected = [];
        for (let j = 0; j < numFaces; j++) {
            const idx = Math.floor(Math.random() * available.length);
            facesAffected.push(available.splice(idx, 1)[0]);
        }
        defects.push({
            type: t.type, label: t.label, color: t.color, facePenalty: t.facePenalty,
            startFt, endFt: startFt + len, facesAffected
        });
    }
    return defects;
}

// ─── Load a Log ────────────────────────────────────────────────────────────
function loadLog(logObj) {
    currentTree    = logObj;
    totalLength    = logObj.length;
    buttDia        = logObj.butt;
    topDia         = logObj.top;
    cuts           = [];
    pieceProduct   = [];
    logRotation    = 0;
    currentDefects = logObj.defects || generateDefects(totalLength);

    const displaySpecies = displaySpeciesName(logObj.species);
    document.getElementById('logDesc').textContent =
        `${displaySpecies} (${logObj.treeNum})${logObj.stemType ? ` — ${logObj.stemType}` : ''} — ${totalLength}ft  |  Butt: ${buttDia}"  |  Top: ${topDia}"`;
    document.getElementById('logCounter').textContent =
        `Stem ${currentLogIndex + 1} of ${TOTAL_LOGS}`;
    document.getElementById('nextLog').style.display   = 'none';
    document.getElementById('nextLog').textContent     = 'Next Stem →';
    document.getElementById('scoreLog').style.display  = 'inline-block';
    document.getElementById('segments').innerHTML      = '';
    document.getElementById('finalScore').style.display = 'none';
    const optContainer = document.getElementById('optContainer');
    if (optContainer) optContainer.style.display = 'none';

    buildDefectLegend();
    resizeCanvases();
    drawLog();
    updateRotationDisplay();
}

// ─── Defect Legend ─────────────────────────────────────────────────────────
function buildDefectLegend() {
    const count = currentDefects.length;
    let inner = '';
    currentDefects.forEach(d => {
        let penaltyNote;
        if (d.type === 'sweep') {
            const deduction = (d.widthIn > 0) ? d.widthIn : 1;
            penaltyNote = `−${deduction}" dia.`;
        } else if (d.type === 'end_check') {
            penaltyNote = `−${formatFeetInches(d.endFt - d.startFt)} length`;
        } else {
            const n = d.facesAffected.length;
            penaltyNote = `−${n} face${n !== 1 ? 's' : ''}`;
        }
        inner += `<span style="background:${d.color}; color:white; padding:2px 8px;
                  border-radius:4px; margin:2px; display:inline-flex; align-items:center; gap:4px;">
                  ${d.label} ${formatFeetInches(d.startFt)}–${formatFeetInches(d.endFt)}
                  (${penaltyNote})
                  ${makeFaceIndicator(d.facesAffected, d.color)}
                  </span>`;
    });
    const html = `<details style="margin:6px 0 12px; font-size:13px; text-align:left;">
        <summary style="cursor:pointer; font-weight:bold; color:${COLORS.wvuBlue};">&#9432; Defects on this stem (${count})</summary>
        <div style="margin-top:6px;">${inner}</div>
    </details>`;
    document.getElementById('defectLegend').innerHTML = html;
}

// ─── Rotation Display ──────────────────────────────────────────────────────
function updateRotationDisplay() {
    const el = document.getElementById('rotLabel');
    if (el) el.textContent = `Face ${logRotation + 1} on Top`;
}

// ─── Canvas Setup ──────────────────────────────────────────────────────────
const canvas        = document.getElementById('logCanvas');
const ctx           = canvas.getContext('2d');
const stem3dCanvas  = document.getElementById('stem3dCanvas');
const optCanvas     = document.getElementById('optCanvas');
const optCtx        = optCanvas    ? optCanvas.getContext('2d')    : null;
const faceCanvas    = document.getElementById('faceCanvas');
const faceCtx       = faceCanvas   ? faceCanvas.getContext('2d')   : null;
const optFaceCanvas = document.getElementById('optFaceCanvas');
const optFaceCtx    = optFaceCanvas ? optFaceCanvas.getContext('2d') : null;

function getScale(cvs = canvas) { return cvs.width / totalLength; }
function getTrim()  {
    const val = parseFloat(document.getElementById('trimInput').value);
    return isNaN(val) ? 0.25 : val / 12;
}

// ─── Responsive Canvas Resize ───────────────────────────────────────────────
let _resizeTimer = null;
function resizeCanvases() {
    if (!totalLength) return;
    const container = document.querySelector('.container');
    const w = Math.min(800, container.clientWidth - 4);

    canvas.width      = w;
    canvas.height     = Math.max(160, Math.round(w * 200 / 800));
    faceCanvas.width  = w;
    faceCanvas.height = Math.max(72, Math.round(w * 88 / 800));

    stem3dCanvas.width  = w;
    stem3dCanvas.height = canvas.height;
    resizeStem3D();

    if (optCanvas && document.getElementById('optContainer').style.display !== 'none') {
        optCanvas.width      = w;
        optCanvas.height     = Math.max(160, Math.round(w * 200 / 800));
        optFaceCanvas.width  = w;
        optFaceCanvas.height = Math.max(72, Math.round(w * 88 / 800));
    } else if (optCanvas) {
        optCanvas.width      = w;
        optCanvas.height     = Math.max(160, Math.round(w * 200 / 800));
        optFaceCanvas.width  = w;
        optFaceCanvas.height = Math.max(72, Math.round(w * 88 / 800));
    }
}
window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => { resizeCanvases(); drawLog(); }, 150);
});

// ─── Draw Log ──────────────────────────────────────────────────────────────
// redrawCanvases: redraws both canvases without touching the segments panel —
// safe to call from rotation handlers after scoring so score text is preserved.
function redrawCanvases() {
    if (viewMode === '3d') {
        updateStem3D();
    } else {
        drawLogGraphic(ctx, canvas, cuts);
        drawHoverGuide(ctx, canvas);
    }
    drawFaceMap(faceCtx, faceCanvas, currentDefects, cuts);
}

// ─── Hover Guide (2D) ───────────────────────────────────────────────────────
// A precise dashed line at the exact snapped position a click would cut —
// the chainsaw icon alone doesn't pin down a location clearly enough, so
// this line (not the icon) is the thing to actually read before clicking.
let hoverFt = null;
function drawHoverGuide(context, can) {
    if (hoverFt === null || !totalLength) return;
    if (cuts.some(c => Math.abs(c - hoverFt) < 0.08)) return; // a real cut marker already covers this spot
    const scale = getScale(can);
    const Hs = can.height / 200;
    const x = hoverFt * scale;

    context.save();
    context.setLineDash([5, 4]);
    context.strokeStyle = 'rgba(0,40,85,0.6)';
    context.lineWidth = Math.max(1.5, 2 * Hs);
    context.beginPath();
    context.moveTo(x, 20 * Hs); context.lineTo(x, 180 * Hs);
    context.stroke();
    context.restore();

    const dia = buttDia - (buttDia - topDia) * (hoverFt / totalLength);
    const label = `${formatFeetInches(hoverFt)}  |  ⌀ ${dia.toFixed(1)}"`;
    context.font = `bold ${Math.max(9, Math.round(12 * Hs))}px Arial`;
    context.textAlign = 'center';
    context.lineWidth = Math.max(2, 3 * Hs);
    context.strokeStyle = '#fff';
    context.strokeText(label, x, 15 * Hs);
    context.fillStyle = COLORS.wvuBlue;
    context.fillText(label, x, 15 * Hs);
}

function drawLog() {
    redrawCanvases();
    updateSegments();
}

// ─── Face SVG Indicator (4-quadrant badge for legend) ──────────────────────
function makeFaceIndicator(facesAffected, color) {
    const cells = [0, 1, 2, 3].map(f => {
        const fill = facesAffected.includes(f) ? color : '#ddd';
        const col = f % 2, row = Math.floor(f / 2);
        return `<rect x="${col * 10 + 1}" y="${row * 10 + 1}" width="8" height="8" fill="${fill}" rx="1"/>`;
    }).join('');
    return `<svg width="20" height="20" style="vertical-align:middle;margin-left:5px;"
                 title="Highlighted quadrants = affected faces">
        <rect width="20" height="20" fill="${COLORS.wvuCloud}" rx="2" stroke="${COLORS.wvuFog}" stroke-width="0.5"/>
        ${cells}
        <line x1="10" y1="0" x2="10" y2="20" stroke="${COLORS.wvuFog}" stroke-width="0.5"/>
        <line x1="0"  y1="10" x2="20" y2="10" stroke="${COLORS.wvuFog}" stroke-width="0.5"/>
    </svg>`;
}

// ─── Draw Face Map Canvas ───────────────────────────────────────────────────
function drawFaceMap(context, can, defects, cutsList) {
    if (!context || !can) return;
    context.clearRect(0, 0, can.width, can.height);

    const scale      = can.width / totalLength;
    const tickH      = Math.round(can.height * 20 / 88);
    const laneH      = Math.floor((can.height - tickH) / 4);
    // Lane 0 = top (face at logRotation), lane 3 = bottom
    const dirLabels  = ['\u25b2 Top', '\u25b6 Right', '\u25bc Bot', '\u25c4 Left'];
    const laneColors = [COLORS.wvuSky, COLORS.wvuCloud, COLORS.wvuSky, COLORS.wvuCloud];
    const laneFontSz = Math.max(8, Math.round(can.height / 8.8));
    const tickFontSz = Math.max(7, Math.round(can.height / 10));

    // Lane backgrounds + labels
    for (let lane = 0; lane < 4; lane++) {
        const absoluteFace = (lane + logRotation) % 4;
        const y = tickH + lane * laneH;
        context.fillStyle = laneColors[lane];
        context.fillRect(0, y, can.width, laneH);

        context.strokeStyle = COLORS.wvuFog;
        context.lineWidth   = 0.5;
        context.beginPath();
        context.moveTo(0, y); context.lineTo(can.width, y);
        context.stroke();

        context.fillStyle  = COLORS.wvuBlue;
        context.font       = `bold ${laneFontSz}px Arial`;
        context.textAlign  = 'left';
        const laneLabel = `F${absoluteFace + 1} ${dirLabels[lane]}`;
        context.fillText(laneLabel, 4, y + laneH / 2 + Math.round(laneFontSz * 0.35));
    }
    // Bottom border
    context.strokeStyle = COLORS.wvuFog;
    context.lineWidth   = 0.5;
    context.beginPath();
    context.moveTo(0, tickH + 4 * laneH); context.lineTo(can.width, tickH + 4 * laneH);
    context.stroke();

    // Defect blocks
    defects.forEach(d => {
        const x1 = d.startFt * scale;
        const x2 = d.endFt   * scale;
        d.facesAffected.forEach(f => {
            const lane = (f - logRotation + 4) % 4;
            const y = tickH + lane * laneH;
            context.globalAlpha = 0.78;
            context.fillStyle   = d.color;
            context.fillRect(x1, y + 2, x2 - x1, laneH - 4);
            context.globalAlpha = 1.0;

            const blockW = x2 - x1;
            if (blockW > 14) {
                context.font      = `bold ${Math.max(7, Math.round(laneFontSz * 0.9))}px Arial`;
                context.textAlign = 'center';
                context.fillStyle = '#fff';
                const fullLabel  = d.label;
                const shortLabel = fullLabel.substring(0, 4);
                const label = blockW > 38 ? fullLabel : blockW > 18 ? shortLabel : fullLabel.charAt(0);
                context.fillText(label, (x1 + x2) / 2, y + laneH / 2 + Math.round(laneFontSz * 0.3));
            }
        });
    });

    // Foot-tick marks at top
    const spacing2ft = can.width / totalLength * 2;
    const labelStep  = spacing2ft < 22 ? 4 : 2;
    for (let i = 0; i <= totalLength; i += 2) {
        const x = i * scale;
        context.strokeStyle = COLORS.wvuBlue;
        context.lineWidth   = 1;
        context.beginPath();
        context.moveTo(x, Math.round(tickH * 0.25)); context.lineTo(x, tickH - 2);
        context.stroke();
        if (i % labelStep === 0) {
            context.fillStyle  = COLORS.wvuBlue;
            context.font       = `${tickFontSz}px Arial`;
            context.textAlign  = 'center';
            context.fillText(i.toString(), x, Math.round(tickH * 0.65));
        }
    }
    // "ft" unit hint at right end of tick row
    context.fillStyle = 'rgba(0,40,85,0.5)';
    context.font      = `italic ${Math.max(6, tickFontSz - 1)}px Arial`;
    context.textAlign = 'right';
    context.fillText('ft', can.width - 2, Math.round(tickH * 0.65));

    // Cut markers (dashed red lines)
    if (cutsList && cutsList.length > 0) {
        context.setLineDash([3, 3]);
        context.strokeStyle = `rgba(${hexToRgb(COLORS.feedback.error)}, 0.85)`;
        context.lineWidth   = 2;
        cutsList.forEach(cut => {
            const x = cut * scale;
            context.beginPath();
            context.moveTo(x, tickH); context.lineTo(x, can.height);
            context.stroke();
        });
        context.setLineDash([]);
    }
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : null;
}

// Helper to format decimal feet into feet and inches string (e.g., 8.5 -> 8' 6")
function formatFeetInches(decimalFeet) {
    if (typeof decimalFeet !== 'number' || !isFinite(decimalFeet)) return '';
    if (decimalFeet < 1/24) return `0"`; // Less than half an inch

    const totalInches = decimalFeet * 12;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches % 12);

    if (inches === 12) return `${feet + 1}'`;

    const parts = [];
    if (feet > 0) parts.push(`${feet}'`);
    if (inches > 0) parts.push(`${inches}"`);

    return parts.length > 0 ? parts.join(' ') : `0"`;
}

function getCrookOffset(ft, pxPerIn) {
    let offset = 0;
    currentDefects.forEach(d => {
        if (d.type !== 'sweep' || ft < d.startFt || ft > d.endFt) return;
        const span = Math.max(0.01, d.endFt - d.startFt);
        const progress = (ft - d.startFt) / span;
        const profile = Math.sin(progress * Math.PI);
        const face = d.facesAffected && d.facesAffected.length > 0 ? d.facesAffected[0] : 0;
        const visualFace = (face - logRotation + 4) % 4;
        const direction = FACE_Y_FRAC[visualFace] / 0.62;
        const magnitude = d.widthIn > 0 ? d.widthIn : 1;
        offset += direction * magnitude * pxPerIn * profile;
    });
    return offset;
}

function drawLogGraphic(context, can, cutsList) {
    context.clearRect(0, 0, can.width, can.height);
    const scale   = getScale(can);
    const Hs      = can.height / 200;
    const yCenter = 100 * Hs;
    const pxPerIn = 1.5 * Hs;

    // Build taper points
    const points = [];
    for (let ft = 0; ft <= totalLength; ft++) {
        const frac     = ft / totalLength;
        const diaIn    = buttDia - (buttDia - topDia) * frac;
        const radiusPx = (diaIn / 2) * pxPerIn;
        points.push({ x: ft * scale, radiusPx, centerOffset: getCrookOffset(ft, pxPerIn) });
    }

    // Per-face defect colors (used across drawing steps)
    const faceDefColors = [null, null, null, null];
    currentDefects.forEach(d => { d.facesAffected.forEach(f => { faceDefColors[f] = d.color; }); });

    // ── 3D face bands: 4 shaded zones that shift with rotation ──────────────
    // Each band spans 1/4 of the cylinder's projected height.
    // Boundaries at ±1/√2 ≈ ±0.707 of radius (where adjacent quadrants meet on a circle).
    const SQ2 = Math.SQRT2;
    const bandTopFrac = [-1.0,  -1/SQ2, 0,      1/SQ2];
    const bandBotFrac = [-1/SQ2, 0,     1/SQ2,  1.0  ];
    // Top face lit, bottom face in shadow
    const bandShade   = ['#D0CCBA', '#AEAB9A', '#8E8B7E', '#6E6B62'];

    for (let vf = 0; vf < 4; vf++) {
        const absF = (vf + logRotation) % 4;
        const t = bandTopFrac[vf], b = bandBotFrac[vf];

        // Base shade for this visual face
        context.beginPath();
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (i === 0) context.moveTo(p.x, yCenter + p.centerOffset + t * p.radiusPx);
            else         context.lineTo(p.x, yCenter + p.centerOffset + t * p.radiusPx);
        }
        for (let i = points.length - 1; i >= 0; i--) {
            context.lineTo(points[i].x, yCenter + points[i].centerOffset + b * points[i].radiusPx);
        }
        context.closePath();
        context.fillStyle = bandShade[vf];
        context.fill();

        // Subtle defect-color tint over this band if that face has a defect
        if (faceDefColors[absF]) {
            context.beginPath();
            for (let i = 0; i < points.length; i++) {
                const p = points[i];
                if (i === 0) context.moveTo(p.x, yCenter + p.centerOffset + t * p.radiusPx);
                else         context.lineTo(p.x, yCenter + p.centerOffset + t * p.radiusPx);
            }
            for (let i = points.length - 1; i >= 0; i--) {
                context.lineTo(points[i].x, yCenter + points[i].centerOffset + b * points[i].radiusPx);
            }
            context.closePath();
            context.globalAlpha = 0.15;
            context.fillStyle   = faceDefColors[absF];
            context.fill();
            context.globalAlpha = 1.0;
        }
    }

    // Subtle separator lines between face bands
    context.setLineDash([]);
    for (let vf = 0; vf < 3; vf++) {
        context.beginPath();
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (i === 0) context.moveTo(p.x, yCenter + p.centerOffset + bandBotFrac[vf] * p.radiusPx);
            else         context.lineTo(p.x, yCenter + p.centerOffset + bandBotFrac[vf] * p.radiusPx);
        }
        context.strokeStyle = 'rgba(0,0,0,0.22)';
        context.lineWidth   = Math.max(0.5, 1 * Hs);
        context.stroke();
    }

    // Specular highlight along the top edge
    context.beginPath();
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (i === 0) context.moveTo(p.x, yCenter + p.centerOffset - p.radiusPx);
        else         context.lineTo(p.x, yCenter + p.centerOffset - p.radiusPx);
    }
    for (let i = points.length - 1; i >= 0; i--) {
        context.lineTo(points[i].x, yCenter + points[i].centerOffset - points[i].radiusPx + Math.max(3, 5 * Hs));
    }
    context.closePath();
    const hlGrad = context.createLinearGradient(0, yCenter - points[0].radiusPx, 0, yCenter);
    hlGrad.addColorStop(0,   'rgba(255,255,255,0.58)');
    hlGrad.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    hlGrad.addColorStop(1,   'rgba(255,255,255,0)');
    context.fillStyle = hlGrad;
    context.fill();

    // Log outline drawn on top of fill so edges are crisp
    context.strokeStyle = COLORS.barkBrown;
    context.lineWidth   = Math.max(2.5, 5 * Hs);
    context.lineCap     = 'round';
    context.lineJoin    = 'round';
    context.beginPath();
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (i === 0) context.moveTo(p.x, yCenter + p.centerOffset - p.radiusPx);
        else         context.lineTo(p.x, yCenter + p.centerOffset - p.radiusPx);
    }
    context.stroke();
    context.beginPath();
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (i === 0) context.moveTo(p.x, yCenter + p.centerOffset + p.radiusPx);
        else         context.lineTo(p.x, yCenter + p.centerOffset + p.radiusPx);
    }
    context.stroke();

    // ── Butt end cap with end-grain rings ─────────────────────────────────
    const buttRpx = points[0].radiusPx;
    const capW    = Math.max(6, 12 * Hs);  // depth of the end cap
    context.save();
    context.beginPath();
    context.ellipse(0, yCenter, capW, buttRpx, 0, 0, Math.PI * 2);
    context.clip();
    // Concentric rings (light outside → dark heartwood center)
    for (let ri = 8; ri >= 1; ri--) {
        const fr = ri / 8;
        const r  = Math.round(100 + fr * 60), g = Math.round(70 + fr * 40), b = Math.round(30 + fr * 20);
        context.beginPath();
        context.ellipse(0, yCenter, capW * fr, buttRpx * fr, 0, 0, Math.PI * 2);
        context.fillStyle = `rgb(${r},${g},${b})`;
        context.fill();
        context.strokeStyle = 'rgba(0,0,0,0.12)';
        context.lineWidth   = Math.max(0.5, 1 * Hs);
        context.stroke();
    }
    // Heartwood dot
    context.beginPath();
    context.ellipse(0, yCenter, capW * 0.18, buttRpx * 0.18, 0, 0, Math.PI * 2);
    context.fillStyle = '#4a2008';
    context.fill();
    context.restore();
    // Cap border
    context.beginPath();
    context.ellipse(0, yCenter, capW, buttRpx, 0, 0, Math.PI * 2);
    context.strokeStyle = COLORS.barkBrown;
    context.lineWidth   = Math.max(1.5, 3 * Hs);
    context.stroke();

    // ── End-view indicator (bottom-right corner) ─────────────────────────────
    const evR = Math.min(22 * Hs, can.height * 0.13);
    const evX = can.width - evR - 8 * Hs;
    const evY = can.height - evR - 8 * Hs;
    for (let f = 0; f < 4; f++) {
        const vf = (f - logRotation + 4) % 4;
        const sa = vf * Math.PI / 2 - 3 * Math.PI / 4;
        const ea = vf * Math.PI / 2 - Math.PI / 4;
        context.beginPath();
        context.moveTo(evX, evY);
        context.arc(evX, evY, evR, sa, ea);
        context.closePath();
        context.globalAlpha = faceDefColors[f] ? 0.82 : 0.55;
        context.fillStyle   = faceDefColors[f] || COLORS.wvuSlate;
        context.fill();
        context.globalAlpha = 1.0;
        context.strokeStyle = '#555';
        context.lineWidth   = 1;
        context.stroke();
        const la = vf * Math.PI / 2 - Math.PI / 2;
        context.font         = `bold ${Math.max(7, Math.round(9 * Hs))}px sans-serif`;
        context.textAlign    = 'center';
        context.textBaseline = 'middle';
        context.fillStyle    = faceDefColors[f] ? '#fff' : COLORS.wvuSlate;
        context.fillText((f + 1).toString(), evX + Math.cos(la) * evR * 0.6, evY + Math.sin(la) * evR * 0.6);
    }
    context.textBaseline = 'alphabetic';
    context.beginPath();
    context.arc(evX, evY, evR, 0, Math.PI * 2);
    context.strokeStyle = COLORS.wvuSlate;
    context.lineWidth   = Math.max(1.5, 2 * Hs);
    context.stroke();
    context.font        = `bold ${Math.max(8, Math.round(10 * Hs))}px Arial`;
    context.textAlign   = 'center';
    context.fillStyle   = COLORS.wvuBlue;
    context.strokeStyle = '#fff';
    context.lineWidth   = Math.max(1, 2 * Hs);
    const arrowY = evY - evR - 3 * Hs;
    context.strokeText('\u25b2', evX, arrowY);
    context.fillText('\u25b2', evX, arrowY);

    // Draw defects
    drawDefects(context, currentDefects, scale, yCenter, pxPerIn);

    // Foot ticks
    context.strokeStyle = '#000';
    context.lineWidth   = Math.max(1, 2 * Hs);
    const spacing2ft    = can.width / totalLength * 2;
    const labelStep     = spacing2ft < 22 ? 4 : 2;
    for (let i = 0; i <= totalLength; i += 2) {
        const x = i * scale;
        context.beginPath();
        context.moveTo(x, 65 * Hs); context.lineTo(x, 80 * Hs);
        context.stroke();
        if (i % labelStep === 0) {
            context.fillStyle  = '#000';
            context.font       = `${Math.max(8, Math.round(12 * Hs))}px sans-serif`;
            context.textAlign  = 'center';
            context.fillText(i + "'", x, 60 * Hs);
        }
    }
    // Length axis label
    context.fillStyle = '#888';
    context.font      = `italic ${Math.max(7, Math.round(9 * Hs))}px Arial`;
    context.textAlign = 'left';
    context.fillText('length (ft)', 3, Math.max(9, Math.round(53 * Hs)));

    // Diameter labels
    const interval = Math.floor(totalLength / 4);
    const labelFts = [0, 1, 2, 3, 4].map(i => Math.min(i * interval, totalLength));
    labelFts.forEach((ft, idx) => {
        const frac     = ft / totalLength;
        const diaIn    = Math.round((buttDia - (buttDia - topDia) * frac) * 10) / 10;
        const x        = ft * scale;
        const radiusPx = (diaIn / 2) * pxPerIn;
        const isLast   = idx === labelFts.length - 1;

        context.strokeStyle = '#fff';
        context.lineWidth   = Math.max(1, 3 * Hs);
        context.beginPath();
        context.moveTo(x, yCenter - radiusPx - 12 * Hs);
        context.lineTo(x, yCenter + radiusPx + 28 * Hs);
        context.stroke();

        const fontSize  = Math.max(10, Math.round(16 * Hs));
        context.font        = `bold ${fontSize}px sans-serif`;
        context.textAlign   = isLast ? 'right' : 'left';
        const labelX    = isLast ? x - 6 * Hs : x + 6 * Hs;
        context.strokeStyle = '#fff';
        context.lineWidth   = Math.max(1, 3 * Hs);
        context.strokeText(diaIn + '"', labelX, yCenter + 35 * Hs);
        context.fillStyle   = '#000';
        context.fillText(diaIn + '"', labelX, yCenter + 35 * Hs);
    });
    // Diameter axis label — left side, after the butt cap, away from the end-view indicator
    const capWForLabel = Math.max(6, 12 * Hs);
    context.fillStyle = '#888';
    context.font      = `italic ${Math.max(7, Math.round(9 * Hs))}px Arial`;
    context.textAlign = 'left';
    context.fillText('diameter (in)', capWForLabel + 8 * Hs, yCenter + Math.round(47 * Hs));

    // Cut markers
    cutsList.forEach(cut => {
        const x = cut * scale;
        context.strokeStyle = COLORS.feedback.error;
        context.lineWidth   = Math.max(3, 6 * Hs);
        context.lineCap     = 'round';
        context.beginPath();
        context.moveTo(x, 45 * Hs); context.lineTo(x, 155 * Hs);
        context.stroke();

        const cutFontSz = Math.max(9, Math.round(13 * Hs));
        context.font        = `bold ${cutFontSz}px Arial`;
        context.textAlign   = 'center';
        context.strokeStyle = COLORS.feedback.error;
        context.lineWidth   = 1.5;
        context.strokeText(formatFeetInches(cut), x, 42 * Hs);
        context.fillStyle   = '#fff';
        context.fillText(formatFeetInches(cut), x, 42 * Hs);
    });

    // Butt / top orientation labels: BUTT at bottom-left (clear of indicator);
    // TOP at top-right on the same row as "length (ft)", clear of the bottom-right indicator.
    const endFontSz = Math.max(7, Math.round(9 * Hs));
    context.font      = `bold ${endFontSz}px sans-serif`;
    context.fillStyle = '#777';
    context.textAlign = 'left';
    context.fillText('◄ BUTT', 5, can.height - 4);
    context.textAlign = 'right';
    context.fillText('TOP ►', can.width - 3, Math.max(9, Math.round(53 * Hs)));
}

// ─── Draw Defects ──────────────────────────────────────────────────────────
// Visual face 0=top, 1=front-right, 2=back-left, 3=bottom.
// Y position center (as fraction of r from log center) per visual face:
const FACE_Y_FRAC = [-0.62, -0.22, 0.22, 0.62];
const FACE_BAND_H = 0.36; // half-band height as fraction of r

function drawDefects(context, defects, scale, yCenter, pxPerIn) {
    const Hs = pxPerIn / 1.5;
    defects.forEach(d => {
        const x1    = d.startFt * scale;
        const x2    = d.endFt   * scale;
        const midFt = (d.startFt + d.endFt) / 2;
        const frac  = midFt / totalLength;
        const dia   = buttDia - (buttDia - topDia) * frac;
        const r     = (dia / 2) * pxPerIn;
        const centerOffset = getCrookOffset(midFt, pxPerIn);

        context.globalAlpha = 0.78;

        d.facesAffected.forEach(face => {
            const vf = (face - logRotation + 4) % 4; // visual position for this face
            const fy = yCenter + centerOffset + FACE_Y_FRAC[vf] * r;
            const fh = FACE_BAND_H * r;

            if (d.type === 'knot_cluster') {
                context.fillStyle = d.color;
                const numKnots = Math.max(2, Math.round((x2 - x1) / 18));
                for (let k = 0; k < numKnots; k++) {
                    const kx = x1 + ((k + 0.5) / numKnots) * (x2 - x1);
                    context.beginPath();
                    context.arc(kx, fy, Math.max(3, 5 * Hs), 0, Math.PI * 2);
                    context.fill();
                }
            } else if (d.type === 'rot') {
                context.fillStyle = d.color;
                context.fillRect(x1, fy - fh, x2 - x1, fh * 2);
            } else if (d.type === 'seam') {
                context.strokeStyle = d.color;
                context.lineWidth   = Math.max(2, 4 * Hs);
                context.beginPath();
                context.moveTo(x1, fy);
                context.lineTo(x2, fy);
                context.stroke();
            } else if (d.type === 'sweep') {
                context.fillStyle = d.color;
                context.fillRect(x1, fy - fh * 0.4, x2 - x1, fh * 1.2);
            }
        });

        context.globalAlpha = 1.0;

        // Defect label above the log
        const labelFontSz = Math.max(8, Math.round(11 * Hs));
        context.font        = `bold ${labelFontSz}px sans-serif`;
        context.textAlign   = 'center';
        context.strokeStyle = '#fff';
        context.lineWidth   = Math.max(1, 2 * Hs);
        context.strokeText(d.label, (x1 + x2) / 2, yCenter + centerOffset - r - 6 * Hs);
        context.fillStyle   = d.color;
        context.fillText(d.label, (x1 + x2) / 2, yCenter + centerOffset - r - 6 * Hs);
    });
}

// ─── Chainsaw Cursor ────────────────────────────────────────────────────────
// Replaces the plain pointer with a chainsaw icon whenever the mouse is over
// the stem (2D or 3D), tip-down over the cut location — bucking is cutting,
// not clicking, so the cursor plays along.
const chainsawEl = document.getElementById('chainsawCursor');
function showChainsaw(clientX, clientY, engaged) {
    if (!chainsawEl) return;
    chainsawEl.style.left = clientX + 'px';
    chainsawEl.style.top  = clientY + 'px';
    chainsawEl.style.display = 'block';
    chainsawEl.classList.toggle('active', !!engaged);
}
function hideChainsaw() {
    if (chainsawEl) chainsawEl.style.display = 'none';
}

// ─── Mouse Event Handlers (2D view) ────────────────────────────────────────
canvas.addEventListener('mousedown', (e) => {
    if (viewMode !== '2d') return;
    const rect = canvas.getBoundingClientRect();
    const x    = (e.clientX - rect.left) * totalLength / rect.width;

    const idx = cuts.findIndex(c => Math.abs(c - x) < 0.4);
    if (idx !== -1) {
        dragIdx = idx;
    } else {
        const snapX = Math.round(x * 12) / 12; // snap to the nearest inch, matching the DP's grid
        cuts.push(snapX);
        cuts.sort((a, b) => a - b);
        dragIdx = cuts.indexOf(snapX);
        pieceProduct = [];
        drawLog();
    }
});

window.addEventListener('mousemove', (e) => {
    if (viewMode !== '2d') return;
    const rect      = canvas.getBoundingClientRect();
    const relX      = e.clientX - rect.left;
    const relY      = e.clientY - rect.top;
    const overCanvas = relX >= 0 && relX <= rect.width && relY >= 0 && relY <= rect.height;
    const ft        = Math.max(0, Math.min(totalLength, relX * totalLength / rect.width));

    if (dragIdx !== -1) {
        cuts[dragIdx] = Math.round(ft * 12) / 12; // snap to the nearest inch, matching the DP's grid
        hoverFt = null;
        drawLog();
    } else if (overCanvas) {
        const snap = Math.round(ft * 12) / 12;
        if (snap !== hoverFt) { hoverFt = snap; redrawCanvases(); }
    } else if (hoverFt !== null) {
        hoverFt = null;
        redrawCanvases();
    }

    if (overCanvas || dragIdx !== -1) {
        showChainsaw(e.clientX, e.clientY, dragIdx !== -1);
    } else {
        hideChainsaw();
    }

    // Hover tooltip
    const tip = document.getElementById('hoverTooltip');
    if (tip && totalLength) {
        if (overCanvas || dragIdx !== -1) {
            const dia = (buttDia - (buttDia - topDia) * (ft / totalLength));
            tip.textContent    = `${formatFeetInches(ft)} | ⌀ ${dia.toFixed(1)}"`;
            tip.style.display  = 'block';
            tip.style.left     = (e.clientX + 14) + 'px';
            tip.style.top      = (e.clientY - 32) + 'px';
        } else {
            tip.style.display = 'none';
        }
    }
});

canvas.addEventListener('mouseleave', () => {
    const tip = document.getElementById('hoverTooltip');
    if (tip && dragIdx === -1) tip.style.display = 'none';
    if (dragIdx === -1) {
        hideChainsaw();
        if (hoverFt !== null) { hoverFt = null; redrawCanvases(); }
    }
});

// Right-click on a cut marker to remove it
canvas.addEventListener('contextmenu', (e) => {
    if (viewMode !== '2d') return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const ft   = (e.clientX - rect.left) * totalLength / rect.width;
    const idx  = cuts.findIndex(c => Math.abs(c - ft) < 0.6);
    if (idx !== -1) { cuts.splice(idx, 1); pieceProduct = []; drawLog(); }
});

window.addEventListener('mouseup', () => {
    if (viewMode !== '2d') return;
    if (dragIdx !== -1) {
        cuts.sort((a, b) => a - b);
        dragIdx = -1;
        drawLog();
    }
});

// ─── Touch Events ──────────────────────────────────────────────────────────
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const rect  = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x     = (touch.clientX - rect.left) * totalLength / rect.width;

    const idx = cuts.findIndex(c => Math.abs(c - x) < 1.0);
    if (idx !== -1) {
        dragIdx = idx;
    } else {
        const snapX = Math.round(x * 12) / 12; // snap to the nearest inch, matching the DP's grid
        cuts.push(snapX);
        cuts.sort((a, b) => a - b);
        dragIdx = cuts.indexOf(snapX);
        pieceProduct = [];
        drawLog();
    }
}, { passive: false });

window.addEventListener('touchmove', (e) => {
    if (dragIdx === -1) return;
    e.preventDefault();
    const rect  = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x     = (touch.clientX - rect.left) * totalLength / rect.width;
    cuts[dragIdx] = Math.round(Math.max(0, Math.min(totalLength, x)) * 12) / 12; // snap to the nearest inch, matching the DP's grid
    drawLog();
}, { passive: false });

window.addEventListener('touchend', () => {
    if (dragIdx !== -1) {
        cuts.sort((a, b) => a - b);
        dragIdx = -1;
        drawLog();
    }
});

// ─── Log Rotation (Arrow Keys + Buttons) ───────────────────────────────────
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        logRotation = (logRotation - 1 + 4) % 4;
        redrawCanvases();
        updateRotationDisplay();
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        logRotation = (logRotation + 1) % 4;
        redrawCanvases();
        updateRotationDisplay();
    }
});

document.getElementById('rollUp').addEventListener('click', () => {
    logRotation = (logRotation - 1 + 4) % 4;
    redrawCanvases();
    updateRotationDisplay();
});

document.getElementById('rollDown').addEventListener('click', () => {
    logRotation = (logRotation + 1) % 4;
    redrawCanvases();
    updateRotationDisplay();
});

// ─── Sweep Diameter Deduction ──────────────────────────────────────────────
// HW Buck treated sweep/crook (SE type) as a diameter reduction rather than a face
// penalty — it reduces log yield through taper, not by obstructing clear faces.
// We use the actual measured sweep magnitude (widthIn, stored in inches from the
// .def file) as the scaling diameter deduction. Falls back to 1" if widthIn is
// absent (e.g. randomly generated logs that don't carry the real measurement).
/**
 * Apply AHMI sweep deduction to scaling diameter.
 * AHMI Rules: Diameter rule = floor(Gross Sweep / 4); Length rule = floor(Gross Sweep / 3)
 * Deductions that round down to zero are ignored.
 * @param {number} baseDia - Base scaling diameter in inches
 * @param {number} startFt - Start of log segment in feet
 * @param {number} endFt - End of log segment in feet
 * @param {array} defects - Array of defect objects
 * @param {string} rule - 'diameter' or 'length' (uses SWEEP_RULE if not provided)
 * @returns {number} Adjusted diameter, minimum 6 inches
 */
function applySweepDeduction(baseDia, startFt, endFt, defects, rule = SWEEP_RULE) {
    let dia = baseDia;
    defects.forEach(d => {
        if (d.type === 'sweep' && d.startFt < endFt && d.endFt > startFt) {
            const grossSweep = d.widthIn > 0 ? d.widthIn : 0;
            let deduction = 0;
            
            if (rule === 'diameter') {
                // AHMI diameter rule: deduction = floor(Gross Sweep / 4)
                deduction = Math.floor(grossSweep / 4);
            } else if (rule === 'length') {
                // AHMI length rule: deduction = floor(Gross Sweep / 3)
                deduction = Math.floor(grossSweep / 3);
            }
            
            // Only apply deduction if it's >= 1
            if (deduction > 0) {
                dia -= deduction;
            }
        }
    });
    return Math.max(6, dia);
}

// ─── Doyle Volume ──────────────────────────────────────────────────────────
function doyleVolume(dia, len) {
    const D = Math.max(0, dia - 4);
    return Math.round(D * D * (len / 16));
}

// ─── Clear Faces Calculator ────────────────────────────────────────────────
// Tracks which specific face indices (0–3) are blocked by any overlapping defect,
// using a Set so that two defects on the same face only count once.
// This corrects the prior arithmetic approach that would subtract 2 when two
// defects happened to share a face, under-grading such logs.
// facePenalty is not applied here — AHMI grades by distinct face presence, not
// severity weighting (the 2× rot concept was HW Buck-specific, not AHMI).
function getClearFaces(startFt, endFt, defects) {
    const blocked = new Set();
    defects.forEach(d => {
        if (d.type === 'sweep')      return; // sweep → diameter deduction
        if (d.type === 'end_check')  return; // bole end → length deduction
        if (d.startFt < endFt && d.endFt > startFt) {
            d.facesAffected.forEach(f => blocked.add(f));
        }
    });
    return 4 - blocked.size;
}

// ─── AHMI Grading Matrix (from PDF Page 14) ──────────────────────────────
function getGradeAndPrice(dia, clearFaces) {
    const d = Math.floor(dia);
    const faceIdx = Math.min(4, 4 - clearFaces); // 4 faces -> index 0, 3 faces -> index 1, etc.

    let grade = 'No. 3';
    if      (d >= 17) grade = ['Prime',    'Select+', 'Select',  'No. 2+', 'No. 2'][faceIdx];
    else if (d >= 16) grade = ['Select+',  'No. 1+',  'No. 1',   'No. 2+', 'No. 2'][faceIdx];
    else if (d >= 15) grade = ['Select+',  'No. 1+',  'No. 2+',  'No. 2',  'No. 3'][faceIdx];
    else if (d >= 14) grade = ['Select',   'No. 1',   'No. 2+',  'No. 2',  'No. 3'][faceIdx];
    else if (d >= 13) grade = ['No. 1+',   'No. 2+',  'No. 2',   'No. 3',  'No. 3'][faceIdx];
    else if (d >= 12) grade = ['No. 2+',   'No. 2',   'No. 3',   'No. 3',  'No. 3'][faceIdx];
    else if (d >= 11) grade = ['No. 2',    'No. 3',   'No. 3',   'No. 3',  'No. 3'][faceIdx];
    else              grade = 'No. 3';

    return { grade, pricePerBF: PRICES[grade] ?? 0.30 };
}

// ─── Score Segments ────────────────────────────────────────────────────────
// This is the single source of truth for valuing a physical piece of stem.
// Both the player-facing display and the optimizer use it so an optimal plan's
// reported total always equals the values shown for its individual logs.
function scoreSegment(startFt, endFt, defects, product = 'sawlog') {
    // Peeler bolt lengths are market-preferred lengths with trim already baked
    // in (9', 10', 11' veneer blocks + trim allowance) — no additional trim
    // is subtracted, unlike sawlog standard lengths.
    const isPeeler        = product === 'peeler';
    const trim            = isPeeler ? 0 : getTrim();
    const standardLengths = isPeeler ? PEELER_LENGTHS_FT : [16, 14, 12, 10, 8];
    const physicalLen = endFt - startFt;

    // Bole-end checks consume usable log length — deduct their span from maxNomLen.
    let ecDeduction = 0;
    defects.forEach(d => {
        if (d.type === 'end_check' && d.startFt < endFt && d.endFt > startFt)
            ecDeduction += Math.min(d.endFt, endFt) - Math.max(d.startFt, startFt);
    });
    const maxNomLen = physicalLen - trim - ecDeduction;

    let nomLen = 0;
    for (const L of standardLengths) {
        if (L <= maxNomLen + 0.01) {
            nomLen = L;
            break;
        }
    }

    if (nomLen > 0) {
        // Scaling at the small end of the nominal log
        const scalingFt  = startFt + nomLen;
        const frac       = scalingFt / totalLength;
        const scalingDia = buttDia - (buttDia - topDia) * frac;

        const effectiveDia = applySweepDeduction(scalingDia, startFt, startFt + nomLen, defects);
        const clearFaces   = getClearFaces(startFt, startFt + nomLen, defects);

        if (product === 'peeler' || product === 'scrag') {
            // Weight-priced products: value from cubic volume x species density,
            // not Doyle BF (Doyle drastically underscales small/low-grade logs).
            const buttFrac    = startFt / totalLength;
            const buttDiaAtCut = buttDia - (buttDia - topDia) * buttFrac;
            const gradeInfo = scoreAsProduct(product, buttDiaAtCut, effectiveDia, nomLen, currentTree?.species);
            return { startFt, endFt, physicalLen, nomLen, scalingDia, clearFaces,
                     volumeBF: null, gradeInfo, value: gradeInfo.value };
        }

        const volumeBF   = doyleVolume(effectiveDia, nomLen);
        const gradeInfo  = getGradeAndPrice(effectiveDia, clearFaces);
        const value      = Math.round(volumeBF * gradeInfo.pricePerBF);

        return { startFt, endFt, physicalLen, nomLen, scalingDia, clearFaces, volumeBF, gradeInfo, value };
    }

    return { startFt, endFt, physicalLen, nomLen: 0, scalingDia: 0, clearFaces: 0, volumeBF: 0,
             gradeInfo: { grade: 'Pulp/Waste', pricePerBF: 0 }, value: 0 };
}

function scoreSegments(cutList, defects, productOverrides = []) {
    let totalValue = 0;
    const segs = [];
    const allPoints = [...cutList, totalLength];
    let prevFt = 0;

    allPoints.forEach((endFt, i) => {
        const segment = scoreSegment(prevFt, endFt, defects, productOverrides[i] || 'sawlog');
        totalValue += segment.value;
        segs.push(segment);
        prevFt = endFt;
    });

    return { totalValue, segs };
}

// ─── Live Segment Display (pre-score: piece length + diameter only) ────────
function updateSegments() {
    const { segs } = scoreSegments(cuts, currentDefects);
    let html = '';
    segs.forEach((s, i) => {
        if (s.nomLen > 0) {
            const buttEnd = s.startFt;
            const tipFt   = s.startFt + s.nomLen;
            const buttDiaAtCut = (buttDia - (buttDia - topDia) * (buttEnd / totalLength)).toFixed(1);
            const tipDiaAtCut  = (buttDia - (buttDia - topDia) * (tipFt  / totalLength)).toFixed(1);
            const selected = pieceProduct[i] || 'sawlog';
            const radio = (value, text) => `<label style="white-space:nowrap; cursor:pointer;">
                <input type="radio" name="product-${i}" value="${value}" ${selected === value ? 'checked' : ''}
                       onchange="setPieceProduct(${i}, '${value}')"> ${text}</label>`;
            html += `<div class="segment" style="display:flex; flex-wrap:wrap; align-items:center; gap:16px; text-align:left;">
                <span style="display:flex; gap:12px; font-size:12px; color:${COLORS.wvuSlate};">
                    ${radio('sawlog', 'Sawlog')}${radio('peeler', 'Peeler')}${radio('scrag', 'Scrag')}
                </span>
                <span>
                    Piece ${i+1}: <strong>${s.nomLen}'</strong> log
                    (${formatFeetInches(s.physicalLen)} cut) &mdash;
                    butt ${buttDiaAtCut}" &rarr; small end ${tipDiaAtCut}"
                </span>
            </div>`;
        } else {
            html += `<div class="segment" style="color:${COLORS.wvuSlate}; font-style:italic;">
                Piece ${i+1}: ${formatFeetInches(s.physicalLen)} &mdash; too short for any standard length (wasted)
            </div>`;
        }
    });
    document.getElementById('segments').innerHTML = html;
}

// Called from the per-piece product <select> in updateSegments(); the actual
// re-pricing happens on the next "Score This Stem" click.
function setPieceProduct(i, value) {
    pieceProduct[i] = value;
}

// ─── Optimal Solver ────────────────────────────────────────────────────────
function computeOptimal() {
    const trim = getTrim();
    // Sawlog candidates get the usual trim allowance; peeler candidates use
    // their own preferred lengths with no additional trim (already baked in).
    const candidateLengths = [
        ...[8, 10, 12, 14, 16].map(len => ({ len, includeTrim: true })),
        ...PEELER_LENGTHS_FT.map(len => ({ len, includeTrim: false })),
    ];
    // One-inch states preserve the 4-inch trim exactly and make the returned
    // cut positions practical to score and display without six-inch rounding.
    const step           = 1 / 12;
    const steps          = Math.round(totalLength / step);
    const dp             = new Array(steps + 1).fill(0);
    const choice         = new Array(steps + 1).fill(null);
    const choiceProduct  = new Array(steps + 1).fill(null);

    for (let i = steps - 1; i >= 0; i--) {
        const startFt = i * step;
        for (const { len: nomLen, includeTrim } of candidateLengths) {
            // Bole-end checks consume usable length; the physical span must grow
            // by the check length so the nominal log still measures nomLen usable feet.
            let ecDeduction = 0;
            currentDefects.forEach(d => {
                if (d.type === 'end_check' && d.startFt < startFt + nomLen && d.endFt > startFt)
                    ecDeduction += Math.min(d.endFt, startFt + nomLen) - Math.max(d.startFt, startFt);
            });
            const cutFt   = startFt + nomLen + (includeTrim ? trim : 0) + ecDeduction;
            if (cutFt > totalLength + 0.01) continue;
            const endStep = Math.min(Math.round(cutFt / step), steps);
            const endFt   = endStep * step;
            if (endStep <= i) continue;

            // Score the grid-aligned physical piece with the same function used
            // by the displayed bucking plan.  Do not value the unrounded,
            // theoretical endpoint: that was the source of DP/display gaps.
            // Evaluate every product this piece could be sold as (sawlog is
            // usually the fallback; peeler/scrag only when eligible) and let
            // the DP pick whichever is worth the most, same as it already
            // picks the best length. A candidate built from a peeler length
            // may not resolve to any usable sawlog length at all (and vice
            // versa), so don't gate on the sawlog result alone.
            let bestProduct = null;
            let bestValue   = -1;
            for (const product of ['sawlog', 'peeler', 'scrag']) {
                const seg = scoreSegment(startFt, endFt, currentDefects, product);
                if (seg.nomLen === 0 || seg.gradeInfo.ineligible) continue;
                if (seg.value > bestValue) { bestValue = seg.value; bestProduct = product; }
            }
            if (bestProduct === null) continue;
            const val = bestValue + dp[endStep];

            if (val > dp[i]) { dp[i] = val; choice[i] = endStep; choiceProduct[i] = bestProduct; }
        }
    }

    const optCuts     = [];
    const optProducts = [];
    let pos = 0;
    while (pos < steps && choice[pos] !== null) {
        optProducts.push(choiceProduct[pos]);
        pos = choice[pos];
        if (pos < steps) optCuts.push(pos * step);
    }
    return { optCuts, optValue: dp[0], optProducts };
}

// ─── Explain Why Optimal Differs ───────────────────────────────────────────
function generateBuckingExplanation(userSegs, optSegs, defects) {
    const userValue = userSegs.reduce((s, g) => s + g.value, 0);
    const optValue  = optSegs.reduce((s, g) => s + g.value, 0);

    if (userValue >= optValue) {
        return `<div style="background:${COLORS.wvuSky}; border:1px solid ${COLORS.wvuGold}; border-radius:8px;
                             padding:12px 16px; margin:12px 0; font-size:14px; text-align:left;">
            <strong style="color:${COLORS.wvuBlue};">&#128077; You matched the optimal solution!</strong>
        </div>`;
    }

    // Helper: find defects overlapping a segment
    function overlappingDefects(startFt, endFt) {
        return defects.filter(d => d.startFt < endFt && d.endFt > startFt);
    }

    // Helper: describe a segment and the reasons for its grade
    function describeSegment(s, label) {
        if (s.nomLen === 0) {
            return `<li><strong>${label}:</strong> ${formatFeetInches(s.physicalLen)} piece was too short for any standard log length (min 8') and was wasted.</li>`;
        }
        if (s.gradeInfo.ineligible) {
            return `<li><strong>${label}:</strong> ${s.nomLen}' log marked as <strong>${s.gradeInfo.grade}</strong> ($0). ${s.gradeInfo.reason}</li>`;
        }
        if (s.gradeInfo.tons != null) {
            return `<li><strong>${label}:</strong> ${s.nomLen}' log scaled at ${s.scalingDia.toFixed(1)}" &rarr; <strong>${s.gradeInfo.grade}</strong>, ${s.gradeInfo.tons} tons ($${s.value}).</li>`;
        }
        const active = overlappingDefects(s.startFt, s.startFt + s.nomLen);
        let defectDesc = '';
        if (active.length === 0) {
            defectDesc = 'No defects in this section — grade was limited only by diameter.';
        } else {
            const parts = active.map(d => {
                if (d.type === 'sweep') {
                    const ded = (d.widthIn > 0) ? d.widthIn : 1;
                    return `<em>Sweep</em> reduced scaling diameter by ${ded}"`;
                } else if (d.type === 'end_check') {
                    return `<em>Stem Check</em> reduced usable length`;
                } else {
                    const penalty = d.facesAffected.length;
                    return `<em>${d.label}</em> removed ${penalty} clear face${penalty !== 1 ? 's' : ''}`;
                }
            });
            defectDesc = parts.join('; ') + '.';
        }
        return `<li><strong>${label}:</strong> ${s.nomLen}' log scaled at ${s.scalingDia.toFixed(1)}" with ${s.clearFaces} clear face${s.clearFaces !== 1 ? 's' : ''} &rarr; <strong>${s.gradeInfo.grade}</strong> ($${s.value}). ${defectDesc}</li>`;
    }

    // Build comparison bullets by analyzing sections of the stem where decisions differed.
    let comparisons = '';
    const explainedUserSegs = new Set();

    for (let i = 0; i < userSegs.length; i++) {
        if (userSegs[i].nomLen === 0 || explainedUserSegs.has(i)) continue;

        const group = [userSegs[i]];
        let currentEnd = userSegs[i].endFt;
        for (let j = i + 1; j < userSegs.length; j++) {
            if (userSegs[j].nomLen > 0 && Math.abs(userSegs[j].startFt - currentEnd) < 0.1) {
                group.push(userSegs[j]);
                currentEnd = userSegs[j].endFt;
            } else { break; }
        }

        const groupStart = group[0].startFt;
        const groupEnd = group[group.length - 1].endFt;
        const userValueForGroup = group.reduce((sum, seg) => sum + seg.value, 0);

        const overlappingOptSegs = optSegs.filter(os => os.startFt < groupEnd && os.endFt > groupStart && os.nomLen > 0);
        const optValueForGroup = overlappingOptSegs.reduce((sum, seg) => sum + seg.value, 0);

        if (optValueForGroup > userValueForGroup + 1) {
            const diff = optValueForGroup - userValueForGroup;
            let why = '';

            const userDesc = group.map(s => `${s.nomLen}' ${s.gradeInfo.grade}`).join(' and a ');
            const optDesc = overlappingOptSegs.map(s => `<strong>${s.nomLen}' ${s.gradeInfo.grade}</strong>`).join(' and a ');

            if (group.length === 1 && overlappingOptSegs.length > 1) {
                const userSeg = group[0];
                const bestOptSeg = overlappingOptSegs.sort((a,b) => (PRICES[b.gradeInfo.grade]||0) - (PRICES[a.gradeInfo.grade]||0))[0];
                if ((PRICES[bestOptSeg.gradeInfo.grade]||0) > (PRICES[userSeg.gradeInfo.grade]||0)) {
                    why = `By cutting your single ${userSeg.nomLen}' log into multiple pieces (including a ${optDesc}), the optimal solution created a higher-grade log from the thicker portion of the stem. This "grade-up" strategy is often more valuable than maximizing length.`;
                } else {
                    why = `Your single ${userSeg.nomLen}' log was less valuable than the optimal combination of ${optDesc}.`;
                }
            } else if (group.length > 1 && overlappingOptSegs.length === 1) {
                const optSeg = overlappingOptSegs[0];
                why = `You cut this section into ${group.length} smaller logs. The optimal solution kept it as a single, more valuable ${optDesc} log. Sometimes a longer log is better, even if it means accepting a lower grade on one piece.`;
            } else {
                const userBestGrade = group.sort((a,b) => (PRICES[b.gradeInfo.grade]||0) - (PRICES[a.gradeInfo.grade]||0))[0].gradeInfo.grade;
                const optBestGrade = overlappingOptSegs.length > 0 ? overlappingOptSegs.sort((a,b) => (PRICES[b.gradeInfo.grade]||0) - (PRICES[a.gradeInfo.grade]||0))[0].gradeInfo.grade : 'Waste';
                if ((PRICES[optBestGrade]||0) > (PRICES[userBestGrade]||0)) {
                    why = `The optimal solution prioritized creating a <strong>${optBestGrade}</strong> log in this section, while your best log was a ${userBestGrade}. This was achieved by better isolating defects or capturing more diameter.`;
                } else {
                    why = `The optimal combination of cuts (${optDesc}) was more valuable than your combination (${userDesc}).`;
                }
            }
            const userSegIndices = group.map(s => userSegs.indexOf(s));
            const userPieceLabels = userSegIndices.map(idx => `Piece ${idx+1}`).join(' & ');
            comparisons += `<li style="margin-top:8px;"><strong>Regarding your ${userPieceLabels} (total value $${userValueForGroup}):</strong> The optimal solution gained <strong>$${Math.round(diff)}</strong> in this section. ${why}</li>`;
            userSegIndices.forEach(idx => explainedUserSegs.add(idx));
            i += group.length - 1;
        }
    }

    // Helper for proportional value check
    function getProportionalValue(segments, start, end) {
        let value = 0;
        segments.forEach(seg => {
            if (seg.nomLen === 0) return;
            const overlapStart = Math.max(start, seg.startFt);
            const overlapEnd = Math.min(end, seg.endFt);
            const overlapLen = overlapEnd - overlapStart;
            if (overlapLen > 0.1 && seg.physicalLen > 0) {
                value += (overlapLen / seg.physicalLen) * seg.value;
            }
        });
        return value;
    }

    optSegs.forEach(optSeg => {
        if (optSeg.nomLen === 0) return;
        const userValueForSpan = getProportionalValue(userSegs, optSeg.startFt, optSeg.endFt);
        if (userValueForSpan < 1 && optSeg.value > 1) {
            comparisons += `<li style="margin-top:8px;"><strong>Wasted Potential:</strong> A section from ${formatFeetInches(optSeg.startFt)} to ${formatFeetInches(optSeg.endFt)} was left as waste, but it could have been a <strong>$${optSeg.value} ${optSeg.gradeInfo.grade}</strong> log.</li>`;
        }
    });

    const gap = optValue - userValue;

    let html = `<details style="background:${COLORS.wvuCloud}; border:2px solid ${COLORS.wvuBlue}; border-radius:8px;
                                 padding:12px 16px; margin:12px 0; font-size:14px; text-align:left;" open>
        <summary style="cursor:pointer; font-weight:bold; color:${COLORS.wvuBlue}; font-size:15px;">
            &#128270; Why is the optimal solution $${gap} more?
        </summary>
        <p style="margin:8px 0 4px; color:#444;">
            The optimal solution recovered <strong>$${optValue}</strong> vs your <strong>$${userValue}</strong>. Here's a breakdown of the key differences:
        </p>`;

    if (comparisons) {
        html += `<ul style="margin:4px 0; padding-left:20px; line-height:1.7;">${comparisons}</ul>`;
    } else {
        html += `<p style="margin:8px 0;">The cutting patterns were very similar, but small differences in cut placement led to the value gap.</p>`;
    }

    html += `<p style="margin:12px 0 4px; font-weight:bold; color:${COLORS.wvuBlue};">Your Segments in Detail:</p>
        <ul style="margin:4px 0 8px; padding-left:20px; line-height:1.7;">
            ${userSegs.map((s, i) => describeSegment(s, `Piece ${i+1}`)).join('')}
        </ul>`;

    html += `</details>`;
    return html;
}

// ─── Score This Log ────────────────────────────────────────────────────────
document.getElementById('scoreLog').addEventListener('click', () => {
    const { optCuts, optProducts } = computeOptimal();
    const { totalValue, segs }   = scoreSegments(cuts, currentDefects, pieceProduct);
    // Re-score the reconstructed cuts so every displayed optimal total is the
    // sum of the exact plan shown below it.
    const { totalValue: optValue, segs: optSegs } = scoreSegments(optCuts, currentDefects, optProducts);
    const trim                   = getTrim();
    const pct                    = optValue > 0 ? Math.round((totalValue / optValue) * 100) : 0;
    const scoreColor             = pct >= 90 ? COLORS.feedback.success : pct >= 70 ? COLORS.feedback.warning : COLORS.feedback.error;

    logScores.push({ pct, totalValue, optValue, leftOnTable: optValue - totalValue, logNum: currentLogIndex + 1 });
    updateRunningScore();

    // Show optimal canvas
    const optContainer = document.getElementById('optContainer');
    if (optContainer && optCtx) {
        optContainer.style.display = 'block';
        drawLogGraphic(optCtx, optCanvas, optCuts);
        drawFaceMap(optFaceCtx, optFaceCanvas, currentDefects, optCuts);
    }

    let html = `
        <div style="background:#FFF8E1; padding:15px; border-radius:8px; margin:15px 0;
                    font-size:16px; border:2px solid ${COLORS.wvuGold};">
            <strong>Stem ${currentLogIndex + 1} Result:</strong>
            Your Value: <strong>$${totalValue}</strong> &nbsp;|&nbsp;
            Optimal: <strong>$${optValue}</strong> &nbsp;|&nbsp;
            <strong style="color:${scoreColor}; font-size:20px;">${pct}%</strong>
            &nbsp;(trim = ${(trim * 12).toFixed(0)}" per log)
        </div>`;

    html += generateBuckingExplanation(segs, optSegs, currentDefects);

    // Weight-priced products (peeler/scrag) report tons, not board feet or
    // clear faces — those measures don't apply to a ton-priced product.
    function measureDetail(s) {
        const faceColor = s.clearFaces >= 3 ? COLORS.feedback.success : s.clearFaces >= 2 ? COLORS.feedback.warning : COLORS.feedback.error;
        if (s.gradeInfo.tons != null) {
            return `<strong>${s.gradeInfo.tons} tons</strong>`;
        }
        return `<strong>${s.volumeBF} bf</strong> | <span style="color:${faceColor}; font-weight:bold;">${s.clearFaces} clear faces</span>`;
    }

    html += `<div style="display:flex; gap:20px; flex-wrap:wrap;">
            <div style="flex:1; min-width:220px;">
                <h3 style="color:${COLORS.feedback.error};">&#9999; Your Bucking — $${totalValue}</h3>`;

    segs.forEach((s, i) => {
        if (s.nomLen > 0) {
            html += `<div class="segment" style="border-left-color: ${COLORS.feedback.error};">
                Log ${i+1}: <strong>${s.nomLen}'</strong> (${formatFeetInches(s.physicalLen)} piece) @
                ${s.scalingDia.toFixed(1)}" | ${measureDetail(s)}
                &rarr; <strong>${s.gradeInfo.grade}</strong> &rarr; $${s.value}
            </div>`;
        } else {
            html += `<div class="segment" style="border-left:4px solid ${COLORS.wvuSlate}; color:#777;">
                Piece ${i+1}: ${s.physicalLen.toFixed(1)}' (Waste)
            </div>`;
        }
    });

    html += `</div><div style="flex:1; min-width:220px;">
                <h3 style="color:${COLORS.wvuBlue};">&#10003; Optimal Bucking — $${optValue}</h3>`;

    optSegs.forEach((s, i) => {
        html += `<div class="segment" style="border-left-color: ${COLORS.wvuGold};">
            Log ${i+1}: <strong>${s.nomLen}'</strong> @
            ${s.scalingDia.toFixed(1)}" | ${measureDetail(s)}
            &rarr; <strong>${s.gradeInfo.grade}</strong> &rarr; $${s.value}
        </div>`;
    });

    html += `</div></div>`;
    document.getElementById('segments').innerHTML = html;
    document.getElementById('scoreLog').style.display = 'none';

    const isLastStem = currentLogIndex === TOTAL_LOGS - 1;
    const nextLogButton = document.getElementById('nextLog');
    nextLogButton.textContent = isLastStem ? 'View Final Score →' : 'Next Stem →';
    nextLogButton.style.display = 'inline-block';
});


// ─── Running Score ─────────────────────────────────────────────────────────
function updateRunningScore() {
    const avg = Math.round(logScores.reduce((s, l) => s + l.pct, 0) / logScores.length);
    document.getElementById('gameScore').textContent = `Running Score: ${avg}%`;
}

// ─── Next Log ──────────────────────────────────────────────────────────────
document.getElementById('nextLog').addEventListener('click', () => {
    if (currentLogIndex === TOTAL_LOGS - 1) {
        showFinalScore();
    } else {
        currentLogIndex++;
        loadLog(pickLog());
    }
});

// ─── Attempt Logging (server-side CSV) ────────────────────────────────────
// Participant ID comes from URL ?user=P001 — invisible to the player.
// Falls back to a random session token if the param is absent.
const userId = new URLSearchParams(window.location.search).get('user') ||
    'anon-' + Math.random().toString(36).slice(2, 8);

function recordAttempt(scores) {
    const overallPct = Math.round(scores.reduce((s, l) => s + l.pct, 0) / scores.length);
    const payload = {
        user:      userId,
        timestamp: new Date().toISOString(),
        logs:      scores.map(l => l.pct),
        overall:   overallPct
    };
    fetch('/log', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload)
    }).catch(() => { /* silently ignore if server unavailable */ });
}

// ─── Final Scorecard ───────────────────────────────────────────────────────
function showFinalScore() {
    recordAttempt(logScores);
    const avg = Math.round(logScores.reduce((s, l) => s + l.pct, 0) / logScores.length);
    let grade, msg, color;
    if      (avg >= 95) { grade='A+'; msg='Master Bucker! Exceptional value recovery.';        color=COLORS.feedback.success; }
    else if (avg >= 90) { grade='A';  msg='Excellent — near-optimal bucking decisions.';        color=COLORS.feedback.success; }
    else if (avg >= 80) { grade='B';  msg='Good work — small improvements possible.';           color=COLORS.wvuBlue; }
    else if (avg >= 70) { grade='C';  msg='Decent — review how defects affect log grade.';      color=COLORS.feedback.warning; }
    else if (avg >= 60) { grade='D';  msg='Needs work — study defect isolation strategies.';    color=COLORS.feedback.error; }
    else                { grade='F';  msg='Keep practicing — focus on clear face tradeoffs!';   color=COLORS.feedback.error; }

    const totalYours   = logScores.reduce((s, l) => s + l.totalValue, 0);
    const totalOptimal = logScores.reduce((s, l) => s + l.optValue,   0);
    const totalLeft    = totalOptimal - totalYours;

    const rows = logScores.map(l => `
        <tr>
            <td style="padding:8px 16px;">Stem ${l.logNum}</td>
            <td style="padding:8px 12px;">$${l.totalValue}</td>
            <td style="padding:8px 12px;">$${l.optValue}</td>
            <td style="padding:8px 12px; color:${l.pct>=90?COLORS.feedback.success:l.pct>=70?COLORS.feedback.warning:COLORS.feedback.error}">
                <strong>${l.pct}%</strong>
            </td>
            <td style="padding:8px 12px; color:${l.leftOnTable===0?COLORS.feedback.success:COLORS.feedback.error}; font-weight:bold;">
                ${l.leftOnTable > 0 ? '−$' + l.leftOnTable : '&#10003;'}
            </td>
        </tr>`).join('');

    const reportHTML = `
        <div style="text-align:center; padding:10px 0 30px;">
            <h1 style="color:${COLORS.wvuBlue}; border-bottom:3px solid ${COLORS.wvuGold}; padding-bottom:8px; margin-bottom:20px;">
                &#128203; Bucking Trainer — Final Report
            </h1>

            <div style="background:#fff; border:3px solid ${color}; border-radius:12px;
                        padding:25px; margin:0 auto 25px; max-width:700px;">
                <h2 style="font-size:28px; margin:0 0 8px;">Final Score:
                    <span style="color:${color}; font-size:52px; line-height:1.1;">${grade}</span>
                </h2>
                <p style="font-size:22px; margin:6px 0;">${avg}% of optimal value recovered</p>
                <p style="font-size:16px; color:#555; margin:4px 0;">${msg}</p>
            </div>

            <table style="margin:0 auto 20px; border-collapse:collapse; font-size:15px; width:100%; max-width:700px;">
                <thead>
                    <tr style="background:${COLORS.wvuBlue}; color:#fff;">
                    <th style="padding:10px 16px; text-align:left;">Stem</th>
                        <th style="padding:10px 12px;">Your $</th>
                        <th style="padding:10px 12px;">Optimal $</th>
                        <th style="padding:10px 12px;">Score</th>
                        <th style="padding:10px 12px;">Left on Table</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
                <tfoot>
                    <tr style="background:#FFF8E1; font-weight:bold; border-top:3px solid ${COLORS.wvuGold};">
                        <td style="padding:10px 16px; text-align:left;">Total</td>
                        <td style="padding:10px 12px;">$${totalYours}</td>
                        <td style="padding:10px 12px;">$${totalOptimal}</td>
                        <td style="padding:10px 12px; color:${avg>=90?COLORS.feedback.success:avg>=70?COLORS.feedback.warning:COLORS.feedback.error}">${avg}%</td>
                        <td style="padding:10px 12px; color:${totalLeft===0?COLORS.feedback.success:COLORS.feedback.error}">
                            ${totalLeft > 0 ? '−$' + totalLeft : '&#10003; Perfect'}
                        </td>
                    </tr>
                </tfoot>
            </table>

            <div style="background:${COLORS.wvuCloud}; border:2px solid ${COLORS.wvuBlue}; border-radius:8px;
                        padding:16px 24px; margin:0 auto 25px; max-width:700px; font-size:16px;">
                <strong>Optimal total:</strong> $${totalOptimal} &nbsp;&nbsp;|&nbsp;&nbsp;
                <strong>You recovered:</strong> $${totalYours} &nbsp;&nbsp;|&nbsp;&nbsp;
                <strong>Left on table:</strong>
                <span style="color:${totalLeft>0?COLORS.feedback.error:COLORS.feedback.success}; font-weight:bold;">
                    $${totalLeft}
                </span>
            </div>

            <button onclick="restartGame()"
                style="padding:14px 36px; background:${COLORS.wvuGold}; color:${COLORS.wvuBlue};
                       font-size:18px; font-weight:bold; border:none; border-radius:6px;
                       cursor:pointer; letter-spacing:0.03em;">
                &#128260; Play Again
            </button>
        </div>`;

    // Switch to the report page
    document.querySelector('.container').style.display = 'none';
    const report = document.getElementById('finalReport');
    report.innerHTML = reportHTML;
    report.style.display = 'block';
    window.scrollTo(0, 0);
}

// ─── Play Again ────────────────────────────────────────────────────────────
function restartGame() {
    currentLogIndex = 0;
    logScores       = [];
    usedTreeIndices.clear();
    document.getElementById('gameScore').textContent = 'Running Score: 0%';
    document.getElementById('finalReport').style.display = 'none';
    document.querySelector('.container').style.display = 'block';
    window.scrollTo(0, 0);
    loadLog(pickLog());
}

// ─── Reset Cuts ────────────────────────────────────────────────────────────
document.getElementById('reset').addEventListener('click', () => {
    cuts = [];
    pieceProduct = [];
    drawLog();
    document.getElementById('scoreLog').style.display  = 'inline-block';
    document.getElementById('nextLog').style.display   = 'none';
    document.getElementById('segments').innerHTML      = '';
    document.getElementById('finalScore').style.display = 'none';
    const optContainer = document.getElementById('optContainer');
    if (optContainer) optContainer.style.display = 'none';
});

// ─── Trim Live Update ──────────────────────────────────────────────────────
document.getElementById('trimInput').addEventListener('change', drawLog);

document.getElementById('datasetSelect').addEventListener('change', event => {
    selectedDataset = event.target.value;
    const allTrees = window.allStemTrees || [];
    const millStudy = window.millStudyData || { stems: [] };
    realTrees = getDatasetTrees(allTrees, millStudy);
    usedTreeIndices.clear();
    currentLogIndex = 0;
    logScores = [];
    document.getElementById('gameScore').textContent = 'Running Score: 0%';
    updateDatasetStatus();
    loadLog(pickLog());
});

// ─── View Mode (2D / 3D) ────────────────────────────────────────────────────
document.getElementById('viewModeSelect').addEventListener('change', event => {
    viewMode = event.target.value;
    const is3D = viewMode === '3d';
    canvas.style.display       = is3D ? 'none' : 'block';
    stem3dCanvas.style.display = is3D ? 'block' : 'none';
    const badge = document.getElementById('stem3dBadge');
    if (badge) {
        badge.style.display = is3D ? 'block' : 'none';
        badge.textContent = `diameter shown ×${RADIUS_SCALE} for visibility — read true inches from the labels`;
    }
    hideChainsaw();
    if (is3D) initStem3D();
    setStem3DActive(is3D);
    resizeCanvases();
    redrawCanvases();
});

// ─── 3D Stem Viewer (beta) ──────────────────────────────────────────────────
// Builds real taper/sweep geometry from the same currentTree/currentDefects
// data the 2D view uses — real profile+sweepCurve when the mill-study dataset
// supplies them, a linear-taper/defect-driven fallback otherwise. The stem
// lies along the X axis, butt at x=0 (left) — same convention as the 2D
// canvas — so the two views read as the same stem from two angles.
let stem3d = null; // lazily-created { renderer, scene, camera, raycaster, ... }

function initStem3D() {
    if (stem3d) return;
    const renderer = new THREE.WebGLRenderer({ canvas: stem3dCanvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0xeaf0fa, 1); // wvuSky, so it reads as the same app chrome

    const scene = new THREE.Scene();
    // Orthographic, not perspective: a perspective camera close enough to
    // frame the whole stem end-to-end (a 38° FOV a bit over half the stem's
    // own length away) foreshortens the far ends noticeably more than the
    // near middle, which reads as the log's ends being pinched/bowed — a
    // real perspective effect, not a geometry bug, but the wrong look for
    // something meant to be measured. Orthographic keeps radius and spacing
    // visually true across the whole length, and — because it has no notion
    // of "distance", only a zoom factor applied uniformly — a mouse-wheel
    // zoom scales the stem and its labels together by the same factor,
    // instead of the two responding differently to a change in distance.
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 2000);

    const stemGroup   = new THREE.Group();  // rotates for Roll Up/Down (logRotation)
    const logGroup    = new THREE.Group();  // bark + caps
    const defectGroup = new THREE.Group();
    const cutGroup    = new THREE.Group();
    const rulerGroup  = new THREE.Group();  // foot ticks + true (unexaggerated) diameter labels

    // Live preview of where a click would cut — a bright ring that tracks the
    // pointer, distinct from the solid red rings that mark committed cuts.
    const hoverGroup = new THREE.Group();
    const hoverRing = new THREE.Mesh(
        new THREE.CylinderGeometry(1, 1, 0.05, SEGMENTS),
        new THREE.MeshBasicMaterial({ color: 0x2fb8c4, transparent: true, opacity: 0.85 })
    );
    hoverRing.geometry.rotateZ(Math.PI / 2);
    hoverGroup.add(hoverRing);
    hoverGroup.visible = false;

    stemGroup.add(logGroup, defectGroup, cutGroup, rulerGroup, hoverGroup);
    scene.add(stemGroup);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xfff2e0, 1.05);
    key.position.set(5, 8, 9);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fd7ff, 0.35);
    fill.position.set(-6, -3, -6);
    scene.add(fill);

    const barkMat = new THREE.MeshStandardMaterial({ map: makeBarkTexture(), roughness: 0.92, metalness: 0.02 });
    const capMat  = new THREE.MeshStandardMaterial({ map: makeEndGrainTexture(), roughness: 0.75, metalness: 0.02 });

    stem3d = {
        renderer, scene, camera, stemGroup, logGroup, defectGroup, cutGroup, rulerGroup, hoverGroup,
        barkMat, capMat,
        raycaster: new THREE.Raycaster(),
        // azimuth 0 is not an arbitrary default: with the target centered on
        // the stem's X axis, azimuth 0 makes the camera's screen-right exactly
        // world +X (derivable from THREE's lookAt basis regardless of polar),
        // which is what guarantees butt (x=0) reads on the left, top on the
        // right, at any elevation. Orbiting away from 0 is fine for inspection;
        // this is just the default the stem loads into.
        azimuth: 0, polar: 1.2, dist: 40, target: new THREE.Vector3(0, 0, 0),
        zoom: 1, framedLength: null, // orthographic zoom factor; framedLength gates auto-reframing
        labelSprites: [], // every label sprite currently in the scene, for constant-pixel-size rescaling on zoom
        dragging: false, dragMode: null, dragIdx: -1, dragPlane: new THREE.Plane(),
        pointerDownPos: null, moved: false,
        active: false, animHandle: null,
    };
    updateStem3DCamera();

    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', onStem3DPointerDown);
    dom.addEventListener('pointermove', onStem3DPointerMove);
    window.addEventListener('pointerup', onStem3DPointerUp);
    dom.addEventListener('pointerleave', () => {
        if (stem3d.dragging) return;
        hideChainsaw();
        stem3d.hoverGroup.visible = false;
        const tip = document.getElementById('hoverTooltip');
        if (tip) tip.style.display = 'none';
    });
    dom.addEventListener('contextmenu', onStem3DContextMenu);
    dom.addEventListener('wheel', onStem3DWheel, { passive: false });
}

function setStem3DActive(active) {
    if (!stem3d) return;
    stem3d.active = active;
    if (active && !stem3d.animHandle) stem3DAnimate();
    if (!active && stem3d.animHandle) { cancelAnimationFrame(stem3d.animHandle); stem3d.animHandle = null; }
}

function stem3DAnimate() {
    if (!stem3d || !stem3d.active) return;
    stem3d.animHandle = requestAnimationFrame(stem3DAnimate);
    stem3d.renderer.render(stem3d.scene, stem3d.camera);
}

function resizeStem3D() {
    if (!stem3d) return;
    const w = stem3dCanvas.width, h = stem3dCanvas.height;
    stem3d.renderer.setSize(w, h, false);
    updateStem3DFrustum();
}

// Sizes the orthographic frustum to fit the current stem's length (plus a
// margin for the ruler/labels) at the canvas's current aspect ratio, then
// applies the user's zoom on top. Must be re-run whenever the canvas is
// resized, a new (differently-sized) stem loads, or zoom changes — anything
// that changes either "how much world" or "how much screen" is in play.
function updateStem3DFrustum() {
    const s = stem3d;
    if (!s || !totalLength) return;
    const aspect = stem3dCanvas.width / stem3dCanvas.height;
    const halfWforLength = (totalLength * 1.15) / 2; // headroom for end caps past x=0/x=totalLength

    // The canvas is wide and short (~4:1), so deriving vertical extent purely
    // from halfWforLength/aspect can leave less height than the ruler+labels
    // actually need below/above the log, clipping them. Compute the real
    // content height instead: butt radius (largest, since taper only shrinks
    // toward the top) plus the ruler baseline below it and the diameter/cut
    // label headroom above it (see buildStem3DRuler's offsets).
    const buttR = stem3DRadiusAt(0);
    const neededHalfH = buttR + 2.8;

    let halfW = halfWforLength, halfH = halfW / aspect;
    if (halfH < neededHalfH) { halfH = neededHalfH; halfW = halfH * aspect; }

    s.camera.left = -halfW; s.camera.right = halfW;
    s.camera.top  = halfH;  s.camera.bottom = -halfH;
    s.camera.zoom = s.zoom;
    s.camera.updateProjectionMatrix();
}

function updateStem3DCamera() {
    const s = stem3d;
    const sp = Math.sin(s.polar), cp = Math.cos(s.polar);
    s.camera.position.set(
        s.target.x + s.dist * sp * Math.sin(s.azimuth),
        s.target.y + s.dist * cp,
        s.target.z + s.dist * sp * Math.cos(s.azimuth)
    );
    s.camera.lookAt(s.target);
}

// ─── Generated bark / end-grain textures (canvas-drawn, no image assets) ──
function makeBarkTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#4a3220'; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 420; i++) {
        const x = Math.random() * c.width, y = Math.random() * c.height;
        const w = 2 + Math.random() * 3, h = 10 + Math.random() * 70;
        const shade = 20 + Math.random() * 36;
        g.fillStyle = `rgba(${20 + shade},${12 + shade * 0.6},${6 + shade * 0.35},${0.35 + Math.random() * 0.35})`;
        g.beginPath(); g.ellipse(x, y, w, h, 0, 0, Math.PI * 2); g.fill();
    }
    for (let y = 0; y < c.height; y++) {
        if (Math.random() < 0.5) continue;
        g.strokeStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.05})`;
        g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
}
function makeEndGrainTexture() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    const g = c.getContext('2d');
    const cx = 256, cy = 256, maxR = 250;
    g.fillStyle = '#6b4326'; g.beginPath(); g.arc(cx, cy, maxR, 0, Math.PI * 2); g.fill();
    const rings = 26;
    for (let i = rings; i >= 1; i--) {
        const fr = i / rings;
        const warm = 1 - fr * 0.55;
        const r = Math.round(150 * warm + 50), gg = Math.round(95 * warm + 30), b = Math.round(48 * warm + 16);
        g.beginPath(); g.arc(cx, cy, maxR * fr, 0, Math.PI * 2);
        g.fillStyle = `rgb(${r},${gg},${b})`; g.fill();
        if (i % 2 === 0) { g.strokeStyle = 'rgba(30,15,5,0.28)'; g.lineWidth = 1.4; g.stroke(); }
    }
    for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2, len = maxR * (0.3 + Math.random() * 0.65);
        g.strokeStyle = 'rgba(20,10,4,0.3)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); g.stroke();
    }
    g.beginPath(); g.arc(cx, cy, maxR * 0.06, 0, Math.PI * 2); g.fillStyle = '#2c1608'; g.fill();
    return new THREE.CanvasTexture(c);
}
// How many world units one screen pixel covers right now, at the current
// zoom — used to size label sprites in actual screen pixels rather than
// world units. Scaling labels in world units means their on-screen size is
// a function of the stem's length and the current zoom level: a longer
// stem (bigger frustum) or a zoomed-out view shrinks them proportionally,
// which is exactly what made them unreadably small on a 57 ft stem even
// after the frustum-clipping fix. Dimension text on a real engineering
// drawing is conventionally a fixed point size regardless of drawing
// scale — this does the equivalent for the 3D view.
function stem3DWorldPerPixel() {
    const s = stem3d;
    const visibleWorldWidth = (s.camera.right - s.camera.left) / s.camera.zoom;
    return visibleWorldWidth / stem3dCanvas.width;
}

// Applies a sprite's stored target pixel size at the *current* zoom — call
// again whenever zoom/frustum changes for a sprite that isn't being rebuilt
// from scratch (rebuilt sprites get the current size for free at creation).
function applyLabelPixelScale(sprite) {
    const wpp = stem3DWorldPerPixel();
    sprite.scale.set(sprite.userData.pxW * wpp, sprite.userData.pxH * wpp, 1);
}

function makeLabelSprite(text, bg = 'rgba(0,40,85,0.82)', pxW = 130, pxH = 40) {
    const c = document.createElement('canvas'); c.width = 320; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(4, 10, 312, 76);
    g.fillStyle = '#fff'; g.font = 'bold 46px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 160, 50);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter; // avoid mip-chain blurring on this small, high-contrast texture
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.userData.pxW = pxW;
    sprite.userData.pxH = pxH;
    applyLabelPixelScale(sprite);
    stem3d?.labelSprites?.push(sprite);
    return sprite;
}

// ─── Geometry helpers (feet as world units; inches/12 for radius/offset) ──
const FT2IN = 12;
function lerpSeries(series, key, h) {
    if (h <= series[0].h) return series[0][key];
    const last = series[series.length - 1];
    if (h >= last.h) return last[key];
    for (let i = 0; i < series.length - 1; i++) {
        const a = series[i], b = series[i + 1];
        if (h >= a.h && h <= b.h) {
            const t = (h - a.h) / (b.h - a.h);
            return a[key] + (b[key] - a[key]) * t;
        }
    }
    return last[key];
}
function stem3DDiameterAt(h) {
    if (currentTree?.profile?.length > 1) return lerpSeries(currentTree.profile, 'd', h);
    return buttDia - (buttDia - topDia) * (h / totalLength);
}
function stem3DSweepOffsetInAt(h) {
    if (currentTree?.sweepCurve?.length > 1) {
        const curve = currentTree.sweepCurve;
        if (h > curve[curve.length - 1].h) return 0;
        return lerpSeries(curve, 'off', h);
    }
    // Fallback for datasets without a measured centerline: reuse the same
    // sine-bump model the 2D view uses for sweep defects (getCrookOffset),
    // in inches rather than pixels.
    let off = 0;
    currentDefects.forEach(d => {
        if (d.type !== 'sweep' || h < d.startFt || h > d.endFt) return;
        const span = Math.max(0.01, d.endFt - d.startFt);
        const progress = (h - d.startFt) / span;
        off += (d.widthIn > 0 ? d.widthIn : 1) * Math.sin(progress * Math.PI);
    });
    return off;
}
const RINGS_PER_FT = 3, SEGMENTS = 20;
// A stem's diameter is small next to its length (a 20" x 40' log is a
// 1:24 ratio) — rendered at true relative scale it reads as a hairline, not
// a log. This exaggerates radius only (never length) so the shape reads at
// a glance; the ruler's diameter labels always show the true inches, so a
// player never has to trust the visual proportions for a real number.
const RADIUS_SCALE = 4.5;

function stem3DRadiusAt(h) {
    return (stem3DDiameterAt(h) / 2 / FT2IN) * RADIUS_SCALE;
}
function buildStem3DCenters() {
    const nRings = Math.max(2, Math.round(totalLength * RINGS_PER_FT));
    const centers = [];
    for (let i = 0; i <= nRings; i++) {
        const x = totalLength * i / nRings;
        centers.push({
            x,
            r: stem3DRadiusAt(x),
            y: stem3DSweepOffsetInAt(x) / FT2IN,
        });
    }
    return centers;
}
function stem3DCenterAt(x) {
    return { x, r: stem3DRadiusAt(x), y: stem3DSweepOffsetInAt(x) / FT2IN };
}

// ─── Ruler: foot ticks + true (unexaggerated) diameter labels ─────────────
// Always visible, not just on hover — the exaggerated log shape is for
// silhouette legibility only; these numbers are what a player should
// actually trust for length and diameter.
function buildStem3DRuler(group) {
    // Gaps below/above are expressed in *pixels* (via the current
    // world-per-pixel ratio), not world units, so the ruler's layout looks
    // the same — a consistent, comfortable gap — at any zoom level or stem
    // length, matching how the labels themselves are now sized.
    const wpp = stem3DWorldPerPixel();
    const buttR = stem3DCenterAt(0).r;
    const baseY = -(buttR + 22 * wpp);
    const tickHalfH = 9 * wpp;
    const step = totalLength > 30 ? 5 : totalLength > 15 ? 2 : 1;
    const tickMat = new THREE.LineBasicMaterial({ color: 0x002855 });

    function addFootTick(x) {
        const tickGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(x, baseY - tickHalfH, 0), new THREE.Vector3(x, baseY + tickHalfH, 0),
        ]);
        group.add(new THREE.Line(tickGeo, tickMat));

        const label = makeLabelSprite(Math.round(x) + "'", 'rgba(0,40,85,0.78)', 60, 24);
        label.position.set(x, baseY - 30 * wpp, 0);
        group.add(label);
    }

    for (let ft = 0; ft <= totalLength + 0.001; ft += step) {
        addFootTick(Math.min(ft, totalLength));
    }
    // Ensure the final tick lands exactly at the tip even if step doesn't divide evenly.
    if (totalLength % step > 0.05) addFootTick(totalLength);

    [0, 0.25, 0.5, 0.75, 1].forEach(frac => {
        const x = frac * totalLength;
        const c = stem3DCenterAt(x);
        const trueDia = stem3DDiameterAt(x);
        const label = makeLabelSprite(trueDia.toFixed(1) + '"', 'rgba(74,50,32,0.85)', 72, 26);
        label.position.set(x, c.y + c.r + 18 * wpp, 0);
        group.add(label);
    });
}

function buildLogTubeGeometry(centers) {
    const positions = [], normals = [], uvs = [], indices = [];
    centers.forEach((c, ri) => {
        for (let s = 0; s < SEGMENTS; s++) {
            const a = (s / SEGMENTS) * Math.PI * 2;
            const ny = Math.cos(a), nz = Math.sin(a);
            positions.push(c.x, c.y + ny * c.r, nz * c.r);
            normals.push(0, ny, nz);
            uvs.push(ri / (centers.length - 1) * (totalLength / 6), s / SEGMENTS);
        }
    });
    for (let ri = 0; ri < centers.length - 1; ri++) {
        for (let s = 0; s < SEGMENTS; s++) {
            const s2 = (s + 1) % SEGMENTS;
            const a0 = ri * SEGMENTS + s, a1 = ri * SEGMENTS + s2;
            const b0 = (ri + 1) * SEGMENTS + s, b1 = (ri + 1) * SEGMENTS + s2;
            indices.push(a0, b0, a1, a1, b0, b1);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    return geo;
}
function buildCapGeometry(center, flip) {
    const positions = [], normals = [], uvs = [], indices = [];
    positions.push(center.x, center.y, 0); normals.push(flip ? 1 : -1, 0, 0); uvs.push(0.5, 0.5);
    for (let s = 0; s <= SEGMENTS; s++) {
        const a = (s / SEGMENTS) * Math.PI * 2;
        positions.push(center.x, center.y + Math.cos(a) * center.r, Math.sin(a) * center.r);
        normals.push(flip ? 1 : -1, 0, 0);
        uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
    }
    for (let s = 1; s <= SEGMENTS; s++) {
        if (flip) indices.push(0, s, s + 1); else indices.push(0, s + 1, s);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    return geo;
}

// Rebuilds the whole 3D scene from currentTree/currentDefects/cuts — called
// whenever the 2D view would have redrawn (new stem, cut added/moved/removed,
// rotation, trim change).
function updateStem3D() {
    if (!stem3d || !totalLength) return;
    const s = stem3d;

    s.logGroup.clear();
    s.defectGroup.clear();
    s.cutGroup.clear();
    s.rulerGroup.clear();
    s.labelSprites.length = 0; // sprites themselves were just dropped by the .clear() calls above

    const centers = buildStem3DCenters();
    s.logGroup.add(new THREE.Mesh(buildLogTubeGeometry(centers), s.barkMat));
    s.logGroup.add(new THREE.Mesh(buildCapGeometry(centers[0], false), s.capMat));
    s.logGroup.add(new THREE.Mesh(buildCapGeometry(centers[centers.length - 1], true), s.capMat));

    currentDefects.forEach(d => {
        if (d.type === 'sweep') return; // sweep is baked into the bent geometry itself
        const midFt = (d.startFt + d.endFt) / 2;
        const c = stem3DCenterAt(midFt);
        const sizeFt = Math.max(0.25, (d.endFt - d.startFt) * 0.5);
        const color = d.color ? new THREE.Color(d.color) : 0xe3bd52;
        d.facesAffected.forEach(face => {
            const angle = (face / 4) * Math.PI * 2;
            const ny = Math.cos(angle), nz = Math.sin(angle);
            const geo = new THREE.CircleGeometry(sizeFt, 14);
            const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(c.x, c.y + ny * (c.r + 0.01), nz * (c.r + 0.01));
            mesh.lookAt(c.x, c.y + ny * (c.r + 2), nz * (c.r + 2));
            s.defectGroup.add(mesh);
        });
    });

    cuts.forEach(cutFt => {
        const c = stem3DCenterAt(cutFt);
        const ringGeo = new THREE.CylinderGeometry(c.r * 1.04, c.r * 1.04, 0.06, SEGMENTS);
        ringGeo.rotateZ(Math.PI / 2); // cylinder axis -> stem's X axis
        const ringMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6, transparent: true, opacity: 0.85 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(c.x, c.y, 0);
        s.cutGroup.add(ring);

        const label = makeLabelSprite(formatFeetInches(cutFt), 'rgba(0,40,85,0.82)', 150, 46);
        label.position.set(c.x, c.y + c.r + 26 * stem3DWorldPerPixel(), 0);
        s.cutGroup.add(label);
    });

    buildStem3DRuler(s.rulerGroup);

    // Roll Up/Down rotates the whole stem around its own long (X) axis —
    // rotation around X never changes a point's world-X, so cut-placement
    // math (which only reads world.x) stays correct at any roll.
    s.stemGroup.rotation.x = -logRotation * Math.PI / 2;

    // Frame the camera on the stem: target its midpoint, reset zoom/frustum.
    // Only reset when the stem itself changed length (a new stem loaded),
    // not on every cut edit — mid-drag re-framing would fight the user's zoom.
    s.target.set(totalLength / 2, 0, 0);
    if (s.framedLength !== totalLength) {
        s.dist = Math.max(20, totalLength * 1.2);
        s.zoom = 1;
        s.framedLength = totalLength;
        updateStem3DFrustum();
    }
    updateStem3DCamera();
}

// ─── 3D pointer interaction: orbit vs. add/drag/remove a cut ──────────────
// A pointerdown that hits an existing cut ring starts a drag (camera locked);
// otherwise the drag orbits the camera, and a near-zero-movement release
// places a new cut where the log was under the cursor.
function stem3DPointerNDC(e) {
    const rect = stem3dCanvas.getBoundingClientRect();
    return {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
    };
}
function stem3DRaycastX(e, targetsForFallbackPlane) {
    const s = stem3d;
    s.raycaster.setFromCamera(stem3DPointerNDC(e), s.camera);
    const hits = s.raycaster.intersectObjects(s.logGroup.children, false);
    if (hits.length) return hits[0].point.x;
    if (targetsForFallbackPlane) {
        const hit = new THREE.Vector3();
        if (s.raycaster.ray.intersectPlane(s.dragPlane, hit)) return hit.x;
    }
    return null;
}

function onStem3DPointerDown(e) {
    const s = stem3d;
    s.pointerDownPos = { x: e.clientX, y: e.clientY };
    s.moved = false;

    s.raycaster.setFromCamera(stem3DPointerNDC(e), s.camera);
    const cutHits = s.raycaster.intersectObjects(s.cutGroup.children.filter(o => o.geometry?.type === 'CylinderGeometry'), false);
    if (cutHits.length) {
        const hitX = cutHits[0].point.x;
        const idx = cuts.findIndex(c => Math.abs(c - hitX) < 0.6);
        if (idx !== -1) {
            s.dragMode = 'cut';
            s.dragIdx = idx;
            // Anchor the drag plane at the ring's actual world position (not
            // (cutFt,0,0)) — sweep offset means the cut ring may not sit on
            // the stem's nominal centerline, and rolling the stem rotates
            // that offset into Y/Z, so only the raycast hit point is correct.
            s.dragPlane.setFromNormalAndCoplanarPoint(
                s.camera.getWorldDirection(new THREE.Vector3()).negate(),
                cutHits[0].point
            );
            s.dragging = true;
            stem3dCanvas.setPointerCapture(e.pointerId);
            return;
        }
    }
    s.dragMode = 'orbit';
    s.dragging = true;
    stem3dCanvas.setPointerCapture(e.pointerId);
}

// Precise "where would this click cut" indicator — a bright ring at the
// exact snapped hit position, plus the same numeric tooltip the 2D view
// uses. This, not the chainsaw icon, is the thing to read before clicking.
function updateStem3DHoverPreview(e) {
    const s = stem3d;
    const tip = document.getElementById('hoverTooltip');
    const x = stem3DRaycastX(e, false);
    if (x === null) {
        s.hoverGroup.visible = false;
        if (tip) tip.style.display = 'none';
        return;
    }
    const snapX = Math.round(Math.max(0, Math.min(totalLength, x)) * 12) / 12;
    const onExistingCut = cuts.some(c => Math.abs(c - snapX) < 0.08);
    const c = stem3DCenterAt(snapX);

    s.hoverGroup.visible = !onExistingCut;
    if (!onExistingCut) {
        const ring = s.hoverGroup.children[0];
        ring.geometry.dispose();
        ring.geometry = new THREE.CylinderGeometry(c.r * 1.1, c.r * 1.1, 0.05, SEGMENTS);
        ring.geometry.rotateZ(Math.PI / 2);
        s.hoverGroup.position.set(c.x, c.y, 0);
    }

    if (tip) {
        const trueDia = stem3DDiameterAt(snapX);
        tip.textContent   = `${formatFeetInches(snapX)} | ⌀ ${trueDia.toFixed(1)}"`;
        tip.style.display = 'block';
        tip.style.left    = (e.clientX + 14) + 'px';
        tip.style.top     = (e.clientY - 32) + 'px';
    }
}

function onStem3DPointerMove(e) {
    const s = stem3d;
    if (!s.dragging) {
        showChainsaw(e.clientX, e.clientY, false);
        updateStem3DHoverPreview(e);
        return;
    }
    if (s.pointerDownPos) {
        const dx = e.clientX - s.pointerDownPos.x, dy = e.clientY - s.pointerDownPos.y;
        if (Math.hypot(dx, dy) > 4) s.moved = true;
    }

    // The moving cut ring (drag) or the orbiting camera is the feedback
    // during an active gesture — the separate hover preview would be
    // redundant and is hidden for the duration.
    s.hoverGroup.visible = false;

    if (s.dragMode === 'cut') {
        const x = stem3DRaycastX(e, true);
        if (x !== null) {
            const snapX = Math.round(Math.max(0, Math.min(totalLength, x)) * 12) / 12;
            cuts[s.dragIdx] = snapX;
            updateStem3D();
            const tip = document.getElementById('hoverTooltip');
            if (tip) {
                const trueDia = stem3DDiameterAt(snapX);
                tip.textContent   = `${formatFeetInches(snapX)} | ⌀ ${trueDia.toFixed(1)}"`;
                tip.style.display = 'block';
                tip.style.left    = (e.clientX + 14) + 'px';
                tip.style.top     = (e.clientY - 32) + 'px';
            }
        }
        showChainsaw(e.clientX, e.clientY, true);
    } else if (s.dragMode === 'orbit') {
        const dx = e.clientX - (s._lastX ?? e.clientX), dy = e.clientY - (s._lastY ?? e.clientY);
        s.azimuth -= dx * 0.006;
        s.polar = Math.min(Math.PI - 0.1, Math.max(0.1, s.polar - dy * 0.006));
        updateStem3DCamera();
        showChainsaw(e.clientX, e.clientY, false);
    }
    s._lastX = e.clientX; s._lastY = e.clientY;
}

function onStem3DPointerUp(e) {
    const s = stem3d;
    if (!s || !s.dragging) return;
    const wasCutDrag = s.dragMode === 'cut';
    const clickedWithoutMoving = !s.moved;

    if (wasCutDrag) {
        cuts.sort((a, b) => a - b);
    } else if (clickedWithoutMoving) {
        // Treated as a click on the log itself: add a cut there.
        const x = stem3DRaycastX(e, false);
        if (x !== null) {
            const snapX = Math.round(x * 12) / 12;
            cuts.push(snapX);
            cuts.sort((a, b) => a - b);
            pieceProduct = [];
        }
    }

    s.dragging = false; s.dragMode = null; s.dragIdx = -1;
    s._lastX = undefined; s._lastY = undefined;
    drawLog();
}

function onStem3DContextMenu(e) {
    e.preventDefault();
    const s = stem3d;
    s.raycaster.setFromCamera(stem3DPointerNDC(e), s.camera);
    const cutHits = s.raycaster.intersectObjects(s.cutGroup.children.filter(o => o.geometry?.type === 'CylinderGeometry'), false);
    if (!cutHits.length) return;
    const hitX = cutHits[0].point.x;
    const idx = cuts.findIndex(c => Math.abs(c - hitX) < 0.6);
    if (idx !== -1) { cuts.splice(idx, 1); pieceProduct = []; drawLog(); }
}

function onStem3DWheel(e) {
    e.preventDefault();
    const s = stem3d;
    // Orthographic zoom, not camera distance: scrolling changes s.zoom, which
    // scales the visible frustum — the log gets bigger/smaller on screen as
    // expected. Labels are deliberately the exception: they're sized in
    // constant screen pixels (see makeLabelSprite/applyLabelPixelScale), like
    // dimension text on an engineering drawing, so they stay legible whether
    // the log currently fills the frame or is zoomed out to fit a long stem —
    // that's what needs re-applying here on every zoom step, since these
    // sprites aren't being rebuilt from scratch the way a full updateStem3D()
    // pass would.
    s.zoom = Math.min(8, Math.max(0.4, s.zoom * (1 - e.deltaY * 0.001)));
    updateStem3DFrustum();
    s.labelSprites.forEach(applyLabelPixelScale);
}

// ─── Build Grading Reference Table ─────────────────────────────────────────
(function buildGradingTable() {
    const gradeColors = {
        'Prime': COLORS.feedback.success,
        'Select+': COLORS.wvuBlue,
        'Select': COLORS.wvuBlue,
        'No. 1+': COLORS.feedback.warning,
        'No. 1': COLORS.feedback.warning,
        'No. 2+': COLORS.feedback.error,
        'No. 2': COLORS.feedback.error,
        'No. 3': COLORS.wvuSlate
    };
    const diameters = [
        { label: '17"+', d: 17 }, { label: '16"', d: 16 }, { label: '15"', d: 15 },
        { label: '14"', d: 14 }, { label: '13"', d: 13 }, { label: '12"', d: 12 },
        { label: '11"', d: 11 }
    ];
    const tbody = document.getElementById('gradingTableBody');
    if (!tbody) return;
    diameters.forEach((row, ri) => {
        const tr = document.createElement('tr');
        tr.style.background = ri % 2 === 0 ? '#f9f9f9' : '#fff';
        tr.innerHTML = `<td style="padding:4px 10px; font-weight:bold;">${row.label}</td>`;
        for (let faces = 4; faces >= 0; faces--) {
            const { grade, pricePerBF } = getGradeAndPrice(row.d, faces);
            const bg = gradeColors[grade] || COLORS.wvuSlate;
            tr.innerHTML += `<td style="padding:4px 8px; text-align:center;">
                <span style="background:${bg}; color:#fff; padding:2px 6px; border-radius:3px; font-size:12px; white-space:nowrap;">
                    ${grade}<br><span style="font-size:10px; opacity:0.85;">$${pricePerBF.toFixed(2)}/bf</span>
                </span></td>`;
        }
        tbody.appendChild(tr);
    });
})();

// ─── Start Game ────────────────────────────────────────────────────────────
// Load prices and all selectable stem datasets in parallel.
Promise.allSettled([
    fetch('prices.json').then(r => r.json()),
    fetch('hw-stems/trees.json').then(r => r.json()),
    fetch('hw-stems/Millstudy_Stems.json').then(r => r.json()),
]).then(([priceResult, treeResult, millStudyResult]) => {
    if (priceResult.status === 'fulfilled') PRICES = priceResult.value;
    window.allStemTrees = treeResult.status === 'fulfilled' ? treeResult.value : [];
    window.millStudyData = millStudyResult.status === 'fulfilled' ? millStudyResult.value : { stems: [] };
    realTrees = getDatasetTrees(window.allStemTrees, window.millStudyData);
    updateDatasetStatus();
    loadLog(pickLog());
});
