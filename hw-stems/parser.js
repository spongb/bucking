/**
 * hw-stems parser
 * Works in Node.js (require/fs) and the browser (script tag → window.hwStems).
 *
 * API
 * ───
 *   parseShp(text)  → ShpFile
 *   parseDef(text)  → DefFile
 *
 * ── ShpFile ──────────────────────────────────────────────────────────────────
 *   {
 *     species:      string,          // e.g. "RED OAK"
 *     author:       string,          // e.g. "THOREN"
 *     date:         string,          // e.g. "6/24/88"
 *     measurements: ShpRow[]
 *   }
 *
 *   ShpRow (good): { heightIn, diameterIn, leftOffsetIn, rightOffsetIn }
 *   Note: despite the "In" suffix (inherited from HW Buck's original data description
 *   which labelled the column "inches"), heightIn is in FEET — confirmed by
 *   cross-referencing defect positions against stem lengths in the real dataset.
 *   diameterIn, leftOffsetIn, and rightOffsetIn are genuine inches.
 *
 *   ShpRow (bad):  { raw: string, parseError: string }
 *   Returned when a row cannot be parsed (e.g. data-entry typo "O" instead of "0").
 *
 * ── DefFile ──────────────────────────────────────────────────────────────────
 *   { defects: Defect[] }
 *
 *   Point defect (K, BU, SE, DY, LD, SR, SN, UW, and any unknown 4-field type)
 *   { type, heightIn, face, widthIn, heightDimIn }
 *     type      — type code string (e.g. "K")
 *     heightIn  — height on stem in inches
 *     face      — circumferential face position, 0–35
 *     widthIn   — defect width in inches
 *     heightDimIn — defect height in inches
 *
 *   Span defect (F, BE)
 *   { type, startHeightIn, endHeightIn }
 *     startHeightIn / endHeightIn — height range on stem in inches
 *
 *   Span-with-location defect (H)
 *   { type, startHeightIn, endHeightIn, face, widthIn }
 *     face   — circumferential face position, 0–35
 *     widthIn — defect width in inches
 *
 *   Unknown/unparseable rows are returned as:
 *   { type, raw: string, parseError: string }
 */

// Types whose rows encode a height span with no face/size data
const SPAN_TYPES     = new Set(['F', 'BE']);
// Types whose rows encode a height span plus a face location and width
const SPAN_LOC_TYPES = new Set(['H']);

// ── .shp parser ───────────────────────────────────────────────────────────────

/**
 * @param {string} text  Raw text content of a .shp file.
 * @returns {{ species: string, author: string, date: string, measurements: Array }}
 */
function parseShp(text) {
    const lines = splitLines(text);
    if (lines.length === 0) throw new Error('Empty .shp file');

    // Line 0: "RED OAK , THOREN , 6/24/88"
    const headerParts = lines[0].split(',').map(s => s.trim());
    const species = headerParts[0] || '';
    const author  = headerParts[1] || '';
    const date    = headerParts[2] || '';

    const measurements = [];
    for (let i = 1; i < lines.length; i++) {
        const line   = lines[i];
        const tokens = tokenize(line);
        if (tokens.length === 0) continue;
        try {
            if (tokens.length !== 4) {
                throw new Error(
                    `expected 4 columns (height dia leftOff rightOff), got ${tokens.length}`
                );
            }
            measurements.push({
                heightIn:      parseNum(tokens[0], 'heightIn',      i + 1),
                diameterIn:    parseNum(tokens[1], 'diameterIn',    i + 1),
                leftOffsetIn:  parseNum(tokens[2], 'leftOffsetIn',  i + 1),
                rightOffsetIn: parseNum(tokens[3], 'rightOffsetIn', i + 1),
            });
        } catch (err) {
            measurements.push({ raw: line, parseError: `line ${i + 1}: ${err.message}` });
        }
    }

    return { species, author, date, measurements };
}

// ── .def parser ───────────────────────────────────────────────────────────────

/**
 * @param {string} text  Raw text content of a .def file.
 * @returns {{ defects: Array }}
 */
function parseDef(text) {
    const lines   = splitLines(text);
    const defects = [];

    for (let i = 0; i < lines.length; i++) {
        const line   = lines[i];
        const tokens = tokenize(line);
        if (tokens.length === 0) continue;

        const type = tokens[0].toUpperCase();
        const nums = tokens.slice(1);
        const lineNum = i + 1;

        try {
            if (SPAN_TYPES.has(type)) {
                // F, BE  →  startHeightIn  endHeightIn
                assertFieldCount(nums, 2, type, lineNum, line);
                defects.push({
                    type,
                    startHeightIn: parseNum(nums[0], 'startHeightIn', lineNum),
                    endHeightIn:   parseNum(nums[1], 'endHeightIn',   lineNum),
                });
            } else if (SPAN_LOC_TYPES.has(type)) {
                // H  →  startHeightIn  endHeightIn  face  widthIn
                assertFieldCount(nums, 4, type, lineNum, line);
                defects.push({
                    type,
                    startHeightIn: parseNum(nums[0], 'startHeightIn', lineNum),
                    endHeightIn:   parseNum(nums[1], 'endHeightIn',   lineNum),
                    face:          parseNum(nums[2], 'face',          lineNum),
                    widthIn:       parseNum(nums[3], 'widthIn',       lineNum),
                });
            } else {
                // K, BU, SE, DY, LD, SR, SN, UW (and any future 4-field type)
                // →  heightIn  face  widthIn  heightDimIn
                assertFieldCount(nums, 4, type, lineNum, line);
                defects.push({
                    type,
                    heightIn:    parseNum(nums[0], 'heightIn',    lineNum),
                    face:        parseNum(nums[1], 'face',        lineNum),
                    widthIn:     parseNum(nums[2], 'widthIn',     lineNum),
                    heightDimIn: parseNum(nums[3], 'heightDimIn', lineNum),
                });
            }
        } catch (err) {
            defects.push({ type: tokens[0], raw: line, parseError: err.message });
        }
    }

    return { defects };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Split text into non-empty trimmed lines, handling \r\n, \n, and legacy DOS \u001a EOF markers. */
function splitLines(text) {
    return text
        // Strip CP/M / DOS EOF byte (0x1A = Ctrl+Z). Every HW Buck .shp and .def file
        // has this byte appended to the last line — a CP/M-era artifact that causes
        // Number("7\u001a") → NaN, corrupting the last token on every file.
        .replace(/\u001a/g, '')
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l.length > 0);
}

/** Split a line on whitespace, returning non-empty tokens. */
function tokenize(line) {
    return line.trim().split(/\s+/).filter(t => t.length > 0);
}

/** Parse a string token as a finite number, throwing with context on failure. */
function parseNum(token, fieldName, lineNum) {
    const n = Number(token);
    if (!isFinite(n)) {
        throw new Error(`line ${lineNum}: "${fieldName}" is not a number: "${token}"`);
    }
    return n;
}

/** Assert that nums has exactly count elements, throwing with context on failure. */
function assertFieldCount(nums, count, type, lineNum, line) {
    if (nums.length !== count) {
        throw new Error(
            `line ${lineNum}: type ${type} expects ${count} field(s) after the type code, ` +
            `got ${nums.length}: "${line}"`
        );
    }
}

// ── Export ────────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
    // Node.js
    module.exports = { parseShp, parseDef };
} else {
    // Browser
    window.hwStems = { parseShp, parseDef };
}
