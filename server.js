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
    // Log incoming data so you can see it in the Render terminal
    console.log("Incoming Result:", req.body);

    const { playerName, finalTime, penaltyTotal } = req.body;

    // Check for undefined or null explicitly
    if (!playerName || finalTime === undefined || finalTime === null) {
        console.error("[400] Validation Failed: Missing playerName or finalTime");
        return res.status(400).json({ error: 'Missing playerName or finalTime' });
    }

    const entry = { 
        playerName, 
        finalTime: parseFloat(finalTime), 
        penaltyTotal: parseFloat(penaltyTotal || 0) 
    };

    const existing = results.findIndex(r => r.playerName === playerName);
    if (existing >= 0) results[existing] = entry;
    else               results.push(entry);

    results.sort((a, b) => a.finalTime - b.finalTime);

    // Broadcast to WebSockets
    const payload = JSON.stringify({ type: 'ranking_update', data: results });
    wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(payload);
    });

    res.json({ ok: true });
});

// ── GET /api/ranking — fetch current leaderboard ─────────────────────
app.get('/api/ranking', (req, res) => res.json(results));

// ── GET /api/ping — Simple wake-up call ──────────────────────────────
app.get('/api/ping', (req, res) => {
    res.json({ status: 'awake', timestamp: new Date() });
});
// Add this above your app.listen call
app.get('/play', (req, res) => {
    res.sendFile(path.join(__dirname, 'game.html'));
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
