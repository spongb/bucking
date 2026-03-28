/**
 * hw-stems/build-dataset.js
 * Run once:  node hw-stems/build-dataset.js
 *
 * Reads every TREE*.shp + TREE*.def pair, converts to the game's defect model,
 * and writes hw-stems/trees.json which the browser loads at startup.
 *
 * ── Unit notes ────────────────────────────────────────────────────────────────
 * Despite the parser's "heightIn" field names (named from the original data
 * description which called them "inches"), stem positions in both .shp and .def
 * are in FEET — confirmed by cross-checking defect positions against stem
 * lengths (e.g. TREE1: stem ends at 40.6, max defect at 38.2, both in feet).
 * Width and height-dimension fields in .def remain in INCHES.
 */

'use strict';
const fs   = require('fs');
const path = require('path');
const { parseShp, parseDef } = require('./parser.js');

const SHAPES_DIR  = path.join(__dirname, 'Shapes');
const DEFECTS_DIR = path.join(__dirname, 'DEFECTS');
const OUT_FILE    = path.join(__dirname, 'trees.json');

// ── Defect type → game representation ────────────────────────────────────────
// Type codes are taken verbatim from HW Buck's .def file format.
// The 11 codes below were reverse-engineered from the dataset — only K, BU, SE, and F
// are documented in the original HW Buck user materials; DY, BE, H, LD, SN, SR, UW
// were inferred from field-count patterns in the raw .def files.
//
// facePenalty: HW Buck's grading logic weighted rot-type defects (DY/SR/SN) as a
// double face deduction. All penalties are currently 1 (uniform), matching the
// simplified AHMI rules used by the game. Set rot types to 2 to restore HW Buck
// severity weighting if needed.
//
// SE (sweep) is handled differently: it feeds into a diameter deduction rather than
// a face penalty — see convertDefect() and applySweepDeduction() in script.js.
//
// BE (bole end check) is also handled differently: it is a radial end split that
// consumes usable log length rather than blocking a face. It carries type 'end_check'
// and triggers a length deduction in scoreSegments / computeOptimal in script.js.
const TYPE_INFO = {
    K:  { type: 'knot_cluster', label: 'Knots',     color: '#8B4513', facePenalty: 1 },
    BU: { type: 'knot_cluster', label: 'Burl',      color: '#A0522D', facePenalty: 1 },
    LD: { type: 'knot_cluster', label: 'Knots',     color: '#8B4513', facePenalty: 1 },
    SE: { type: 'sweep',        label: 'Sweep',     color: '#DAA520', facePenalty: 1 },
    DY: { type: 'rot',          label: 'Decay',     color: '#8B0000', facePenalty: 1 },
    SR: { type: 'rot',          label: 'Stain/Rot', color: '#8B0000', facePenalty: 1 },
    SN: { type: 'rot',          label: 'Stain',     color: '#7B0000', facePenalty: 1 },
    UW: { type: 'seam',         label: 'Defect',    color: '#444444', facePenalty: 1 },
    F:  { type: 'seam',         label: 'Fork',      color: '#444444', facePenalty: 1 },
    BE: { type: 'end_check',    label: 'Stem Check', color: '#555555' },
    H:  { type: 'seam',         label: 'Hole',      color: '#556B2F', facePenalty: 1 },
};
const DEFAULT_TYPE_INFO = { type: 'knot_cluster', label: 'Defect', color: '#8B4513', facePenalty: 1 };

// ── Face-spread helper ────────────────────────────────────────────────────────
// Given a HW Buck center position (0–35) and a lateral width in inches, return
// the set of game quadrants (0–3) the defect spans, using the log diameter at
// that height to convert inches → face positions.
function facesFromWidth(centerPos, widthIn, diaAtHeight) {
    const circumference = Math.PI * diaAtHeight;
    const inchesPerPos  = circumference / 36;
    const halfSpanPos   = widthIn > 0 ? (widthIn / 2) / inchesPerPos : 0;
    const lo = centerPos - halfSpanPos;
    const hi = centerPos + halfSpanPos;
    const faceSet = new Set();
    for (let p = Math.floor(lo); p <= Math.ceil(hi); p++) {
        const norm = ((p % 36) + 36) % 36;
        faceSet.add(Math.floor(norm / 9) % 4);
    }
    return [...faceSet];
}

