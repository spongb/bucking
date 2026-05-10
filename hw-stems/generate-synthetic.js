'use strict';
/**
 * hw-stems/generate-synthetic.js
 * Run:  node hw-stems/generate-synthetic.js
 *
 * Generates synthetic Appalachian hardwood stems for the log-bucking training
 * game and appends them to hw-stems/trees.json starting at treeNum=1001.
 *
 * The script is idempotent: any previously-generated synthetic trees
 * (treeNum >= 1001) are stripped before new ones are inserted, so you can
 * re-run it freely to get a fresh synthetic dataset.
 */

const fs   = require('fs');
const path = require('path');

const OUT_FILE = path.join(__dirname, 'trees.json');

// ── Defect type metadata ──────────────────────────────────────────────────────
const DEFECT_META = {
    knot_cluster: { label: 'Knots',      color: '#8B4513', facePenalty: 1 },
    seam:         { label: 'Seam',       color: '#444444', facePenalty: 1 },
    sweep:        { label: 'Sweep',      color: '#DAA520', facePenalty: 1 },
    rot:          { label: 'Decay',      color: '#8B0000', facePenalty: 1 },
    end_check:    { label: 'Stem Check', color: '#555555' },
};

// ── Knuth Poisson algorithm ───────────────────────────────────────────────────
function poisson(lambda) {
    const l = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > l);
    return k - 1;
}

// ── Weighted random type picker ───────────────────────────────────────────────
// weights: { type: weight, ... }  Returns one type key.
function pickWeighted(weights) {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (const [key, w] of Object.entries(weights)) {
        r -= w;
        if (r <= 0) return key;
    }
    return Object.keys(weights)[Object.keys(weights).length - 1];
}

// ── Random helpers ────────────────────────────────────────────────────────────
function randFloat(lo, hi) { return lo + Math.random() * (hi - lo); }
function randInt(lo, hi)   { return Math.floor(randFloat(lo, hi + 1)); }
// Pick n unique elements from [0,1,2,3]
function pickFaces(n) {
    const pool = [0, 1, 2, 3];
    const out  = [];
    for (let i = 0; i < Math.min(n, 4); i++) {
        const idx = Math.floor(Math.random() * pool.length);
        out.push(pool.splice(idx, 1)[0]);
    }
    return out.sort((a, b) => a - b);
}

// ── Make a single defect ──────────────────────────────────────────────────────
// Returns a defect object or null if it doesn't fit cleanly on the stem.
function makeDefect(type, stemLength) {
    const meta = DEFECT_META[type];
    let startFt, endFt, facesAffected, widthIn;

    if (type === 'knot_cluster') {
        // Preferentially place in upper 60% (butt end = 0ft, top end = stemLength)
        // "Upper 60%" means farther from butt, i.e. startFt in [40% of stem, stem end]
        const len = randFloat(0.3, 1.5);
        const useUpper = Math.random() < 0.65;
        const zoneStart = useUpper ? stemLength * 0.40 : 0;
        const zoneEnd   = stemLength - len;
        if (zoneEnd < zoneStart) {
            // Stem too short for preferred zone; fall back to anywhere
            startFt = randFloat(0, Math.max(0, stemLength - len));
        } else {
            startFt = randFloat(zoneStart, zoneEnd);
        }
        endFt = startFt + len;
        const nFaces = randInt(1, 2);
        facesAffected = pickFaces(nFaces);

    } else if (type === 'seam') {
        const len = randFloat(2.0, 7.0);
        startFt = randFloat(0, Math.max(0, stemLength - len));
        endFt   = startFt + len;
        const nFaces = randInt(1, 2);
        facesAffected = pickFaces(nFaces);

    } else if (type === 'sweep') {
        const len = randFloat(3.0, 11.0);
        startFt = randFloat(0, Math.max(0, stemLength - len));
        endFt   = startFt + len;
        facesAffected = pickFaces(1); // always single face (sweep direction)
        widthIn = Math.round(randFloat(0.5, 3.0) * 10) / 10;

    } else if (type === 'rot') {
        const len = randFloat(1.0, 3.5);
        // 50% chance near butt (0-4 ft)
        if (Math.random() < 0.5) {
            const buttZoneEnd = Math.min(4.0, stemLength - len);
            startFt = buttZoneEnd > 0 ? randFloat(0, buttZoneEnd) : 0;
        } else {
            startFt = randFloat(0, Math.max(0, stemLength - len));
        }
        endFt = startFt + len;
        const nFaces = randInt(1, 3);
        facesAffected = pickFaces(nFaces);

    } else if (type === 'end_check') {
        const len = randFloat(0.5, 2.5);
        // Always starts 0-1.5 ft from butt
        startFt = randFloat(0, Math.min(1.5, Math.max(0, stemLength - len)));
        endFt   = startFt + len;
        facesAffected = [0, 1, 2, 3]; // end_check always spans full cross-section

    } else {
        return null;
    }

    // Clamp endFt to stem; drop if resulting length is too small
    endFt = Math.min(stemLength, endFt);
    if (endFt - startFt < 0.25) return null;

    const defect = {
        type,
        label:        meta.label,
        color:        meta.color,
        facePenalty:  meta.facePenalty ?? 1,
        startFt:      Math.round(startFt * 10) / 10,
        endFt:        Math.round(endFt   * 10) / 10,
        facesAffected,
    };

    if (type === 'sweep') {
        defect.widthIn = widthIn;
    }

    return defect;
}

