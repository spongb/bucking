// ─── Game State ────────────────────────────────────────────────────────────
const TOTAL_LOGS = 5;
let currentLogIndex = 0;
let logScores = [];
let cuts = [];
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

function getScale() { return canvas.width / totalLength; }
function getTrim()  {
    const val = parseFloat(document.getElementById('trimInput').value);
    return isNaN(val) ? 0.25 : val / 12;
}

// ─── Draw Log ──────────────────────────────────────────────────────────────
function drawLog() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scale   = getScale();
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
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth   = 8;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';

    ctx.beginPath();
    points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, yCenter - p.radiusPx);
        else         ctx.lineTo(p.x, yCenter - p.radiusPx);
    });
    ctx.stroke();

    ctx.beginPath();
    points.slice().reverse().forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, yCenter + p.radiusPx);
        else         ctx.lineTo(p.x, yCenter + p.radiusPx);
    });
    ctx.stroke();

    // Gray gradient fill
    const grad = ctx.createLinearGradient(0, 80, canvas.width, 120);
    grad.addColorStop(0, '#D8D8D8');
    grad.addColorStop(1, '#B0B0B0');
    ctx.fillStyle = grad;
    ctx.beginPath();
    points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, yCenter - p.radiusPx);
        else         ctx.lineTo(p.x, yCenter - p.radiusPx);
    });
    points.slice().reverse().forEach(p => ctx.lineTo(p.x, yCenter + p.radiusPx));
    ctx.closePath();
    ctx.fill();

    // Draw defects
    drawDefects(currentDefects, scale, yCenter, pxPerIn);

    // Foot ticks
    ctx.strokeStyle = '#000';
    ctx.lineWidth   = 2;
    for (let i = 0; i <= totalLength; i += 2) {
        const x = i * scale;
        ctx.beginPath();
        ctx.moveTo(x, 65); ctx.lineTo(x, 80);
        ctx.stroke();
        ctx.fillStyle  = '#000';
        ctx.font       = '12px Arial';
        ctx.textAlign  = 'center';
        ctx.fillText(i.toString(), x, 60);
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

        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 3;
        ctx.beginPath();
        ctx.moveTo(x, yCenter - radiusPx - 12);
        ctx.lineTo(x, yCenter + radiusPx + 28);
        ctx.stroke();

        ctx.font        = 'bold 16px Arial';
        ctx.textAlign   = isLast ? 'right' : 'left';
        const labelX    = isLast ? x - 6 : x + 6;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 3;
        ctx.strokeText(diaIn + '"', labelX, yCenter + 35);
        ctx.fillStyle   = '#000';
        ctx.fillText(diaIn + '"', labelX, yCenter + 35);
    });

    // Cut markers
    cuts.forEach(cut => {
        const x = cut * scale;
        ctx.strokeStyle = '#f00';
        ctx.lineWidth   = 6;
        ctx.lineCap     = 'round';
        ctx.beginPath();
        ctx.moveTo(x, 45); ctx.lineTo(x, 155);
        ctx.stroke();

        ctx.font        = 'bold 13px Arial';
        ctx.textAlign   = 'center';
        ctx.strokeStyle = '#f00';
        ctx.lineWidth   = 1.5;
        ctx.strokeText(cut.toFixed(1) + "'", x, 42);
        ctx.fillStyle   = '#fff';
        ctx.fillText(cut.toFixed(1) + "'", x, 42);
    });

    updateSegments();
}

