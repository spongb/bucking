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
        html += `<span style="background:${d.color}; color:#fff; padding:2px 8px;
                 border-radius:4px; margin:2px; display:inline-block;">
                 ${d.label} ${d.startFt.toFixed(1)}–${d.endFt.toFixed(1)}ft
                 (−${d.facesAffected.length} face${d.facesAffected.length > 1 ? 's' : ''})
                 </span>`;
    });
    html += '</div>';
    document.getElementById('defectLegend').innerHTML = html;
}

// ─── Canvas Setup ──────────────────────────────────────────────────────────
const canvas = document.getElementById('logCanvas');
const ctx    = canvas.getContext('2d');
const optCanvas = document.getElementById('optCanvas');
const optCtx    = optCanvas ? optCanvas.getContext('2d') : null;

function getScale(cvs = canvas) { return cvs.width / totalLength; }
function getTrim()  {
    const val = parseFloat(document.getElementById('trimInput').value);
    return isNaN(val) ? 0.25 : val / 12;
}

// ─── Draw Log ──────────────────────────────────────────────────────────────
function drawLog() {
    drawLogGraphic(ctx, canvas, cuts);
    updateSegments();
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
        const overlaps = d.startFt < endFt && d.endFt > startFt;
        if (overlaps) faces -= d.facesAffected.length;
    });
    return Math.max(0, faces);
}

// ─── AHMI Grading Matrix (from PDF Page 14) ──────────────────────────────
function getGradeAndPrice(dia, clearFaces) {
    const d = Math.floor(dia);
    const faceIdx = 4 - clearFaces; // 4 faces -> index 0, 3 faces -> index 1, etc.
    
    let grade = 'No. 3';
    if      (d >= 17) grade = ['Prime',    'Select+', 'Select',  'No. 2+', 'No. 2'][faceIdx];
    else if (d >= 16) grade = ['Select+',  'No. 1+',  'No. 1',   'No. 2+', 'No. 2'][faceIdx];
    else if (d >= 15) grade = ['Select+',  'No. 1+',  'No. 2+',  'No. 2',  'No. 3'][faceIdx];
    else if (d >= 14) grade = ['Select',   'No. 1',   'No. 2+',  'No. 2',  'No. 3'][faceIdx];
    else if (d >= 13) grade = ['No. 1+',   'No. 2+',  'No. 2',   'No. 3',  'No. 3'][faceIdx];
    else if (d >= 11) grade = ['No. 2+',   'No. 2',   'No. 3',   'No. 3',  'No. 3'][faceIdx];
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
            
            const clearFaces = getClearFaces(prevFt, prevFt + nomLen, defects);
            const volumeBF   = doyleVolume(scalingDia, nomLen);
            const gradeInfo  = getGradeAndPrice(scalingDia, clearFaces);
            const value      = Math.round(volumeBF * gradeInfo.pricePerBF);
            
            totalValue += value;
            segs.push({ endFt, physicalLen, nomLen, scalingDia, clearFaces, volumeBF, gradeInfo, value });
        } else {
            segs.push({ endFt, physicalLen, nomLen: 0, scalingDia: 0, clearFaces: 0, volumeBF: 0, 
                        gradeInfo: { grade: 'Pulp/Waste', pricePerBF: 0 }, value: 0 });
        }
        prevFt = endFt;
    });

    return { totalValue, segs };
}

