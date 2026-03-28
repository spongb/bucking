// Bucking Trainer — research logging server
// Zero dependencies (Node.js built-ins only).
// Run:  node server.js
// Then open:  http://localhost:3000/?user=P001
//
// Completed sessions are appended to attempts.csv in this directory.

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT     = 3000;
const LOG_FILE = path.join(__dirname, 'attempts.csv');
const STATIC   = __dirname;

// ── Ensure CSV exists with a header row ──────────────────────────────────────
if (!fs.existsSync(LOG_FILE)) {
    // Header: user, timestamp, log1_pct … log5_pct, overall_pct
    fs.writeFileSync(LOG_FILE,
        'user,timestamp,log1_pct,log2_pct,log3_pct,log4_pct,log5_pct,overall_pct\n',
        'utf8');
}

// ── MIME types for static files ───────────────────────────────────────────────
const MIME = {
    '.html': 'text/html',
    '.css':  'text/css',
    '.js':   'application/javascript',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
};

// ── Helper: collect request body ──────────────────────────────────────────────
function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end',  () => resolve(data));
        req.on('error', reject);
    });
}

// ── Request handler ────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {

    // POST /log  — append one row to the CSV
    if (req.method === 'POST' && req.url === '/log') {
        try {
            const body = JSON.parse(await readBody(req));
            const { user = 'unknown', timestamp, logs = [], overall = '' } = body;

            // Pad to 5 log columns so CSV stays rectangular
            const logCols = Array.from({ length: 5 }, (_, i) =>
                logs[i] !== undefined ? logs[i] : '');

            // Escape any commas in the user field
            const safeUser = `"${String(user).replace(/"/g, '""')}"`;
            const row = [safeUser, timestamp, ...logCols, overall].join(',') + '\n';
            fs.appendFile(LOG_FILE, row, 'utf8', err => {
                if (err) console.error('Log write error:', err);
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"ok":true}');
        } catch (e) {
            res.writeHead(400);
            res.end('Bad request');
        }
        return;
    }

    // GET — serve static files
    let filePath = path.join(STATIC, req.url === '/' ? 'index.html' : req.url.split('?')[0]);

    // Security: prevent directory traversal
    if (!filePath.startsWith(STATIC)) {
        res.writeHead(403); res.end('Forbidden'); return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
            return;
        }
        const ext  = path.extname(filePath).toLowerCase();
        const mime = MIME[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`Bucking Trainer running at http://localhost:${PORT}`);
    console.log(`Logging attempts to: ${LOG_FILE}`);
    console.log(`\nParticipant URL format: http://localhost:${PORT}/?user=P001`);
});