// ── Species definitions ───────────────────────────────────────────────────────
// Each entry describes one species and its generation parameters.
const SPECIES_DEFS = [
    {
        species:     'YELLOW POPLAR',
        count:       30,
        lengthMin:   30, lengthMax:   52,
        buttMin:     13, buttMax:     28,
        taperRateMin: 0.11, taperRateMax: 0.17,
        avgDefects:  1.2,
        weights: { knot_cluster: 30, seam: 30, sweep: 25, rot: 10, end_check: 5 },
    },
    {
        species:     'RED OAK',
        count:       25,
        lengthMin:   24, lengthMax:   44,
        buttMin:     13, buttMax:     26,
        taperRateMin: 0.15, taperRateMax: 0.25,
        avgDefects:  2.0,
        weights: { knot_cluster: 45, seam: 15, sweep: 20, rot: 15, end_check: 5 },
    },
    {
        species:     'WHITE OAK',
        count:       25,
        lengthMin:   20, lengthMax:   40,
        buttMin:     13, buttMax:     24,
        taperRateMin: 0.15, taperRateMax: 0.26,
        avgDefects:  2.4,
        weights: { knot_cluster: 38, seam: 20, sweep: 18, rot: 19, end_check: 5 },
    },
    {
        species:     'WHITE ASH',
        count:       20,
        lengthMin:   28, lengthMax:   48,
        buttMin:     12, buttMax:     22,
        taperRateMin: 0.12, taperRateMax: 0.20,
        avgDefects:  1.5,
        weights: { knot_cluster: 40, seam: 32, sweep: 18, rot: 8, end_check: 2 },
    },
    {
        species:     'BLACK CHERRY',
        count:       20,
        lengthMin:   28, lengthMax:   44,
        buttMin:     11, buttMax:     21,
        taperRateMin: 0.11, taperRateMax: 0.18,
        avgDefects:  1.0,
        weights: { knot_cluster: 38, seam: 38, sweep: 18, rot: 5, end_check: 1 },
    },
    {
        species:     'BLACK WALNUT',
        count:       15,
        lengthMin:   20, lengthMax:   36,
        buttMin:     12, buttMax:     22,
        taperRateMin: 0.13, taperRateMax: 0.21,
        avgDefects:  1.6,
        weights: { knot_cluster: 38, seam: 20, sweep: 24, rot: 13, end_check: 5 },
    },
    {
        species:     'BASSWOOD',
        count:       15,
        lengthMin:   24, lengthMax:   40,
        buttMin:     11, buttMax:     20,
        taperRateMin: 0.12, taperRateMax: 0.18,
        avgDefects:  1.5,
        weights: { knot_cluster: 33, seam: 35, sweep: 18, rot: 12, end_check: 2 },
    },
    {
        species:     'SHAGBARK HICKORY',
        count:       15,
        lengthMin:   18, lengthMax:   36,
        buttMin:     11, buttMax:     20,
        taperRateMin: 0.15, taperRateMax: 0.23,
        avgDefects:  2.2,
        weights: { knot_cluster: 45, seam: 20, sweep: 22, rot: 10, end_check: 3 },
    },
];

