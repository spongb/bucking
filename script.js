// ─── Log Parameters (updated by New Log dialog) ───────────────────────────
let totalLength = 38;
let buttDia = 20;
let topDia = 10;

let cuts = [];

// ─── Canvas Setup ─────────────────────────────────────────────────────────
const canvas = document.getElementById('logCanvas');
const ctx = canvas.getContext('2d');

function getScale() { return canvas.width / totalLength; }
function getTrim() {
    const val = parseFloat(document.getElementById('trimInput').value);
    return isNaN(val) ? 0.25 : val / 12; // convert inches to feet
}

// ─── Draw Log ─────────────────────────────────────────────────────────────
function drawLog() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scale = getScale();
    const yCenter = 100;
    const pxPerInch = 1.5;

    // Build taper points
    const points = [];
    for (let ft = 0; ft <= totalLength; ft += 1) {
        const taperFrac = ft / totalLength;
        const diaIn = buttDia - (buttDia - topDia) * taperFrac;
        const radiusPx = (diaIn / 2) * pxPerInch;
        const x = ft * scale;
        points.push({ x, radiusPx });
    }

    // Bold taper outline
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, yCenter - p.radiusPx);
        else ctx.lineTo(p.x, yCenter - p.radiusPx);
    });
    ctx.stroke();

    ctx.beginPath();
    points.slice().reverse().forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, yCenter + p.radiusPx);
        else ctx.lineTo(p.x, yCenter + p.radiusPx);
    });
    ctx.stroke();

    // Filled tapered shape (gray gradient)
    const gradient = ctx.createLinearGradient(0, 80, canvas.width, 120);
    gradient.addColorStop(0, '#D8D8D8');
    gradient.addColorStop(1, '#B0B0B0');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, yCenter - p.radiusPx);
        else ctx.lineTo(p.x, yCenter - p.radiusPx);
    });
    points.slice().reverse().forEach((p) => {
        ctx.lineTo(p.x, yCenter + p.radiusPx);
    });
    ctx.closePath();
    ctx.fill();

    // Foot ticks every 2ft
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    for (let i = 0; i <= totalLength; i += 2) {
        const x = i * scale;
        ctx.beginPath();
        ctx.moveTo(x, 65);
        ctx.lineTo(x, 80);
        ctx.stroke();
        ctx.fillStyle = '#000';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(i.toString(), x, 60);
    }

    // Diameter labels
    const labelFts = [];
    const interval = Math.floor(totalLength / 4);
    for (let i = 0; i <= 4; i++) {
        labelFts.push(Math.min(i * interval, totalLength));
    }

    labelFts.forEach((ft, idx) => {
        const taperFrac = ft / totalLength;
        const diaIn = Math.round((buttDia - (buttDia - topDia) * taperFrac) * 10) / 10;
        const x = ft * scale;
        const radiusPx = (diaIn / 2) * pxPerInch;
        const isLast = idx === labelFts.length - 1;

        // Vertical measurement line
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, yCenter - radiusPx - 12);
        ctx.lineTo(x, yCenter + radiusPx + 28);
        ctx.stroke();

        // Label
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = isLast ? 'right' : 'left';
        const labelX = isLast ? x - 6 : x + 6;
        ctx.strokeStyle = 'rgba(255,255,255,1)';
        ctx.lineWidth = 3;
        ctx.strokeText(diaIn.toString() + '"', labelX, yCenter + 35);
        ctx.fillStyle = '#000';
        ctx.fillText(diaIn.toString() + '"', labelX, yCenter + 35);
    });

    // Red cut markers
    cuts.forEach(cut => {
        const x = cut * scale;
        ctx.strokeStyle = '#f00';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, 45);
        ctx.lineTo(x, 155);
        ctx.stroke();

        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#f00';
        ctx.lineWidth = 1.5;
        ctx.strokeText(cut.toFixed(1) + "'", x, 42);
        ctx.fillStyle = '#fff';
        ctx.fillText(cut.toFixed(1) + "'", x, 42);
    });

    updateSegments();
}

// ─── Click to Add/Move Cuts ────────────────────────────────────────────────
canvas.addEventListener('click', (e) => {
    const scale = getScale();
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const idx = cuts.findIndex(c => Math.abs(c - x) < 0.5);
    if (idx !== -1) {
        cuts[idx] = x;
    } else {
        cuts.push(x);
        cuts.sort((a, b) => a - b);
    }
    drawLog();
});

