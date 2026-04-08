/*
  Math Race — Node.js backend
  
  SETUP:
    npm init -y
    npm install express ws cors
    node server.js
    
  Then open leaderboard.html in a browser.
  Results come in from Unity via POST /api/result
  and are broadcast live to all connected WebSocket clients.
*/

const express = require('express');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve leaderboard.html as the root page
app.use(express.static(path.join(__dirname)));

// ── In-memory leaderboard (sorted by finalTime ascending) ────────────
const results = [];

// ── POST /api/result — Unity sends here on race finish ───────────────
app.post('/api/result', (req, res) => {
    const { playerName, finalTime, penaltyTotal } = req.body;

    if (!playerName || finalTime == null) {
        return res.status(400).json({ error: 'Missing playerName or finalTime' });
    }

    // Update existing entry or add new one
    const existing = results.findIndex(r => r.playerName === playerName);
    const entry = { playerName, finalTime, penaltyTotal: penaltyTotal || 0 };

    if (existing >= 0) results[existing] = entry;
    else               results.push(entry);

    // Sort by fastest time
    results.sort((a, b) => a.finalTime - b.finalTime);

    console.log(`[Result] ${playerName} — ${formatTime(finalTime)} (penalties: ${penaltyTotal}s)`);

    // Broadcast updated leaderboard to all WebSocket clients
    const payload = JSON.stringify({ type: 'ranking_update', data: results });
    wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(payload);
    });

    res.json({ ok: true, rank: results.findIndex(r => r.playerName === playerName) + 1 });
});

// ── GET /api/ranking — fetch current leaderboard ─────────────────────
app.get('/api/ranking', (req, res) => res.json(results));

// ── GET /api/ping — Simple wake-up call ──────────────────────────────
app.get('/api/ping', (req, res) => {
    res.json({ status: 'awake', timestamp: new Date() });
});

// ── HTTP + WebSocket server ───────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`Math Race server running on http://localhost:${PORT}`);
    console.log(`Leaderboard: http://localhost:${PORT}/leaderboard.html`);
});

const wss = new WebSocketServer({ server });
wss.on('connection', ws => {
    console.log('[WS] Client connected');
    // Send current leaderboard immediately on connect
    ws.send(JSON.stringify({ type: 'ranking_update', data: results }));
    ws.on('close', () => console.log('[WS] Client disconnected'));
});

// ── Utility ───────────────────────────────────────────────────────────
function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(3).padStart(6, '0');
    return `${m}:${sec}`;
}
