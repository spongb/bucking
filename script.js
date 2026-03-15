// ─── Game State ────────────────────────────────────────────────────────────
const TOTAL_LOGS = 5;
let currentLogIndex = 0;
let logScores = [];
let cuts = [];
let dragIdx = -1;
let totalLength, buttDia, topDia;
let currentDefects = [];

// ─── Random Log Generator ──────────────────────────────────────────────────
function generateLog() {
    const lengths = [32, 34, 36, 38, 40, 42, 44];
    const buttDias = [14, 16, 18, 20, 22, 24];
    const tapers   = [4, 5, 6, 7, 8, 9, 10];
    const length   = lengths[Math.floor(Math.random() * lengths.length)];
    const butt     = buttDias[Math.floor(Math.random() * buttDias.length)];
    const taper    = tapers[Math.floor(Math.random() * tapers.length)];
    const top      = Math.max(6, butt - taper);
    return { length, butt, top };
}

// ─── Random Defect Generator ───────────────────────────────────────────────
function generateDefects(logLength) {
    const defects = [];
    const numDefects = Math.floor(Math.random() * 4) + 1;

    const defectTypes = [
        { type: 'knot_cluster', label: 'Knots',  color: '#8B4513', facePenalty: 1, minLen: 2, maxLen: 5  },
        { type: 'seam',         label: 'Seam',   color: '#444444', facePenalty: 1, minLen: 3, maxLen: 8  },
        { type: 'rot',          label: 'Rot',    color: '#8B0000', facePenalty: 2, minLen: 2, maxLen: 4  },
        { type: 'sweep',        label: 'Sweep',  color: '#DAA520', facePenalty: 1, minLen: 4, maxLen: 10 }
    ];

    for (let i = 0; i < numDefects; i++) {
        const t       = defectTypes[Math.floor(Math.random() * defectTypes.length)];
        const len     = t.minLen + Math.random() * (t.maxLen - t.minLen);
        const startFt = 2 + Math.random() * (logLength - len - 4);
        
        // Randomly assign to 1 or more faces (1-4)
        const numFaces = Math.floor(Math.random() * 4) + 1;
        const facesAffected = [];
        const availableFaces = [0, 1, 2, 3];
        for (let j = 0; j < numFaces; j++) {
            const idx = Math.floor(Math.random() * availableFaces.length);
            facesAffected.push(availableFaces.splice(idx, 1)[0]);
        }

        defects.push({
            type: t.type,
            label: t.label,
            color: t.color,
            facePenalty: t.facePenalty,
            startFt,
            endFt: startFt + len,
            facesAffected
        });
    }
    return defects;
}

// ─── Load a Log ────────────────────────────────────────────────────────────
function loadLog(logObj) {
    totalLength     = logObj.length;
    buttDia         = logObj.butt;
    topDia          = logObj.top;
    cuts            = [];
    currentDefects  = generateDefects(totalLength);

    document.getElementById('logDesc').textContent =
        `${totalLength}ft  |  Butt: ${buttDia}"  |  Top: ${topDia}"`;
    document.getElementById('logCounter').textContent =
        `Log ${currentLogIndex + 1} of ${TOTAL_LOGS}`;
    document.getElementById('nextLog').style.display   = 'none';
    document.getElementById('scoreLog').style.display  = 'inline-block';
    document.getElementById('segments').innerHTML      = '';
    document.getElementById('finalScore').style.display = 'none';
    const optContainer = document.getElementById('optContainer');
    if (optContainer) optContainer.style.display = 'none';

    buildDefectLegend();
    drawLog();
}