// ─── Doyle Volume ─────────────────────────────────────────────────────────
function doyleVolume(diameterIn, lengthFt) {
    const D = Math.max(0, diameterIn - 4);
    return Math.round(D * D * (lengthFt / 16));
}

// ─── AHMI Grading + Price ──────────────────────────────────────────────────
function getGradeAndPrice(scalingDiaIn) {
    if (scalingDiaIn >= 20) return { grade: 'Prime',     pricePerBF: 2.50 };
    if (scalingDiaIn >= 16) return { grade: 'Select+',   pricePerBF: 1.80 };
    if (scalingDiaIn >= 12) return { grade: 'No.1',      pricePerBF: 1.20 };
    if (scalingDiaIn >= 8)  return { grade: 'No.2',      pricePerBF: 0.80 };
    return                         { grade: 'No.3/Pulp', pricePerBF: 0.30 };
}

// ─── Score a Set of Cuts ───────────────────────────────────────────────────
function scoreSegments(cutList) {
    const trim = getTrim();
    let totalValue = 0;
    const segs = [];

    cutList.forEach((cut, i) => {
        const startFt = i === 0 ? 0 : cutList[i - 1];
        const endFt = cut;
        const nominalLength = endFt - startFt - trim; // subtract trim for scaling
        if (nominalLength <= 0) return;

        const midFt = (startFt + endFt) / 2;
        const taperFrac = midFt / totalLength;
        const scalingDia = buttDia - (buttDia - topDia) * taperFrac;
        const volumeBF = doyleVolume(scalingDia, nominalLength);
        const gradeInfo = getGradeAndPrice(scalingDia);
        const value = Math.round(volumeBF * gradeInfo.pricePerBF);
        totalValue += value;
        segs.push({ cutFt: endFt, nominalLength, scalingDia, volumeBF, gradeInfo, value });
    });

    // Final segment to end of log
    const lastStart = cutList.length ? cutList[cutList.length - 1] : 0;
    const finalLength = totalLength - lastStart - trim;
    if (finalLength > 0) {
        const midFt = (lastStart + totalLength) / 2;
        const taperFrac = midFt / totalLength;
        const scalingDia = buttDia - (buttDia - topDia) * taperFrac;
        const volumeBF = doyleVolume(scalingDia, finalLength);
        const gradeInfo = getGradeAndPrice(scalingDia);
        const value = Math.round(volumeBF * gradeInfo.pricePerBF);
        totalValue += value;
        segs.push({ cutFt: totalLength, nominalLength: finalLength, scalingDia, volumeBF, gradeInfo, value });
    }

    return { totalValue, segs };
}

// ─── Update Segment Display ────────────────────────────────────────────────
function updateSegments() {
    const segmentsEl = document.getElementById('segments');
    const { totalValue, segs } = scoreSegments(cuts);
    const trim = getTrim();

    let html = '';
    segs.forEach((s, i) => {
        html += `<div class="segment">
            Log ${i + 1}: ${s.nominalLength.toFixed(1)}ft nominal
            (cut at ${s.cutFt.toFixed(1)}ft, +${(trim * 12).toFixed(0)}" trim) @
            ${s.scalingDia.toFixed(1)}" &rarr;
            ${s.volumeBF} bf <strong>${s.gradeInfo.grade}</strong> &rarr; $${s.value}
        </div>`;
    });

    segmentsEl.innerHTML = html;
    document.getElementById('segmentCount').textContent = segs.length;
    document.getElementById('totalValue').textContent = totalValue.toFixed(0);
}

// ─── Optimal Solver (Dynamic Programming) ─────────────────────────────────
function computeOptimal() {
    const trim = getTrim();
    const allowedLengths = [8, 10, 12, 14, 16]; // nominal lengths
    const step = 0.5;
    const steps = Math.round(totalLength / step);

    const dp = new Array(steps + 1).fill(0);
    const choice = new Array(steps + 1).fill(null);

    for (let i = steps - 1; i >= 0; i--) {
        const startFt = i * step;
        dp[i] = 0;
        choice[i] = null;

        for (const nomLen of allowedLengths) {
            const cutFt = startFt + nomLen + trim; // actual cut position
            if (cutFt > totalLength + 0.01) continue;
            const endStep = Math.min(Math.round(cutFt / step), steps);

            const midFt = startFt + nomLen / 2;
            const taperFrac = midFt / totalLength;
            const scalingDia = buttDia - (buttDia - topDia) * taperFrac;
            const volumeBF = doyleVolume(scalingDia, nomLen);
            const gradeInfo = getGradeAndPrice(scalingDia);
            const value = Math.round(volumeBF * gradeInfo.pricePerBF);

            const total = value + (dp[endStep] || 0);
            if (total > dp[i]) {
                dp[i] = total;
                choice[i] = endStep;
            }
        }
    }

    // Traceback
    const optimalCuts = [];
    let pos = 0;
    while (pos < steps && choice[pos] !== null) {
        pos = choice[pos];
        if (pos < steps) optimalCuts.push(pos * step);
    }

    return { optimalCuts, optimalValue: dp[0] };
}