// ─── Draw Defects ──────────────────────────────────────────────────────────
function drawDefects(defects, scale, yCenter, pxPerIn) {
    defects.forEach(d => {
        const x1    = d.startFt * scale;
        const x2    = d.endFt   * scale;
        const midFt = (d.startFt + d.endFt) / 2;
        const frac  = midFt / totalLength;
        const dia   = buttDia - (buttDia - topDia) * frac;
        const r     = (dia / 2) * pxPerIn;

        ctx.globalAlpha = 0.75;

        if (d.type === 'knot_cluster') {
            ctx.fillStyle = d.color;
            const numKnots = Math.max(2, Math.round((x2 - x1) / 15));
            for (let k = 0; k < numKnots; k++) {
                const kx = x1 + ((k + 0.5) / numKnots) * (x2 - x1);
                const ky = yCenter - r + 8 + (k % 2) * 8;
                ctx.beginPath();
                ctx.arc(kx, ky, 6, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (d.type === 'rot') {
            ctx.fillStyle = d.color;
            ctx.fillRect(x1, yCenter - r, x2 - x1, r * 2);
        } else if (d.type === 'seam') {
            ctx.strokeStyle = d.color;
            ctx.lineWidth   = 4;
            ctx.beginPath();
            ctx.moveTo(x1, yCenter - r + 5);
            ctx.lineTo(x2, yCenter - r + 5);
            ctx.stroke();
        } else if (d.type === 'sweep') {
            ctx.fillStyle = d.color;
            ctx.fillRect(x1, yCenter + r - 10, x2 - x1, 10);
        }

        ctx.globalAlpha = 1.0;

        // Defect label above stem
        ctx.font        = 'bold 11px Arial';
        ctx.textAlign   = 'center';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 2;
        ctx.strokeText(d.label, (x1 + x2) / 2, yCenter - r - 6);
        ctx.fillStyle   = d.color;
        ctx.fillText(d.label, (x1 + x2) / 2, yCenter - r - 6);
    });
}

// ─── Click Handler ─────────────────────────────────────────────────────────
canvas.addEventListener('click', (e) => {
    const scale  = getScale();
    const rect   = canvas.getBoundingClientRect();
    const x      = (e.clientX - rect.left) / scale;
    const idx    = cuts.findIndex(c => Math.abs(c - x) < 0.5);
    if (idx !== -1) cuts[idx] = x;
    else { cuts.push(x); cuts.sort((a, b) => a - b); }
    drawLog();
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

// ─── AHMI Grading (Diameter + Clear Faces) ────────────────────────────────
function getGradeAndPrice(dia, clearFaces) {
    if (dia >= 16 && clearFaces >= 4) return { grade: 'Prime',     pricePerBF: 2.50 };
    if (dia >= 12 && clearFaces >= 3) return { grade: 'Select+',   pricePerBF: 1.80 };
    if (dia >= 11 && clearFaces >= 2) return { grade: 'No.1',      pricePerBF: 1.20 };
    if (dia >= 8  && clearFaces >= 1) return { grade: 'No.2',      pricePerBF: 0.80 };
    return                                   { grade: 'No.3/Pulp', pricePerBF: 0.30 };
}

// ─── Score Segments ────────────────────────────────────────────────────────
function scoreSegments(cutList, defects) {
    const trim = getTrim();
    let totalValue = 0;
    const segs = [];
    const allPoints = [...cutList, totalLength];
    let prevFt = 0;

    allPoints.forEach(endFt => {
        const nomLen = endFt - prevFt - trim;
        if (nomLen > 0) {
            const midFt      = prevFt + nomLen / 2;
            const frac       = midFt / totalLength;
            const scalingDia = buttDia - (buttDia - topDia) * frac;
            const clearFaces = getClearFaces(prevFt, endFt, defects);
            const volumeBF   = doyleVolume(scalingDia, nomLen);
            const gradeInfo  = getGradeAndPrice(scalingDia, clearFaces);
            const value      = Math.round(volumeBF * gradeInfo.pricePerBF);
            totalValue      += value;
            segs.push({ endFt, nomLen, scalingDia, clearFaces, volumeBF, gradeInfo, value });
        }
        prevFt = endFt;
    });

    return { totalValue, segs };
}

// ─── Live Segment Display ──────────────────────────────────────────────────
function updateSegments() {
    const { totalValue, segs } = scoreSegments(cuts, currentDefects);
    const trim = getTrim();
    let html = '';
    segs.forEach((s, i) => {
        const faceColor = s.clearFaces >= 3 ? '#27ae60' : s.clearFaces >= 2 ? '#e67e22' : '#c0392b';
        html += `<div class="segment">
            Log ${i+1}: ${s.nomLen.toFixed(1)}ft @
            ${s.scalingDia.toFixed(1)}" |
            <span style="color:${faceColor}; font-weight:bold;">${s.clearFaces} clear faces</span>
            &rarr; ${s.volumeBF} bf
            <strong>${s.gradeInfo.grade}</strong> &rarr; $${s.value}
        </div>`;
    });
    document.getElementById('segments').innerHTML = html;
    document.getElementById('segmentCount').textContent = segs.length;
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
            const midFt   = startFt + nomLen / 2;
            const frac    = midFt / totalLength;
            const dia     = buttDia - (buttDia - topDia) * frac;
            const endFt   = startFt + nomLen;
            const faces   = getClearFaces(startFt, endFt, currentDefects);
            const vol     = doyleVolume(dia, nomLen);
            const grade   = getGradeAndPrice(dia, faces);
            const val     = Math.round(vol * grade.pricePerBF) + (dp[endStep] || 0);
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
        const faceColor = s.clearFaces >= 3 ? '#27ae60' : s.clearFaces >= 2 ? '#e67e22' : '#c0392b';
        html += `<div class="segment" style="border-left:4px solid #c0392b;">
            Log ${i+1}: ${s.nomLen.toFixed(1)}ft @
            ${s.scalingDia.toFixed(1)}" |
            <span style="color:${faceColor}; font-weight:bold;">${s.clearFaces} clear faces</span>
            &rarr; ${s.volumeBF} bf <strong>${s.gradeInfo.grade}</strong> &rarr; $${s.value}
        </div>`;
    });

    html += `</div><div style="flex:1; min-width:220px;">
                <h3 style="color:#27ae60;">✓ Optimal Bucking — $${optValue}</h3>`;

    optSegs.forEach((s, i) => {
        const faceColor = s.clearFaces >= 3 ? '#27ae60' : s.clearFaces >= 2 ? '#e67e22' : '#c0392b';
        html += `<div class="segment" style="border-left:4px solid #27ae60;">
            Log ${i+1}: ${s.nomLen.toFixed(1)}ft @
            ${s.scalingDia.toFixed(1)}" |
            <span style="color:${faceColor}; font-weight:bold;">${s.clearFaces} clear faces</span>
            &rarr; ${s.volumeBF} bf <strong>${s.gradeInfo.grade}</strong> &rarr; $${s.value}
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