// ── Convert one defect row → game defect (or null to skip) ───────────────────
// buttDia / topDia are needed to interpolate log diameter at defect height,
// which is required to translate HW Buck's angular widthIn to quadrant coverage.
function convertDefect(d, stemLengthFt, buttDia, topDia) {
    if (d.parseError) return null;

    const info = TYPE_INFO[d.type] || DEFAULT_TYPE_INFO;
    let startFt, endFt, facesAffected;
    const out = {};

    if (d.type === 'F') {
        // Fork: spans the full cross-section — all four faces blocked.
        // HW Buck encodes F with only start/end height (no face position).
        startFt       = d.startHeightIn;
        endFt         = d.endHeightIn;
        facesAffected = [0, 1, 2, 3];
    } else if (d.type === 'BE') {
        // Bole end check: a radial end split that consumes usable length.
        // HW Buck encodes BE with only start/end height — no face position.
        // Type 'end_check' triggers a length deduction in scoring rather than
        // a face penalty. facesAffected is kept full for visual display only.
        startFt       = d.startHeightIn;
        endFt         = d.endHeightIn;
        facesAffected = [0, 1, 2, 3];
    } else if (d.type === 'H') {
        // Span + location: heights in FEET, widthIn in inches.
        startFt = d.startHeightIn;
        endFt   = d.endHeightIn;
        facesAffected = [Math.floor(d.face / 9) % 4];
    } else if (d.type === 'SE') {
        // Sweep: treated as a diameter deduction, not a face penalty.
        // Store widthIn (the measured sweep in inches) so applySweepDeduction()
        // can use the actual magnitude instead of a flat 0.5" estimate.
        const extentFt = d.heightDimIn > 0 ? d.heightDimIn / 12 : 0.5;
        startFt = d.heightIn;
        endFt   = d.heightIn + extentFt;
        // Face position tells us sweep direction; single quadrant is correct here.
        facesAffected = [Math.floor(d.face / 9) % 4];
        out.widthIn   = d.widthIn; // actual sweep magnitude in inches
    } else {
        // Point defects (K, BU, DY, LD, SR, SN, UW).
        // HW Buck stored circumferential position as an integer 0–35 (36-stop clock)
        // AND a lateral width in inches. Use both to determine which quadrants are
        // covered, interpolating log diameter at the defect height for the conversion.
        const extentFt    = d.heightDimIn > 0 ? d.heightDimIn / 12 : 0.5;
        startFt           = d.heightIn;
        endFt             = d.heightIn + extentFt;
        const frac        = startFt / stemLengthFt;
        const diaAtDefect = buttDia - (buttDia - topDia) * frac;
        facesAffected     = facesFromWidth(d.face, d.widthIn, diaAtDefect);
    }

    // Clamp to stem bounds; drop defects that are fully outside or trivially small.
    startFt = Math.max(0, startFt);
    endFt   = Math.min(stemLengthFt, endFt);
    if (endFt - startFt < 0.25) return null;

    return Object.assign(out, {
        type:         info.type,
        label:        info.label,
        color:        info.color,
        startFt:      Math.round(startFt * 10) / 10,
        endFt:        Math.round(endFt   * 10) / 10,
        facesAffected,
    });
}

// ── Convert one tree pair ─────────────────────────────────────────────────────
function convertTree(treeNum, shpData, defData) {
    const good = shpData.measurements.filter(m => !m.parseError);
    if (good.length < 2) return null;

    // Heights in parser output are in FEET; diameters in INCHES.
    const buttDia      = good[0].diameterIn;
    const topMeasure   = good[good.length - 1];
    const topDia       = topMeasure.diameterIn;
    const stemLengthFt = topMeasure.heightIn; // FEET — see unit note at top

    // Skip stems too short to yield even one 8-foot log (with trim)
    if (stemLengthFt < 9 || topDia < 7) return null;

    const defects = defData.defects
        .map(d => convertDefect(d, stemLengthFt, buttDia, topDia))
        .filter(Boolean);

    return {
        treeNum,
        species: shpData.species,
        length:  Math.round(stemLengthFt * 10) / 10,
        butt:    buttDia,
        top:     topDia,
        defects,
    };
}

// ── Main ──────────────────────────────────────────────────────────────────────
const shpFiles  = fs.readdirSync(SHAPES_DIR).filter(f => /\.shp$/i.test(f));
const defFiles  = fs.readdirSync(DEFECTS_DIR).filter(f => /\.def$/i.test(f));

// Build a lookup: treeNum → def filename
const defByNum = {};
defFiles.forEach(f => {
    const m = f.match(/TREE(\d+)/i);
    if (m) defByNum[parseInt(m[1])] = f;
});

const trees  = [];
let skipped  = 0;
let errors   = 0;

shpFiles.forEach(shpFile => {
    const m = shpFile.match(/TREE(\d+)/i);
    if (!m) return;
    const treeNum = parseInt(m[1]);
    const defFile = defByNum[treeNum];
    if (!defFile) { console.warn(`  No .def for TREE${treeNum}`); skipped++; return; }

    try {
        const shpData = parseShp(fs.readFileSync(path.join(SHAPES_DIR,  shpFile), 'utf8'));
        const defData = parseDef(fs.readFileSync(path.join(DEFECTS_DIR, defFile), 'utf8'));
        const tree    = convertTree(treeNum, shpData, defData);
        if (tree) {
            trees.push(tree);
        } else {
            console.warn(`  Skipped TREE${treeNum}: too short or small`);
            skipped++;
        }
    } catch (e) {
        console.error(`  Error TREE${treeNum}:`, e.message);
        errors++;
    }
});

trees.sort((a, b) => a.treeNum - b.treeNum);
fs.writeFileSync(OUT_FILE, JSON.stringify(trees, null, 2), 'utf8');

console.log(`\nWrote ${trees.length} trees to ${path.relative(process.cwd(), OUT_FILE)}`);
console.log(`Skipped: ${skipped}  Errors: ${errors}`);
console.log('\nTree summary:');
trees.forEach(t => {
    const defCounts = {};
    t.defects.forEach(d => { defCounts[d.type] = (defCounts[d.type] || 0) + 1; });
    const summary = Object.entries(defCounts).map(([k,v]) => `${v}×${k}`).join(', ');
    console.log(`  TREE${String(t.treeNum).padStart(3)}: ${t.species.padEnd(14)} ${t.length}ft  ${t.butt}"→${t.top}"  [${summary || 'no defects'}]`);
});