// ─── Show Optimal Button ───────────────────────────────────────────────────
document.getElementById('computeOptimal').addEventListener('click', () => {
    const { optimalCuts, optimalValue } = computeOptimal();
    const { totalValue, segs } = scoreSegments(cuts);
    const { segs: optSegs } = scoreSegments(optimalCuts);
    const trim = getTrim();

    const pct = optimalValue > 0 ? Math.round((totalValue / optimalValue) * 100) : 0;
    const scoreColor = pct >= 90 ? '#27ae60' : pct >= 70 ? '#e67e22' : '#c0392b';

    let html = `
        <div style="background:#fff3cd; padding:15px; border-radius:8px; margin:15px 0; font-size:16px; border:1px solid #ffc107;">
            <strong>Your Value:</strong> $${totalValue} &nbsp;|&nbsp;
            <strong>Optimal Value:</strong> $${optimalValue} &nbsp;|&nbsp;
            <strong style="color:${scoreColor};">Score: ${pct}% of optimal</strong>
            &nbsp;(trim = ${(trim * 12).toFixed(0)}" per log)
        </div>
        <div style="display:flex; gap:20px; flex-wrap:wrap;">
            <div style="flex:1; min-width:250px;">
                <h3 style="color:#c0392b;">&#9998; Your Bucking</h3>`;

    segs.forEach((s, i) => {
        html += `<div class="segment" style="border-left:4px solid #c0392b;">
            Log ${i+1}: ${s.nominalLength.toFixed(1)}ft @
            ${s.scalingDia.toFixed(1)}" &rarr;
            ${s.volumeBF} bf <strong>${s.gradeInfo.grade}</strong> &rarr; $${s.value}
        </div>`;
    });

    html += `<div style="font-weight:bold; margin-top:8px;">Total: $${totalValue}</div>
             </div>
             <div style="flex:1; min-width:250px;">
                <h3 style="color:#27ae60;">&#10003; Optimal Bucking</h3>`;

    optSegs.forEach((s, i) => {
        html += `<div class="segment" style="border-left:4px solid #27ae60;">
            Log ${i+1}: ${s.nominalLength.toFixed(1)}ft @
            ${s.scalingDia.toFixed(1)}" &rarr;
            ${s.volumeBF} bf <strong>${s.gradeInfo.grade}</strong> &rarr; $${s.value}
        </div>`;
    });

    html += `<div style="font-weight:bold; margin-top:8px;">Total: $${optimalValue}</div>
             </div></div>`;

    document.getElementById('segments').innerHTML = html;
});

// ─── Reset Button ──────────────────────────────────────────────────────────
document.getElementById('reset').addEventListener('click', () => {
    cuts = [];
    drawLog();
});

// ─── New Log Button ────────────────────────────────────────────────────────
document.getElementById('newLog').addEventListener('click', () => {
    const newButt = parseFloat(prompt('Enter butt (large end) diameter in inches:', buttDia));
    if (isNaN(newButt) || newButt <= 0) { alert('Invalid butt diameter.'); return; }

    const newTop = parseFloat(prompt('Enter small end diameter in inches:', topDia));
    if (isNaN(newTop) || newTop <= 0) { alert('Invalid small end diameter.'); return; }

    if (newTop >= newButt) { alert('Small end must be less than butt diameter.'); return; }

    const newLength = parseFloat(prompt('Enter total merchantable length in feet:', totalLength));
    if (isNaN(newLength) || newLength <= 0) { alert('Invalid length.'); return; }

    buttDia = newButt;
    topDia = newTop;
    totalLength = newLength;
    cuts = [];
    drawLog();
});

// ─── Trim Input Live Update ────────────────────────────────────────────────
document.getElementById('trimInput').addEventListener('change', () => {
    drawLog();
});

// ─── Initial Draw ──────────────────────────────────────────────────────────
drawLog();