// ─── Defect Legend ─────────────────────────────────────────────────────────
function buildDefectLegend() {
    let html = '<div style="margin:8px 0; font-size:14px;"><strong>Defects on this stem:</strong> ';
    currentDefects.forEach(d => {
        let penaltyNote;
        if (d.type === 'sweep') {
            penaltyNote = `−${(d.facesAffected.length * 0.5).toFixed(1)}" dia.`;
        } else {
            const faceDeduct = d.facesAffected.length * d.facePenalty;
            penaltyNote = `−${faceDeduct} face${faceDeduct !== 1 ? 's' : ''}${d.facePenalty > 1 ? ' (2× rot)' : ''}`;
        }
        html += `<span style="background:${d.color}; color:#fff; padding:2px 8px;
                 border-radius:4px; margin:2px; display:inline-flex; align-items:center; gap:4px;">
                 ${d.label} ${d.startFt.toFixed(1)}–${d.endFt.toFixed(1)}ft
                 (${penaltyNote})
                 ${makeFaceIndicator(d.facesAffected, d.color)}
                 </span>`;
    });
    html += '</div>';
    document.getElementById('defectLegend').innerHTML = html;
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

// ─── Draw Log ──────────────────────────────────────────────────────────────
function drawLog() {
    drawLogGraphic(ctx, canvas, cuts);
    drawFaceMap(faceCtx, faceCanvas, currentDefects, cuts);
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
        <rect width="20" height="20" fill="#f0f0f0" rx="2" stroke="#999" stroke-width="0.5"/>
        ${cells}
        <line x1="10" y1="0" x2="10" y2="20" stroke="#aaa" stroke-width="0.5"/>
        <line x1="0"  y1="10" x2="20" y2="10" stroke="#aaa" stroke-width="0.5"/>
    </svg>`;
}

// ─── Draw Face Map Canvas ───────────────────────────────────────────────────
function drawFaceMap(context, can, defects, cutsList) {
    if (!context || !can) return;
    context.clearRect(0, 0, can.width, can.height);

    const scale      = can.width / totalLength;
    const tickH      = 20;   // px reserved for foot-tick row at top
    const laneH      = Math.floor((can.height - tickH) / 4);
    const faceLabels = ['Face 1', 'Face 2', 'Face 3', 'Face 4'];
    const laneColors = ['#EAF0FA', '#F5F8FF', '#EAF0FA', '#F5F8FF'];

    // Lane backgrounds + labels
    for (let f = 0; f < 4; f++) {
        const y = tickH + f * laneH;
        context.fillStyle = laneColors[f];
        context.fillRect(0, y, can.width, laneH);

        context.strokeStyle = '#C0C8D8';
        context.lineWidth   = 0.5;
        context.beginPath();
        context.moveTo(0, y); context.lineTo(can.width, y);
        context.stroke();

        context.fillStyle  = '#002855';
        context.font       = 'bold 10px Arial';
        context.textAlign  = 'left';
        context.fillText(faceLabels[f], 4, y + laneH / 2 + 3);
    }
    // Bottom border
    context.strokeStyle = '#C0C8D8';
    context.lineWidth   = 0.5;
    context.beginPath();
    context.moveTo(0, tickH + 4 * laneH); context.lineTo(can.width, tickH + 4 * laneH);
    context.stroke();

    // Defect blocks
    defects.forEach(d => {
        const x1 = d.startFt * scale;
        const x2 = d.endFt   * scale;
        d.facesAffected.forEach(f => {
            const y = tickH + f * laneH;
            context.globalAlpha = 0.78;
            context.fillStyle   = d.color;
            context.fillRect(x1, y + 2, x2 - x1, laneH - 4);
            context.globalAlpha = 1.0;

            // Label inside block — show as much of the full label as fits
            const blockW = x2 - x1;
            if (blockW > 14) {
                context.font      = 'bold 9px Arial';
                context.textAlign = 'center';
                context.fillStyle = '#fff';
                // Pick label length that fits: full → 4-char abbrev → 1-char
                const fullLabel = d.label;
                const shortLabel = fullLabel.substring(0, 4);
                const label = blockW > 38 ? fullLabel : blockW > 18 ? shortLabel : fullLabel.charAt(0);
                context.fillText(label, (x1 + x2) / 2, y + laneH / 2 + 3);
            }
        });
    });

    // Foot-tick marks at top
    for (let i = 0; i <= totalLength; i += 2) {
        const x = i * scale;
        context.strokeStyle = '#002855';
        context.lineWidth   = 1;
        context.beginPath();
        context.moveTo(x, 5); context.lineTo(x, tickH - 2);
        context.stroke();
        context.fillStyle  = '#002855';
        context.font       = '9px Arial';
        context.textAlign  = 'center';
        context.fillText(i.toString(), x, 13);
    }

    // Cut markers (dashed red lines)
    if (cutsList && cutsList.length > 0) {
        context.setLineDash([3, 3]);
        context.strokeStyle = 'rgba(200,0,0,0.85)';
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

function drawLogGraphic(context, can, cutsList) {
    context.clearRect(0, 0, can.width, can.height);
    const scale   = getScale(can);
    const yCenter = 100;
    const pxPerIn = 1.5;

    // Build taper points
    const points = [];
    for (let ft = 0; ft <= totalLength; ft++) {
        const frac     = ft / totalLength;
        const diaIn    = buttDia - (buttDia - topDia) * frac;
        const radiusPx = (diaIn / 2) * pxPerIn;
        points.push({ x: ft * scale, radiusPx });
    }

    // Bold outline
    context.strokeStyle = '#8B4513';
    context.lineWidth   = 8;
    context.lineCap     = 'round';
    context.lineJoin    = 'round';

    context.beginPath();
    points.forEach((p, i) => {
        if (i === 0) context.moveTo(p.x, yCenter - p.radiusPx);
        else         context.lineTo(p.x, yCenter - p.radiusPx);
    });
    context.stroke();

    context.beginPath();
    points.slice().reverse().forEach((p, i) => {
        if (i === 0) context.moveTo(p.x, yCenter + p.radiusPx);
        else         context.lineTo(p.x, yCenter + p.radiusPx);
    });
    context.stroke();

    // Gray gradient fill
    const grad = context.createLinearGradient(0, 80, can.width, 120);
    grad.addColorStop(0, '#D8D8D8');
    grad.addColorStop(1, '#B0B0B0');
    context.fillStyle = grad;
    context.beginPath();
    points.forEach((p, i) => {
        if (i === 0) context.moveTo(p.x, yCenter - p.radiusPx);
        else         context.lineTo(p.x, yCenter - p.radiusPx);
    });
    points.slice().reverse().forEach(p => context.lineTo(p.x, yCenter + p.radiusPx));
    context.closePath();
    context.fill();

    // Draw defects
    drawDefects(context, currentDefects, scale, yCenter, pxPerIn);

    // Foot ticks
    context.strokeStyle = '#000';
    context.lineWidth   = 2;
    for (let i = 0; i <= totalLength; i += 2) {
        const x = i * scale;
        context.beginPath();
        context.moveTo(x, 65); context.lineTo(x, 80);
        context.stroke();
        context.fillStyle  = '#000';
        context.font       = '12px Arial';
        context.textAlign  = 'center';
        context.fillText(i.toString(), x, 60);
    }

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
        context.lineWidth   = 3;
        context.beginPath();
        context.moveTo(x, yCenter - radiusPx - 12);
        context.lineTo(x, yCenter + radiusPx + 28);
        context.stroke();

        context.font        = 'bold 16px Arial';
        context.textAlign   = isLast ? 'right' : 'left';
        const labelX    = isLast ? x - 6 : x + 6;
        context.strokeStyle = '#fff';
        context.lineWidth   = 3;
        context.strokeText(diaIn + '"', labelX, yCenter + 35);
        context.fillStyle   = '#000';
        context.fillText(diaIn + '"', labelX, yCenter + 35);
    });

    // Cut markers
    cutsList.forEach(cut => {
        const x = cut * scale;
        context.strokeStyle = '#f00';
        context.lineWidth   = 6;
        context.lineCap     = 'round';
        context.beginPath();
        context.moveTo(x, 45); context.lineTo(x, 155);
        context.stroke();

        context.font        = 'bold 13px Arial';
        context.textAlign   = 'center';
        context.strokeStyle = '#f00';
        context.lineWidth   = 1.5;
        context.strokeText(cut.toFixed(1) + "'", x, 42);
        context.fillStyle   = '#fff';
        context.fillText(cut.toFixed(1) + "'", x, 42);
    });
}

// ─── Draw Defects ──────────────────────────────────────────────────────────
function drawDefects(context, defects, scale, yCenter, pxPerIn) {
    defects.forEach(d => {
        const x1    = d.startFt * scale;
        const x2    = d.endFt   * scale;
        const midFt = (d.startFt + d.endFt) / 2;
        const frac  = midFt / totalLength;
        const dia   = buttDia - (buttDia - topDia) * frac;
        const r     = (dia / 2) * pxPerIn;

        context.globalAlpha = 0.75;

        if (d.type === 'knot_cluster') {
            context.fillStyle = d.color;
            const numKnots = Math.max(2, Math.round((x2 - x1) / 15));
            for (let k = 0; k < numKnots; k++) {
                const kx = x1 + ((k + 0.5) / numKnots) * (x2 - x1);
                const ky = yCenter - r + 8 + (k % 2) * 8;
                context.beginPath();
                context.arc(kx, ky, 6, 0, Math.PI * 2);
                context.fill();
            }
        } else if (d.type === 'rot') {
            context.fillStyle = d.color;
            context.fillRect(x1, yCenter - r, x2 - x1, r * 2);
        } else if (d.type === 'seam') {
            context.strokeStyle = d.color;
            context.lineWidth   = 4;
            context.beginPath();
            context.moveTo(x1, yCenter - r + 5);
            context.lineTo(x2, yCenter - r + 5);
            context.stroke();
        } else if (d.type === 'sweep') {
            context.fillStyle = d.color;
            context.fillRect(x1, yCenter + r - 10, x2 - x1, 10);
        }

        context.globalAlpha = 1.0;

        // Defect label above stem
        context.font        = 'bold 11px Arial';
        context.textAlign   = 'center';
        context.strokeStyle = '#fff';
        context.lineWidth   = 2;
        context.strokeText(d.label, (x1 + x2) / 2, yCenter - r - 6);
        context.fillStyle   = d.color;
        context.fillText(d.label, (x1 + x2) / 2, yCenter - r - 6);
    });
}

// ─── Mouse Event Handlers ──────────────────────────────────────────────────
canvas.addEventListener('mousedown', (e) => {
    const scale = getScale();
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    
    // Check if clicking near an existing cut (within 0.4 ft)
    const idx = cuts.findIndex(c => Math.abs(c - x) < 0.4);
    if (idx !== -1) {
        dragIdx = idx;
    } else {
        // Add a new cut
        const snapX = Math.round(x * 10) / 10;
        cuts.push(snapX);
        cuts.sort((a, b) => a - b);
        dragIdx = cuts.indexOf(snapX);
        drawLog();
    }
});

window.addEventListener('mousemove', (e) => {
    const scale = getScale();
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;

    if (dragIdx !== -1) {
        // Update the cut's position, clamping to log bounds
        let newX = Math.max(0, Math.min(totalLength, x));
        cuts[dragIdx] = Math.round(newX * 10) / 10; // Snap to 0.1 ft
        drawLog();
    } else {
        // Change cursor if hovering over a cut
        const idx = cuts.findIndex(c => Math.abs(c - x) < 0.4);
        canvas.style.cursor = (idx !== -1) ? 'ew-resize' : 'crosshair';
    }
});

window.addEventListener('mouseup', () => {
    if (dragIdx !== -1) {
        cuts.sort((a, b) => a - b);
        dragIdx = -1;
        drawLog();
    }
});

// ─── Doyle Volume ──────────────────────────────────────────────────────────
function doyleVolume(dia, len) {
    const D = Math.max(0, dia - 4);
    return Math.round(D * D * (len / 16));
}

// ─── Clear Faces Calculator ────────────────────────────────────────────────
function getClearFaces(startFt, endFt, defects) {
    let faces = 4;
    defects.forEach(d => {
        if (d.type === 'sweep') return; // sweep is handled as a diameter deduction, not a face penalty
        const overlaps = d.startFt < endFt && d.endFt > startFt;
        if (overlaps) faces -= d.facesAffected.length * d.facePenalty;
    });
    return Math.max(0, faces);
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

    const prices = {
        'Prime': 2.50, 'Select+': 2.10, 'Select': 1.80, 'No. 1+': 1.50,
        'No. 1': 1.20, 'No. 2+': 1.00,  'No. 2': 0.80,  'No. 3': 0.30
    };

    return { grade, pricePerBF: prices[grade] || 0.30 };
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
        const maxNomLen   = physicalLen - trim;
        
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

            // Sweep/crook: reduces effective scaling diameter (volume deduction)
            let effectiveDia = scalingDia;
            defects.filter(d => d.type === 'sweep').forEach(d => {
                if (d.startFt < prevFt + nomLen && d.endFt > prevFt) {
                    effectiveDia -= d.facesAffected.length * 0.5;
                }
            });
            effectiveDia = Math.max(6, effectiveDia);

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
            const buttDiaAtCut = Math.round((buttDia - (buttDia - topDia) * (buttEnd / totalLength)) * 10) / 10;
            const tipDiaAtCut  = Math.round((buttDia - (buttDia - topDia) * (tipFt  / totalLength)) * 10) / 10;
            html += `<div class="segment">
                Piece ${i+1}: <strong>${s.nomLen}'</strong> log
                (${s.physicalLen.toFixed(1)}' cut) &mdash;
                butt ${buttDiaAtCut}" &rarr; small end ${tipDiaAtCut}"
            </div>`;
        } else {
            html += `<div class="segment" style="color:#777; font-style:italic;">
                Piece ${i+1}: ${s.physicalLen.toFixed(1)}' &mdash; too short for any standard length (wasted)
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
            const cutFt   = startFt + nomLen + trim;
            if (cutFt > totalLength + 0.01) continue;
            const endStep = Math.min(Math.round(cutFt / step), steps);
            
            // Optimal scaling diameter at the small end of the nominal log
            const scalingFt = startFt + nomLen;
            const frac      = scalingFt / totalLength;
            let dia         = buttDia - (buttDia - topDia) * frac;

            // Sweep/crook diameter deduction
            currentDefects.filter(d => d.type === 'sweep').forEach(d => {
                if (d.startFt < startFt + nomLen && d.endFt > startFt) {
                    dia -= d.facesAffected.length * 0.5;
                }
            });
            dia = Math.max(6, dia);

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
        return `<div style="background:#e8f5e9; border:1px solid #EAAA00; border-radius:8px;
                             padding:12px 16px; margin:12px 0; font-size:14px;">
            <strong style="color:#002855;">&#128077; You matched the optimal solution!</strong>
        </div>`;
    }

    // Helper: find defects overlapping a segment
    function overlappingDefects(startFt, endFt) {
        return defects.filter(d => d.startFt < endFt && d.endFt > startFt);
    }

    // Describe why a segment got the grade it did
    function describeSegment(s, label) {
        if (s.nomLen === 0) {
            return `<li><strong>${label}:</strong> ${s.physicalLen.toFixed(1)}' piece was too short for
                any standard log length (min 8') and was wasted.</li>`;
        }
        const active = overlappingDefects(s.startFt, s.startFt + s.nomLen);
        let defectDesc = '';
        if (active.length === 0) {
            defectDesc = 'No defects in this section — grade is diameter-limited only.';
        } else {
            const parts = active.map(d => {
                if (d.type === 'sweep') {
                    const ded = (d.facesAffected.length * 0.5).toFixed(1);
                    return `<em>Sweep</em> (${d.startFt.toFixed(1)}–${d.endFt.toFixed(1)}ft) reduced the scaling diameter by ${ded}"`;
                } else {
                    const rawPenalty = d.facesAffected.length * d.facePenalty;
                    const penalty = Math.min(rawPenalty, 4);
                    const typeLabel = d.label;
                    let penaltyNote = '';
                    if (d.facePenalty > 1) {
                        penaltyNote = ` (${d.facesAffected.length} face${d.facesAffected.length !== 1 ? 's' : ''} × 2× rot penalty${rawPenalty > 4 ? ', all 4 faces eliminated' : ''})`;
                    }
                    return `<em>${typeLabel}</em> (${d.startFt.toFixed(1)}–${d.endFt.toFixed(1)}ft) removed ${penalty} clear face${penalty !== 1 ? 's' : ''}${penaltyNote}`;
                }
            });
            defectDesc = parts.join('; ') + '.';
        }
        return `<li><strong>${label}:</strong> ${s.nomLen}' log scaled at ${s.scalingDia.toFixed(1)}" —
            ${s.clearFaces} clear face${s.clearFaces !== 1 ? 's' : ''} &rarr;
            <strong>${s.gradeInfo.grade}</strong> @ $${s.gradeInfo.pricePerBF.toFixed(2)}/bf
            ($${s.value}). ${defectDesc}</li>`;
    }

    // Build comparison bullets: for each optimal piece that beats the user's nearest piece
    let comparisons = '';
    optSegs.forEach((opt, oi) => {
        if (opt.nomLen === 0) return;
        // Find the user segment that covers the most overlap with this optimal piece
        const userMatch = userSegs.find(us =>
            us.startFt < opt.startFt + opt.nomLen && us.endFt > opt.startFt && us.nomLen > 0
        );
        if (!userMatch) return;
        if (opt.gradeInfo.grade === userMatch.gradeInfo.grade && opt.value <= userMatch.value) return;
        const diff = opt.value - userMatch.value;
        if (diff <= 0) return;

        let why = '';
        const optDefects  = overlappingDefects(opt.startFt, opt.startFt + opt.nomLen);
        const userDefects = overlappingDefects(userMatch.startFt, userMatch.startFt + userMatch.nomLen);
        const avoided = userDefects.filter(d => !optDefects.some(od => od === d));
        if (avoided.length > 0) {
            const names = avoided.map(d => `${d.label} at ${d.startFt.toFixed(1)}–${d.endFt.toFixed(1)}ft`).join(', ');
            why = `The optimal cut isolated around the ${names}, keeping more clear faces.`;
        } else if (opt.nomLen !== userMatch.nomLen) {
            why = `Choosing a ${opt.nomLen}' length instead of ${userMatch.nomLen}' captured a better diameter/defect combination.`;
        } else if (opt.scalingDia > userMatch.scalingDia + 0.5) {
            why = `Positioning the cut ${(userMatch.startFt - opt.startFt).toFixed(1)}ft closer to the butt kept a larger scaling diameter (${opt.scalingDia.toFixed(1)}" vs ${userMatch.scalingDia.toFixed(1)}").`;
        } else {
            why = `A different cut position yielded ${opt.clearFaces} clear faces vs your ${userMatch.clearFaces}, improving from ${userMatch.gradeInfo.grade} to ${opt.gradeInfo.grade}.`;
        }
        comparisons += `<li style="margin-top:6px;"><strong>Optimal Piece ${oi+1} ($${opt.value} vs your $${userMatch.value}, +$${diff}):</strong> ${why}</li>`;
    });

    // Summarize the overall gap
    const gap = optValue - userValue;
    const userGoodSegs  = userSegs.filter(s => s.nomLen > 0 && s.clearFaces < 4);
    const mainReason = userGoodSegs.length > 0
        ? 'defect isolation and clear-face positioning'
        : 'log length selection and diameter capture';

    let html = `<details style="background:#f5f8ff; border:2px solid #002855; border-radius:8px;
                                 padding:12px 16px; margin:12px 0; font-size:14px;" open>
        <summary style="cursor:pointer; font-weight:bold; color:#002855; font-size:15px;">
            &#128270; Why is the optimal solution $${gap} more? (click to collapse)
        </summary>
        <p style="margin:8px 0 4px; color:#444;">
            The optimal solution recovered <strong>$${optValue}</strong> vs your <strong>$${userValue}</strong>
            — a difference of <strong>$${gap}</strong> — primarily through better <em>${mainReason}</em>.
        </p>
        <p style="margin:4px 0; font-weight:bold; color:#002855;">Your segments:</p>
        <ul style="margin:4px 0 8px; padding-left:20px; line-height:1.7;">
            ${userSegs.map((s, i) => describeSegment(s, `Piece ${i+1}`)).join('')}
        </ul>`;

    if (comparisons) {
        html += `<p style="margin:4px 0; font-weight:bold; color:#002855;">Where optimal gained value:</p>
        <ul style="margin:4px 0; padding-left:20px; line-height:1.7;">${comparisons}</ul>`;
    }

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
    const scoreColor             = pct >= 90 ? '#27ae60' : pct >= 70 ? '#e67e22' : '#c0392b';

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
                    font-size:16px; border:2px solid #EAAA00;">
            <strong>Log ${currentLogIndex + 1} Result:</strong>
            Your Value: <strong>$${totalValue}</strong> &nbsp;|&nbsp;
            Optimal: <strong>$${optValue}</strong> &nbsp;|&nbsp;
            <strong style="color:${scoreColor}; font-size:20px;">${pct}%</strong>
            &nbsp;(trim = ${(trim * 12).toFixed(0)}" per log)
        </div>`;

    html += generateBuckingExplanation(segs, optSegs, currentDefects);

    html += `<div style="display:flex; gap:20px; flex-wrap:wrap;">
            <div style="flex:1; min-width:220px;">
                <h3 style="color:#c0392b;">&#9999; Your Bucking — $${totalValue}</h3>`;

    segs.forEach((s, i) => {
        if (s.nomLen > 0) {
            const faceColor = s.clearFaces >= 3 ? '#27ae60' : s.clearFaces >= 2 ? '#e67e22' : '#c0392b';
            html += `<div class="segment" style="border-left:4px solid #c0392b;">
                Log ${i+1}: <strong>${s.nomLen}'</strong> (${s.physicalLen.toFixed(1)}' piece) @
                ${s.scalingDia.toFixed(1)}" |
                <span style="color:${faceColor}; font-weight:bold;">${s.clearFaces} clear faces</span>
                &rarr; <strong>${s.gradeInfo.grade}</strong> &rarr; $${s.value}
            </div>`;
        } else {
            html += `<div class="segment" style="border-left:4px solid #ccc; color:#777;">
                Piece ${i+1}: ${s.physicalLen.toFixed(1)}' (Waste)
            </div>`;
        }
    });

    html += `</div><div style="flex:1; min-width:220px;">
                <h3 style="color:#002855;">&#10003; Optimal Bucking — $${optValue}</h3>`;

    optSegs.forEach((s, i) => {
        const faceColor = s.clearFaces >= 3 ? '#27ae60' : s.clearFaces >= 2 ? '#e67e22' : '#c0392b';
        html += `<div class="segment" style="border-left:4px solid #EAAA00;">
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
    loadLog(generateLog());
});

// ─── Final Scorecard ───────────────────────────────────────────────────────
function showFinalScore() {
    const avg = Math.round(logScores.reduce((s, l) => s + l.pct, 0) / logScores.length);
    let grade, msg, color;
    if      (avg >= 95) { grade='A+'; msg='Master Bucker! Exceptional value recovery.';        color='#27ae60'; }
    else if (avg >= 90) { grade='A';  msg='Excellent — near-optimal bucking decisions.';        color='#27ae60'; }
    else if (avg >= 80) { grade='B';  msg='Good work — small improvements possible.';           color='#2980b9'; }
    else if (avg >= 70) { grade='C';  msg='Decent — review how defects affect log grade.';      color='#e67e22'; }
    else if (avg >= 60) { grade='D';  msg='Needs work — study defect isolation strategies.';    color='#e74c3c'; }
    else                { grade='F';  msg='Keep practicing — focus on clear face tradeoffs!';   color='#c0392b'; }

    const totalYours   = logScores.reduce((s, l) => s + l.totalValue, 0);
    const totalOptimal = logScores.reduce((s, l) => s + l.optValue,   0);
    const totalLeft    = totalOptimal - totalYours;

    const rows = logScores.map(l => `
        <tr>
            <td style="padding:8px 16px;">Log ${l.logNum}</td>
            <td style="padding:8px 12px;">$${l.totalValue}</td>
            <td style="padding:8px 12px;">$${l.optValue}</td>
            <td style="padding:8px 12px; color:${l.pct>=90?'#27ae60':l.pct>=70?'#e67e22':'#c0392b'}">
                <strong>${l.pct}%</strong>
            </td>
            <td style="padding:8px 12px; color:${l.leftOnTable===0?'#27ae60':'#c0392b'}; font-weight:bold;">
                ${l.leftOnTable > 0 ? '−$' + l.leftOnTable : '&#10003;'}
            </td>
        </tr>`).join('');

    const reportHTML = `
        <div style="text-align:center; padding:10px 0 30px;">
            <h1 style="color:#002855; border-bottom:3px solid #EAAA00; padding-bottom:8px; margin-bottom:20px;">
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
                    <tr style="background:#002855; color:#fff;">
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
                    <tr style="background:#FFF8E1; font-weight:bold; border-top:3px solid #EAAA00;">
                        <td style="padding:10px 16px; text-align:left;">Total</td>
                        <td style="padding:10px 12px;">$${totalYours}</td>
                        <td style="padding:10px 12px;">$${totalOptimal}</td>
                        <td style="padding:10px 12px; color:${avg>=90?'#27ae60':avg>=70?'#e67e22':'#c0392b'}">${avg}%</td>
                        <td style="padding:10px 12px; color:${totalLeft===0?'#27ae60':'#c0392b'}">
                            ${totalLeft > 0 ? '−$' + totalLeft : '&#10003; Perfect'}
                        </td>
                    </tr>
                </tfoot>
            </table>

            <div style="background:#f5f8ff; border:2px solid #002855; border-radius:8px;
                        padding:16px 24px; margin:0 auto 25px; max-width:700px; font-size:16px;">
                <strong>Optimal total:</strong> $${totalOptimal} &nbsp;&nbsp;|&nbsp;&nbsp;
                <strong>You recovered:</strong> $${totalYours} &nbsp;&nbsp;|&nbsp;&nbsp;
                <strong>Left on table:</strong>
                <span style="color:${totalLeft>0?'#c0392b':'#27ae60'}; font-weight:bold;">
                    $${totalLeft}
                </span>
            </div>

            <button onclick="restartGame()"
                style="padding:14px 36px; background:#EAAA00; color:#002855;
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
    document.getElementById('gameScore').textContent = 'Running Score: 0%';
    document.getElementById('finalReport').style.display = 'none';
    document.querySelector('.container').style.display = 'block';
    window.scrollTo(0, 0);
    loadLog(generateLog());
}

// ─── Reset Cuts ────────────────────────────────────────────────────────────
document.getElementById('reset').addEventListener('click', () => {
    cuts = [];
    drawLog();
});

// ─── Trim Live Update ──────────────────────────────────────────────────────
document.getElementById('trimInput').addEventListener('change', drawLog);

// ─── Build Grading Reference Table ─────────────────────────────────────────
(function buildGradingTable() {
    const gradeColors = {
        'Prime': '#1a6e37', 'Select+': '#2980b9', 'Select': '#2471a3',
        'No. 1+': '#7d6608', 'No. 1': '#9a7d0a', 'No. 2+': '#6e2f1a',
        'No. 2': '#922b21', 'No. 3': '#555555'
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
            const bg = gradeColors[grade] || '#555';
            tr.innerHTML += `<td style="padding:4px 8px; text-align:center;">
                <span style="background:${bg}; color:#fff; padding:2px 6px; border-radius:3px; font-size:12px; white-space:nowrap;">
                    ${grade}<br><span style="font-size:10px; opacity:0.85;">$${pricePerBF.toFixed(2)}/bf</span>
                </span></td>`;
        }
        tbody.appendChild(tr);
    });
})();

// ─── Start Game ────────────────────────────────────────────────────────────
loadLog(generateLog());