// ── Generate trees for one species def ───────────────────────────────────────
function generateSpecies(def, startNum) {
    const trees = [];
    for (let i = 0; i < def.count; i++) {
        const treeNum = startNum + i;

        // Stem dimensions
        const length = Math.round(randFloat(def.lengthMin, def.lengthMax) * 10) / 10;
        const butt   = randInt(def.buttMin, def.buttMax);

        const taperRate = randFloat(def.taperRateMin, def.taperRateMax);
        let taper = Math.round(taperRate * length);
        let top   = Math.max(8, butt - taper);

        // Ensure always tapers (top < butt)
        if (top >= butt) top = butt - 2;

        // Defects
        let nDefects = poisson(def.avgDefects);
        nDefects = Math.min(nDefects, 6);

        const defects = [];
        for (let d = 0; d < nDefects; d++) {
            const type   = pickWeighted(def.weights);
            const defect = makeDefect(type, length);
            if (defect) defects.push(defect);
        }

        trees.push({
            treeNum,
            species: def.species,
            length,
            butt,
            top,
            defects,
        });
    }
    return trees;
}

// ── Main ──────────────────────────────────────────────────────────────────────
// 1. Read existing trees.json
let existing = [];
if (fs.existsSync(OUT_FILE)) {
    try {
        existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
    } catch (e) {
        console.error('Could not parse existing trees.json:', e.message);
        process.exit(1);
    }
}

// 2. Strip any previously-generated synthetic trees (treeNum >= 1001)
const realTrees = existing.filter(t => t.treeNum < 1001);
const stripped  = existing.length - realTrees.length;
if (stripped > 0) {
    console.log(`Stripped ${stripped} previously-generated synthetic tree(s).`);
}

// 3. Generate new synthetic trees
const synthetic = [];
let nextNum = 1001;
for (const def of SPECIES_DEFS) {
    const batch = generateSpecies(def, nextNum);
    synthetic.push(...batch);
    nextNum += def.count;
}

// 4. Combine real + synthetic
const combined = [...realTrees, ...synthetic];

// 5. Write combined array back to trees.json
fs.writeFileSync(OUT_FILE, JSON.stringify(combined, null, 2), 'utf8');

// 6. Print summary
console.log(`\nWrote ${combined.length} total trees to ${path.relative(process.cwd(), OUT_FILE)}`);
console.log(`  Real trees:      ${realTrees.length}`);
console.log(`  Synthetic trees: ${synthetic.length}\n`);

// Per-species breakdown
const speciesCounts = {};
const speciesDefects = {};
synthetic.forEach(t => {
    speciesCounts[t.species]  = (speciesCounts[t.species]  || 0) + 1;
    speciesDefects[t.species] = (speciesDefects[t.species] || 0) + t.defects.length;
});

console.log('Species breakdown:');
const maxNameLen = Math.max(...Object.keys(speciesCounts).map(s => s.length));
for (const sp of Object.keys(speciesCounts)) {
    const n    = speciesCounts[sp];
    const dAvg = (speciesDefects[sp] / n).toFixed(1);
    console.log(`  ${sp.padEnd(maxNameLen)}  ${String(n).padStart(3)} trees  avg ${dAvg} defects/tree`);
}
console.log(`\nSynthetic treeNum range: 1001 – ${nextNum - 1}`);
