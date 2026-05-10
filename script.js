// ─── Game State ────────────────────────────────────────────────────────────
const TOTAL_LOGS = 5;
let currentLogIndex = 0;
let logScores = [];
let cuts = [];
let dragIdx = -1;
let totalLength, buttDia, topDia, currentTree;
let currentDefects = [];
let logRotation = 0; // 0–3: which face index is currently on top

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
    }
};

// ─── Grade Prices (per board foot) ────────────────────────────────────────
// Loaded from prices.json at startup; falls back to these defaults if unavailable.
let PRICES = {
    'Prime': 2.50, 'Select+': 2.10, 'Select': 1.80,
    'No. 1+': 1.50, 'No. 1': 1.20, 'No. 2+': 1.00, 'No. 2': 0.80, 'No. 3': 0.30
};

// ─── Real Tree Dataset ─────────────────────────────────────────────────────
// Loaded from hw-stems/trees.json at startup. Falls back to random generation
// if the file is unavailable (e.g. opening index.html directly without the server).
let realTrees = [];
let usedTreeIndices = new Set(); // avoid repeating trees within a session

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
    logRotation    = 0;
    currentDefects = logObj.defects || generateDefects(totalLength);

    const displaySpecies = logObj.species
        ? logObj.species.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
        : 'Hardwood';
    document.getElementById('logDesc').textContent =
        `${displaySpecies} — ${totalLength}ft  |  Butt: ${buttDia}"  |  Top: ${topDia}"`;
    document.getElementById('logCounter').textContent =
        `Log ${currentLogIndex + 1} of ${TOTAL_LOGS}`;
    document.getElementById('nextLog').style.display   = 'none';
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
    const html = `<details style="margin:6px 0 12px; font-size:13px; text-align:left;" open>
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
    drawLogGraphic(ctx, canvas, cuts);
    drawFaceMap(faceCtx, faceCanvas, currentDefects, cuts);
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
        points.push({ x: ft * scale, radiusPx });
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
            if (i === 0) context.moveTo(p.x, yCenter + t * p.radiusPx);
            else         context.lineTo(p.x, yCenter + t * p.radiusPx);
        }
        for (let i = points.length - 1; i >= 0; i--) {
            context.lineTo(points[i].x, yCenter + b * points[i].radiusPx);
        }
        context.closePath();
        context.fillStyle = bandShade[vf];
        context.fill();

        // Subtle defect-color tint over this band if that face has a defect
        if (faceDefColors[absF]) {
            context.beginPath();
            for (let i = 0; i < points.length; i++) {
                const p = points[i];
                if (i === 0) context.moveTo(p.x, yCenter + t * p.radiusPx);
                else         context.lineTo(p.x, yCenter + t * p.radiusPx);
            }
            for (let i = points.length - 1; i >= 0; i--) {
                context.lineTo(points[i].x, yCenter + b * points[i].radiusPx);
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
            if (i === 0) context.moveTo(p.x, yCenter + bandBotFrac[vf] * p.radiusPx);
            else         context.lineTo(p.x, yCenter + bandBotFrac[vf] * p.radiusPx);
        }
        context.strokeStyle = 'rgba(0,0,0,0.22)';
        context.lineWidth   = Math.max(0.5, 1 * Hs);
        context.stroke();
    }

    // Specular highlight along the top edge
    context.beginPath();
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (i === 0) context.moveTo(p.x, yCenter - p.radiusPx);
        else         context.lineTo(p.x, yCenter - p.radiusPx);
    }
    for (let i = points.length - 1; i >= 0; i--) {
        context.lineTo(points[i].x, yCenter - points[i].radiusPx + Math.max(3, 5 * Hs));
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
        if (i === 0) context.moveTo(p.x, yCenter - p.radiusPx);
        else         context.lineTo(p.x, yCenter - p.radiusPx);
    }
    context.stroke();
    context.beginPath();
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (i === 0) context.moveTo(p.x, yCenter + p.radiusPx);
        else         context.lineTo(p.x, yCenter + p.radiusPx);
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

        context.globalAlpha = 0.78;

        d.facesAffected.forEach(face => {
            const vf = (face - logRotation + 4) % 4; // visual position for this face
            const fy = yCenter + FACE_Y_FRAC[vf] * r;
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
        context.strokeText(d.label, (x1 + x2) / 2, yCenter - r - 6 * Hs);
        context.fillStyle   = d.color;
        context.fillText(d.label, (x1 + x2) / 2, yCenter - r - 6 * Hs);
    });
}

// ─── Mouse Event Handlers ──────────────────────────────────────────────────
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x    = (e.clientX - rect.left) * totalLength / rect.width;

    const idx = cuts.findIndex(c => Math.abs(c - x) < 0.4);
    if (idx !== -1) {
        dragIdx = idx;
    } else {
        const snapX = Math.round(x * 10) / 10;
        cuts.push(snapX);
        cuts.sort((a, b) => a - b);
        dragIdx = cuts.indexOf(snapX);
        drawLog();
    }
});

window.addEventListener('mousemove', (e) => {
    const rect      = canvas.getBoundingClientRect();
    const relX      = e.clientX - rect.left;
    const relY      = e.clientY - rect.top;
    const overCanvas = relX >= 0 && relX <= rect.width && relY >= 0 && relY <= rect.height;
    const ft        = Math.max(0, Math.min(totalLength, relX * totalLength / rect.width));

    if (dragIdx !== -1) {
        cuts[dragIdx] = Math.round(ft * 10) / 10;
        drawLog();
    } else if (overCanvas) {
        const idx = cuts.findIndex(c => Math.abs(c - ft) < 0.4);
        canvas.style.cursor = (idx !== -1) ? 'ew-resize' : 'crosshair';
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
});

// Right-click on a cut marker to remove it
canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const ft   = (e.clientX - rect.left) * totalLength / rect.width;
    const idx  = cuts.findIndex(c => Math.abs(c - ft) < 0.6);
    if (idx !== -1) { cuts.splice(idx, 1); drawLog(); }
});

window.addEventListener('mouseup', () => {
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
        const snapX = Math.round(x * 10) / 10;
        cuts.push(snapX);
        cuts.sort((a, b) => a - b);
        dragIdx = cuts.indexOf(snapX);
        drawLog();
    }
}, { passive: false });

window.addEventListener('touchmove', (e) => {
    if (dragIdx === -1) return;
    e.preventDefault();
    const rect  = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x     = (touch.clientX - rect.left) * totalLength / rect.width;
    cuts[dragIdx] = Math.round(Math.max(0, Math.min(totalLength, x)) * 10) / 10;
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
function applySweepDeduction(baseDia, startFt, endFt, defects) {
    let dia = baseDia;
    defects.forEach(d => {
        if (d.type === 'sweep' && d.startFt < endFt && d.endFt > startFt) {
            dia -= (d.widthIn > 0) ? d.widthIn : 1;
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
function scoreSegments(cutList, defects) {
    const trim = getTrim();
    const standardLengths = [16, 14, 12, 10, 8];
    let totalValue = 0;
    const segs = [];
    const allPoints = [...cutList, totalLength];
    let prevFt = 0;

    allPoints.forEach(endFt => {
        const physicalLen = endFt - prevFt;

        // Bole-end checks consume usable log length — deduct their span from maxNomLen
        let ecDeduction = 0;
        defects.forEach(d => {
            if (d.type === 'end_check' && d.startFt < endFt && d.endFt > prevFt)
                ecDeduction += Math.min(d.endFt, endFt) - Math.max(d.startFt, prevFt);
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
            const scalingFt  = prevFt + nomLen;
            const frac       = scalingFt / totalLength;
            const scalingDia = buttDia - (buttDia - topDia) * frac;

            const effectiveDia = applySweepDeduction(scalingDia, prevFt, prevFt + nomLen, defects);

            const clearFaces = getClearFaces(prevFt, prevFt + nomLen, defects);
            const volumeBF   = doyleVolume(effectiveDia, nomLen);
            const gradeInfo  = getGradeAndPrice(effectiveDia, clearFaces);
            const value      = Math.round(volumeBF * gradeInfo.pricePerBF);

            totalValue += value;
            segs.push({ startFt: prevFt, endFt, physicalLen, nomLen, scalingDia, clearFaces, volumeBF, gradeInfo, value });
        } else {
            segs.push({ startFt: prevFt, endFt, physicalLen, nomLen: 0, scalingDia: 0, clearFaces: 0, volumeBF: 0,
                        gradeInfo: { grade: 'Pulp/Waste', pricePerBF: 0 }, value: 0 });
        }
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
            html += `<div class="segment">
                Piece ${i+1}: <strong>${s.nomLen}'</strong> log
                (${formatFeetInches(s.physicalLen)} cut) &mdash;
                butt ${buttDiaAtCut}" &rarr; small end ${tipDiaAtCut}"
            </div>`;
        } else {
            html += `<div class="segment" style="color:${COLORS.wvuSlate}; font-style:italic;">
                Piece ${i+1}: ${formatFeetInches(s.physicalLen)} &mdash; too short for any standard length (wasted)
            </div>`;
        }
    });
    document.getElementById('segments').innerHTML = html;
    document.getElementById('segmentCount').textContent = segs.filter(s => s.nomLen > 0).length;
    document.getElementById('totalValue').textContent = '—';
}

// ─── Optimal Solver ────────────────────────────────────────────────────────
function computeOptimal() {
    const trim           = getTrim();
    const allowedLengths = [8, 10, 12, 14, 16];
    const step           = 0.5;
    const steps          = Math.round(totalLength / step);
    const dp             = new Array(steps + 1).fill(0);
    const choice         = new Array(steps + 1).fill(null);

    for (let i = steps - 1; i >= 0; i--) {
        const startFt = i * step;
        for (const nomLen of allowedLengths) {
            // Bole-end checks consume usable length; the physical span must grow
            // by the check length so the nominal log still measures nomLen usable feet.
            let ecDeduction = 0;
            currentDefects.forEach(d => {
                if (d.type === 'end_check' && d.startFt < startFt + nomLen && d.endFt > startFt)
                    ecDeduction += Math.min(d.endFt, startFt + nomLen) - Math.max(d.startFt, startFt);
            });
            const cutFt   = startFt + nomLen + trim + ecDeduction;
            if (cutFt > totalLength + 0.01) continue;
            const endStep = Math.min(Math.round(cutFt / step), steps);
            
            // Optimal scaling diameter at the small end of the nominal log
            const scalingFt = startFt + nomLen;
            const frac      = scalingFt / totalLength;
            let dia         = buttDia - (buttDia - topDia) * frac;

            dia = applySweepDeduction(dia, startFt, startFt + nomLen, currentDefects);

            const faces     = getClearFaces(startFt, startFt + nomLen, currentDefects);
            const vol       = doyleVolume(dia, nomLen);
            const grade     = getGradeAndPrice(dia, faces);
            const val       = Math.round(vol * grade.pricePerBF) + (dp[endStep] || 0);
            
            if (val > dp[i]) { dp[i] = val; choice[i] = endStep; }
        }
    }

    const optCuts = [];
    let pos = 0;
    while (pos < steps && choice[pos] !== null) {
        pos = choice[pos];
        if (pos < steps) optCuts.push(pos * step);
    }
    return { optCuts, optValue: dp[0] };
}

// ─── Explain Why Optimal Differs ───────────────────────────────────────────
function generateBuckingExplanation(userSegs, optSegs, defects) {
    const userValue = userSegs.reduce((s, g) => s + g.value, 0);
    const optValue  = optSegs.reduce((s, g) => s + g.value, 0);

    if (userValue >= optValue) {
        return `<div style="background:${COLORS.wvuSky}; border:1px solid ${COLORS.wvuGold}; border-radius:8px;
                             padding:12px 16px; margin:12px 0; font-size:14px;">
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
                                 padding:12px 16px; margin:12px 0; font-size:14px;" open>
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
    const { optCuts, optValue }  = computeOptimal();
    const { totalValue, segs }   = scoreSegments(cuts, currentDefects);
    const { segs: optSegs }      = scoreSegments(optCuts, currentDefects);
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
            <strong>Log ${currentLogIndex + 1} Result:</strong>
            Your Value: <strong>$${totalValue}</strong> &nbsp;|&nbsp;
            Optimal: <strong>$${optValue}</strong> &nbsp;|&nbsp;
            <strong style="color:${scoreColor}; font-size:20px;">${pct}%</strong>
            &nbsp;(trim = ${(trim * 12).toFixed(0)}" per log)
        </div>`;

    html += generateBuckingExplanation(segs, optSegs, currentDefects);

    html += `<div style="display:flex; gap:20px; flex-wrap:wrap;">
            <div style="flex:1; min-width:220px;">
                <h3 style="color:${COLORS.feedback.error};">&#9999; Your Bucking — $${totalValue}</h3>`;

    segs.forEach((s, i) => {
        if (s.nomLen > 0) {
            const faceColor = s.clearFaces >= 3 ? COLORS.feedback.success : s.clearFaces >= 2 ? COLORS.feedback.warning : COLORS.feedback.error;
            html += `<div class="segment" style="border-left-color: ${COLORS.feedback.error};">
                Log ${i+1}: <strong>${s.nomLen}'</strong> (${formatFeetInches(s.physicalLen)} piece) @
                ${s.scalingDia.toFixed(1)}" |
                <span style="color:${faceColor}; font-weight:bold;">${s.clearFaces} clear faces</span>
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
        const faceColor = s.clearFaces >= 3 ? COLORS.feedback.success : s.clearFaces >= 2 ? COLORS.feedback.warning : COLORS.feedback.error;
        html += `<div class="segment" style="border-left-color: ${COLORS.wvuGold};">
            Log ${i+1}: <strong>${s.nomLen}'</strong> @
            ${s.scalingDia.toFixed(1)}" |
            <span style="color:${faceColor}; font-weight:bold;">${s.clearFaces} clear faces</span>
            &rarr; <strong>${s.gradeInfo.grade}</strong> &rarr; $${s.value}
        </div>`;
    });

    html += `</div></div>`;
    document.getElementById('segments').innerHTML = html;
    document.getElementById('scoreLog').style.display = 'none';

    if (currentLogIndex < TOTAL_LOGS - 1) {
        document.getElementById('nextLog').style.display = 'inline-block';
    } else {
        showFinalScore();
    }
});


// ─── Running Score ─────────────────────────────────────────────────────────
function updateRunningScore() {
    const avg = Math.round(logScores.reduce((s, l) => s + l.pct, 0) / logScores.length);
    document.getElementById('gameScore').textContent = `Running Score: ${avg}%`;
}

// ─── Next Log ──────────────────────────────────────────────────────────────
document.getElementById('nextLog').addEventListener('click', () => {
    currentLogIndex++;
    loadLog(pickLog());
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
            <td style="padding:8px 16px;">Log ${l.logNum}</td>
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
                        <th style="padding:10px 16px; text-align:left;">Log</th>
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
// Load prices and tree data in parallel; start the game when both settle.
Promise.allSettled([
    fetch('prices.json').then(r => r.json()),
    fetch('hw-stems/trees.json').then(r => r.json()),
]).then(([priceResult, treeResult]) => {
    if (priceResult.status === 'fulfilled') PRICES = priceResult.value;
    if (treeResult.status  === 'fulfilled') realTrees = treeResult.value;
    loadLog(pickLog());
});