// ─── Live Segment Display ──────────────────────────────────────────────────
function updateSegments() {
    const { totalValue, segs } = scoreSegments(cuts, currentDefects);
    let html = '';
    segs.forEach((s, i) => {
        if (s.nomLen > 0) {
            const faceColor = s.clearFaces >= 3 ? '#27ae60' : s.clearFaces >= 2 ? '#e67e22' : '#c0392b';
            html += `<div class="segment">
                Log ${i+1}: <strong>${s.nomLen}'</strong> (from ${s.physicalLen.toFixed(1)}' piece) @
                ${s.scalingDia.toFixed(1)}" |
                <span style="color:${faceColor}; font-weight:bold;">${s.clearFaces} clear faces</span>
                &rarr; ${s.volumeBF} bf
                <strong>${s.gradeInfo.grade}</strong> &rarr; $${s.value}
            </div>`;
        } else {
            html += `<div class="segment" style="color:#777; font-style:italic;">
                Piece ${i+1}: ${s.physicalLen.toFixed(1)}' &rarr; Under 8' standard (Wasted)
            </div>`;
        }
    });
    document.getElementById('segments').innerHTML = html;
    document.getElementById('segmentCount').textContent = segs.filter(s => s.nomLen > 0).length;
    document.getElementById('totalValue').textContent   = totalValue.toFixed(0);
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
            const dia       = buttDia - (buttDia - topDia) * frac;
            
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

// ─── Score This Log ────────────────────────────────────────────────────────
document.getElementById('scoreLog').addEventListener('click', () => {
    const { optCuts, optValue }  = computeOptimal();
    const { totalValue, segs }   = scoreSegments(cuts, currentDefects);
    const { segs: optSegs }      = scoreSegments(optCuts, currentDefects);
    const trim                   = getTrim();
    const pct                    = optValue > 0 ? Math.round((totalValue / optValue) * 100) : 0;
    const scoreColor             = pct >= 90 ? '#27ae60' : pct >= 70 ? '#e67e22' : '#c0392b';

    logScores.push({ pct, totalValue, optValue, logNum: currentLogIndex + 1 });
    updateRunningScore();

    // Show optimal canvas
    const optContainer = document.getElementById('optContainer');
    if (optContainer && optCtx) {
        optContainer.style.display = 'block';
        drawLogGraphic(optCtx, optCanvas, optCuts);
    }

    let html = `
        <div style="background:#fff3cd; padding:15px; border-radius:8px; margin:15px 0;
                    font-size:16px; border:1px solid #ffc107;">
            <strong>Log ${currentLogIndex + 1} Result:</strong>
            Your Value: <strong>$${totalValue}</strong> &nbsp;|&nbsp;
            Optimal: <strong>$${optValue}</strong> &nbsp;|&nbsp;
            <strong style="color:${scoreColor}; font-size:20px;">${pct}%</strong>
            &nbsp;(trim = ${(trim * 12).toFixed(0)}" per log)
        </div>
        <div style="display:flex; gap:20px; flex-wrap:wrap;">
            <div style="flex:1; min-width:220px;">
                <h3 style="color:#c0392b;">✏ Your Bucking — $${totalValue}</h3>`;

    segs.forEach((s, i) => {
        if (s.nomLen > 0) {
            const faceColor = s.clearFaces >= 3 ? '#27ae60' : s.clearFaces >= 2 ? '#e67e22' : '#c0392b';
            html += `<div class="segment" style="border-left:4px solid #c0392b;">
                Log ${i+1}: <strong>${s.nomLen}'</strong> (${s.physicalLen.toFixed(1)}' piece) @
                ${s.scalingDia.toFixed(1)}" |
                <span style="color:${faceColor}; font-weight:bold;">${s.clearFaces} clear faces</span>
                &rarr; $${s.value}
            </div>`;
        } else {
            html += `<div class="segment" style="border-left:4px solid #ccc; color:#777;">
                Piece ${i+1}: ${s.physicalLen.toFixed(1)}' (Waste)
            </div>`;
        }
    });

    html += `</div><div style="flex:1; min-width:220px;">
                <h3 style="color:#27ae60;">✓ Optimal Bucking — $${optValue}</h3>`;

    optSegs.forEach((s, i) => {
        const faceColor = s.clearFaces >= 3 ? '#27ae60' : s.clearFaces >= 2 ? '#e67e22' : '#c0392b';
        html += `<div class="segment" style="border-left:4px solid #27ae60;">
            Log ${i+1}: <strong>${s.nomLen}'</strong> @
            ${s.scalingDia.toFixed(1)}" |
            <span style="color:${faceColor}; font-weight:bold;">${s.clearFaces} clear faces</span>
            &rarr; $${s.value}
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

    const rows = logScores.map(l => `
        <tr>
            <td style="padding:8px 16px;">Log ${l.logNum}</td>
            <td>$${l.totalValue}</td>
            <td>$${l.optValue}</td>
            <td style="color:${l.pct>=90?'#27ae60':l.pct>=70?'#e67e22':'#c0392b'}">
                <strong>${l.pct}%</strong>
            </td>
        </tr>`).join('');

    document.getElementById('finalScore').innerHTML = `
        <div style="background:#fff; border:3px solid ${color}; border-radius:12px;
                    padding:25px; margin:20px 0; text-align:center;">
            <h2 style="font-size:28px;">Final Score:
                <span style="color:${color}; font-size:48px;">${grade}</span>
            </h2>
            <p style="font-size:20px;">${avg}% of optimal value recovered</p>
            <p style="font-size:16px; color:#555;">${msg}</p>
            <table style="margin:15px auto; border-collapse:collapse; font-size:15px;">
                <tr style="background:#eee;">
                    <th style="padding:8px 16px;">Log</th>
                    <th>Your $</th>
                    <th>Optimal $</th>
                    <th>Score</th>
                </tr>
                ${rows}
            </table>
            <button onclick="restartGame()"
                style="margin-top:15px; padding:12px 30px; background:#27ae60;
                       color:#fff; font-size:16px; border:none; border-radius:6px; cursor:pointer;">
                🔄 Play Again
            </button>
        </div>`;
    document.getElementById('finalScore').style.display = 'block';
}

// ─── Play Again ────────────────────────────────────────────────────────────
function restartGame() {
    currentLogIndex = 0;
    logScores       = [];
    document.getElementById('gameScore').textContent = 'Running Score: 0%';
    loadLog(generateLog());
}

// ─── Reset Cuts ────────────────────────────────────────────────────────────
document.getElementById('reset').addEventListener('click', () => {
    cuts = [];
    drawLog();
});

// ─── Trim Live Update ──────────────────────────────────────────────────────
document.getElementById('trimInput').addEventListener('change', drawLog);

// ─── Start Game ────────────────────────────────────────────────────────────
loadLog(generateLog());
