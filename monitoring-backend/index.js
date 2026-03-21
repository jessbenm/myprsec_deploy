const express    = require('express');
const cors       = require('cors');
const { Client } = require('ssh2');
const fs         = require('fs');
const http       = require('http');
const { WebSocketServer } = require('ws');
const Database   = require('better-sqlite3');
require('dotenv').config();

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ══════════════════════════════════════════════════════════════════════════════
// VPS STORE
// ══════════════════════════════════════════════════════════════════════════════
const VPS_FILE = './vps-store.json';
function loadStore() {
  try { if (fs.existsSync(VPS_FILE)) return JSON.parse(fs.readFileSync(VPS_FILE, 'utf8')); }
  catch(e) { console.error('vps-store.json:', e.message); }
  return {};
}
function saveStore() { fs.writeFileSync(VPS_FILE, JSON.stringify(vpsStore, null, 2)); }
let vpsStore = loadStore();
console.log(`📦 VPS chargés : ${Object.keys(vpsStore).join(', ') || 'aucun'}`);

// ══════════════════════════════════════════════════════════════════════════════
// SQLITE — Historique des métriques
// ══════════════════════════════════════════════════════════════════════════════
const db = new Database('./metrics-history.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS metrics (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    vps_id      TEXT    NOT NULL,
    timestamp   INTEGER NOT NULL,
    container   TEXT    NOT NULL,
    cpu         REAL    DEFAULT 0,
    mem_mb      REAL    DEFAULT 0,
    mem_perc    REAL    DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_metrics_vps_ts ON metrics(vps_id, timestamp);

  CREATE TABLE IF NOT EXISTS vps_snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    vps_id      TEXT    NOT NULL,
    timestamp   INTEGER NOT NULL,
    total_cpu   REAL    DEFAULT 0,
    total_mem   REAL    DEFAULT 0,
    running     INTEGER DEFAULT 0,
    total       INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_snapshots_vps_ts ON vps_snapshots(vps_id, timestamp);
`);

// Nettoyage auto des données > 31 jours
function cleanOldData() {
  const cutoff = Date.now() - 31 * 24 * 60 * 60 * 1000;
  db.prepare('DELETE FROM metrics WHERE timestamp < ?').run(cutoff);
  db.prepare('DELETE FROM vps_snapshots WHERE timestamp < ?').run(cutoff);
}
setInterval(cleanOldData, 60 * 60 * 1000); // toutes les heures
cleanOldData();

// ══════════════════════════════════════════════════════════════════════════════
// SSH HELPER
// ══════════════════════════════════════════════════════════════════════════════
function runSSH(vps, command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let output = '';
    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) return reject(err);
        stream.on('data', d => { output += d.toString(); });
        stream.stderr.on('data', d => { output += d.toString(); });
        stream.on('close', () => { conn.end(); resolve(output.trim()); });
      });
    });
    conn.on('error', err => reject(err));
    conn.connect({ host: vps.host, port: vps.port || 22, username: vps.username, password: vps.password });
  });
}

function parseCpu(s) { return parseFloat(s) || 0; }
function parseMem(s) {
  const m = s.match(/([\d.]+)\s*(MiB|GiB|MB|GB)/i);
  if (!m) return 0;
  return parseFloat(m[1]) * (/gib|gb/i.test(m[2]) ? 1024 : 1);
}
function detectLogLevel(msg) {
  const m = msg.toLowerCase();
  if (m.includes('error') || m.includes('fatal')) return 'error';
  if (m.includes('warn')) return 'warn';
  if (m.includes('debug')) return 'debug';
  return 'info';
}

// ══════════════════════════════════════════════════════════════════════════════
// COLLECTE AUTOMATIQUE DES MÉTRIQUES (toutes les 30s)
// ══════════════════════════════════════════════════════════════════════════════
const insertMetric   = db.prepare('INSERT INTO metrics (vps_id, timestamp, container, cpu, mem_mb, mem_perc) VALUES (?, ?, ?, ?, ?, ?)');
const insertSnapshot = db.prepare('INSERT INTO vps_snapshots (vps_id, timestamp, total_cpu, total_mem, running, total) VALUES (?, ?, ?, ?, ?, ?)');

async function collectMetrics(vpsId) {
  const vps = vpsStore[vpsId];
  if (!vps) return;
  try {
    const [statsRaw, psRaw] = await Promise.all([
      runSSH(vps, "docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}'"),
      runSSH(vps, "docker ps --format '{{.Names}}|{{.Status}}'"),
    ]);

    const containers = statsRaw.split('\n').filter(Boolean).map(line => {
      const [name, cpu, mem, memPerc] = line.split('|').map(s => s.trim());
      return { name, cpu: parseCpu(cpu), mem: parseMem(mem), memPerc: parseCpu(memPerc) };
    });

    const ps      = psRaw.split('\n').filter(Boolean).map(line => {
      const idx = line.indexOf('|');
      return { name: line.slice(0, idx).trim(), status: line.slice(idx + 1).trim() };
    });

    const now     = Date.now();
    const running = ps.filter(p => p.status.includes('Up')).length;
    const total   = ps.length;
    const totalCpu = containers.reduce((s, c) => s + c.cpu, 0) / Math.max(1, containers.length);
    const totalMem = containers.reduce((s, c) => s + c.mem, 0);

    // Transaction pour insérer tout d'un coup
    const insertAll = db.transaction(() => {
      containers.forEach(c => {
        insertMetric.run(vpsId, now, c.name, c.cpu, c.mem, c.memPerc);
      });
      insertSnapshot.run(vpsId, now, totalCpu, totalMem, running, total);
    });
    insertAll();

  } catch (err) {
    // Silencieux — le VPS peut être temporairement inaccessible
  }
}

async function collectAll() {
  for (const vpsId of Object.keys(vpsStore)) {
    await collectMetrics(vpsId);
  }
}

// Collecte immédiate + toutes les 30s
collectAll();
setInterval(collectAll, 30 * 1000);

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES VPS
// ══════════════════════════════════════════════════════════════════════════════

app.post('/api/vps', (req, res) => {
  const { id, name, host, username, password, port } = req.body;
  if (!id || !host || !username || !password)
    return res.status(400).json({ error: 'Requis : id, host, username, password' });
  vpsStore[id] = { id, name: name || id, host, port: port || 22, username, password };
  saveStore();
  collectMetrics(id); // Collecter immédiatement
  console.log(`✅ VPS "${id}" enregistré : ${username}@${host}`);
  res.json({ message: 'VPS ajouté', vps: { id, name, host } });
});

app.get('/api/vps', (req, res) => {
  res.json(Object.values(vpsStore).map(v => ({ id: v.id, name: v.name, host: v.host })));
});

app.delete('/api/vps/:id', (req, res) => {
  if (!vpsStore[req.params.id]) return res.status(404).json({ error: 'VPS introuvable' });
  delete vpsStore[req.params.id];
  saveStore();
  res.json({ ok: true });
});

app.post('/api/vps/:id/test', async (req, res) => {
  const vps = vpsStore[req.params.id];
  if (!vps) return res.status(404).json({ error: 'VPS introuvable' });
  try {
    const out = await runSSH(vps, 'echo ok && hostname && uptime');
    res.json({ ok: true, output: out });
  } catch (err) { res.status(503).json({ ok: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// MÉTRIQUES TEMPS RÉEL
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/metrics/:id', async (req, res) => {
  const vps = vpsStore[req.params.id];
  if (!vps) return res.status(404).json({ error: 'VPS non trouvé' });
  try {
    const [statsRaw, psRaw] = await Promise.all([
      runSSH(vps, "docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}'"),
      runSSH(vps, "docker ps --format '{{.Names}}|{{.Status}}'"),
    ]);
    const containers = statsRaw.split('\n').filter(Boolean).map(line => {
      const [name, cpu, mem, memPerc] = line.split('|').map(s => s.trim());
      return { name, cpu, mem, memPerc };
    });
    const ps = psRaw.split('\n').filter(Boolean).map(line => {
      const idx = line.indexOf('|');
      return { name: line.slice(0, idx).trim(), status: line.slice(idx + 1).trim() };
    });
    containers.forEach(c => { c.status = ps.find(p => p.name === c.name)?.status || 'unknown'; });
    res.json({ vps: { id: vps.id, name: vps.name, host: vps.host }, containers, ps, timestamp: new Date().toISOString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// HISTORIQUE MÉTRIQUES (pour les graphiques avec plage de temps)
// ══════════════════════════════════════════════════════════════════════════════

// Conversion plage de temps en millisecondes
function rangeToMs(range) {
  const map = { '1h': 3600000, '6h': 21600000, '12h': 43200000, '24h': 86400000, '7d': 604800000, '30d': 2592000000 };
  return map[range] || 86400000;
}

// Grouper les données par intervalle de temps
function groupDataByInterval(rows, rangeMs) {
  if (!rows.length) return [];
  
  // Choisir l'intervalle selon la plage
  let intervalMs;
  if (rangeMs <= 3600000)       intervalMs = 60000;      // 1h  → par minute
  else if (rangeMs <= 21600000) intervalMs = 300000;     // 6h  → par 5 min
  else if (rangeMs <= 86400000) intervalMs = 900000;     // 24h → par 15 min
  else if (rangeMs <= 604800000)intervalMs = 3600000;    // 7d  → par heure
  else                          intervalMs = 7200000;    // 30d → par 2h

  const buckets = {};
  rows.forEach(row => {
    const bucket = Math.floor(row.timestamp / intervalMs) * intervalMs;
    if (!buckets[bucket]) buckets[bucket] = [];
    buckets[bucket].push(row);
  });

  return Object.entries(buckets)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([ts, items]) => {
      const time = new Date(Number(ts));
      const rangeDay = rangeMs >= 604800000;
      const label = rangeDay
        ? time.toLocaleDateString('fr', { month: 'short', day: 'numeric' }) + ' ' + time.toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' })
        : time.toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' });
      return { time: label, items };
    });
}

// GET /api/history/:id/cpu?range=24h
app.get('/api/history/:id/cpu', (req, res) => {
  const { id } = req.params;
  const range   = req.query.range || '24h';
  const rangeMs = rangeToMs(range);
  const since   = Date.now() - rangeMs;

  const rows = db.prepare(`
    SELECT timestamp, container, cpu 
    FROM metrics 
    WHERE vps_id = ? AND timestamp >= ?
    ORDER BY timestamp ASC
  `).all(id, since);

  if (!rows.length) return res.json({ points: [], containers: [] });

  // Récupérer les containers uniques
  const containers = [...new Set(rows.map(r => r.container))];

  // Grouper par intervalle
  const grouped = groupDataByInterval(rows, rangeMs);

  const points = grouped.map(({ time, items }) => {
    const point = { time };
    containers.forEach(c => {
      const cItems = items.filter(i => i.container === c);
      point[c.replace(/mypresc-(staging|production|dev)-/, '')] = cItems.length
        ? Math.round(cItems.reduce((s, i) => s + i.cpu, 0) / cItems.length * 10) / 10
        : 0;
    });
    return point;
  });

  res.json({ points, containers: containers.map(c => c.replace(/mypresc-(staging|production|dev)-/, '')) });
});

// GET /api/history/:id/memory?range=24h
app.get('/api/history/:id/memory', (req, res) => {
  const { id } = req.params;
  const range   = req.query.range || '24h';
  const rangeMs = rangeToMs(range);
  const since   = Date.now() - rangeMs;

  const rows = db.prepare(`
    SELECT timestamp, SUM(mem_mb) as total_mem
    FROM metrics
    WHERE vps_id = ? AND timestamp >= ?
    GROUP BY timestamp
    ORDER BY timestamp ASC
  `).all(id, since);

  if (!rows.length) return res.json({ points: [] });

  const grouped = groupDataByInterval(rows, rangeMs);
  const points  = grouped.map(({ time, items }) => ({
    time,
    v: Math.round(items.reduce((s, i) => s + i.total_mem, 0) / items.length / 1024 * 100) / 100,
  }));

  res.json({ points });
});

// ══════════════════════════════════════════════════════════════════════════════
// LOGS
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/logs/:id', async (req, res) => {
  const vps = vpsStore[req.params.id];
  if (!vps) return res.status(404).json({ error: 'VPS non trouvé' });
  const lines = parseInt(req.query.lines) || 50;
  try {
    const psRaw = await runSSH(vps, "docker ps --format '{{.Names}}'");
    const names = psRaw.split('\n').filter(Boolean);
    const results = await Promise.all(names.map(async name => {
      try {
        const raw = await runSSH(vps, `docker logs --tail ${lines} --timestamps ${name} 2>&1`);
        return raw.split('\n').filter(Boolean).map(line => {
          const m = line.match(/^(\S+)\s+(.+)$/);
          return { container: name, timestamp: m?.[1] || new Date().toISOString(), message: m?.[2] || line, level: detectLogLevel(m?.[2] || line) };
        });
      } catch { return []; }
    }));
    res.json({ logs: results.flat().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 200), timestamp: new Date().toISOString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/logs/:id/:container', async (req, res) => {
  const vps = vpsStore[req.params.id];
  if (!vps) return res.status(404).json({ error: 'VPS non trouvé' });
  try {
    const raw = await runSSH(vps, `docker logs --tail ${parseInt(req.query.lines) || 100} --timestamps ${req.params.container} 2>&1`);
    const logs = raw.split('\n').filter(Boolean).map(line => {
      const m = line.match(/^(\S+)\s+(.+)$/);
      return { container: req.params.container, timestamp: m?.[1] || new Date().toISOString(), message: m?.[2] || line, level: detectLogLevel(m?.[2] || line) };
    });
    res.json({ logs, container: req.params.container });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// RESPONSE TIME + REQUESTS
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/response-time/:id', async (req, res) => {
  const vps = vpsStore[req.params.id];
  if (!vps) return res.status(404).json({ error: 'VPS non trouvé' });
  try {
    const psRaw = await runSSH(vps, "docker ps --format '{{.Names}}' | grep -i nginx");
    const nginxName = psRaw.split('\n')[0].trim();
    if (!nginxName) return res.json({ points: [], avg: 0, p95: 0 });
    const raw = await runSSH(vps, `docker logs --tail 500 --timestamps ${nginxName} 2>&1`);
    const points = [];
    raw.split('\n').filter(Boolean).forEach(line => {
      const tm = line.match(/(\d+\.\d+)$/), ts = line.match(/^(\S+)/);
      if (tm && ts) points.push({ timestamp: ts[1], ms: Math.round(parseFloat(tm[1]) * 1000) });
    });
    if (!points.length) return res.json({ points: [], avg: 0, p95: 0 });
    const sorted = [...points.map(p => p.ms)].sort((a, b) => a - b);
    res.json({ points: groupByMinutes(points, 5), avg: Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length), p95: sorted[Math.floor(sorted.length * 0.95)] || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/requests/:id', async (req, res) => {
  const vps = vpsStore[req.params.id];
  if (!vps) return res.status(404).json({ error: 'VPS non trouvé' });
  try {
    const psRaw = await runSSH(vps, "docker ps --format '{{.Names}}' | grep -i nginx");
    const nginxName = psRaw.split('\n')[0].trim();
    if (!nginxName) return res.json({ points: [], current_rpm: 0 });
    const raw = await runSSH(vps, `docker logs --since 1h --timestamps ${nginxName} 2>&1`);
    const lines = raw.split('\n').filter(Boolean);
    const buckets = {};
    lines.forEach(line => {
      const m = line.match(/^(\S+)/);
      if (!m) return;
      const d = new Date(m[1]); if (isNaN(d)) return;
      d.setSeconds(0, 0);
      buckets[d.toISOString()] = (buckets[d.toISOString()] || 0) + 1;
    });
    const points = Object.entries(buckets).sort(([a],[b]) => new Date(a)-new Date(b))
      .map(([t, c]) => ({ time: new Date(t).toLocaleTimeString('fr',{hour:'2-digit',minute:'2-digit'}), count: c }));
    const last5 = points.slice(-5);
    res.json({ points, current_rpm: last5.length ? Math.round(last5.reduce((s,p)=>s+p.count,0)/last5.length) : 0, total_1h: lines.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function groupByMinutes(points, intervalMin) {
  const buckets = {};
  points.forEach(p => {
    const d = new Date(p.timestamp); d.setSeconds(0,0);
    d.setMinutes(Math.floor(d.getMinutes()/intervalMin)*intervalMin);
    const key = d.toISOString();
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(p.ms);
  });
  return Object.entries(buckets).sort(([a],[b])=>new Date(a)-new Date(b)).map(([t,vals])=>({
    time: new Date(t).toLocaleTimeString('fr',{hour:'2-digit',minute:'2-digit'}),
    avg: Math.round(vals.reduce((s,v)=>s+v,0)/vals.length),
    p95: vals.sort((a,b)=>a-b)[Math.floor(vals.length*0.95)]||0,
  }));
}

// ══════════════════════════════════════════════════════════════════════════════
// ALERTES
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/alerts/:id', async (req, res) => {
  const vps = vpsStore[req.params.id];
  if (!vps) return res.status(404).json({ error: 'VPS non trouvé' });
  try {
    const [statsRaw, psRaw] = await Promise.all([
      runSSH(vps, "docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}'"),
      runSSH(vps, "docker ps --format '{{.Names}}|{{.Status}}'"),
    ]);
    const containers = statsRaw.split('\n').filter(Boolean).map(line => {
      const [name,cpu,mem,memPerc] = line.split('|').map(s=>s.trim()); return {name,cpu,mem,memPerc};
    });
    const ps = psRaw.split('\n').filter(Boolean).map(line => {
      const idx = line.indexOf('|'); return {name:line.slice(0,idx).trim(),status:line.slice(idx+1).trim()};
    });
    const alerts = [], now = new Date().toISOString();
    containers.forEach(c => {
      const short=c.name.replace(/mypresc-(staging|production|dev)-/,''), cpu=parseCpu(c.cpu), mem=parseCpu(c.memPerc), memUsed=c.mem.split('/')[0].trim();
      if(cpu>80)     alerts.push({id:`cpu-c-${c.name}`,type:'critical',title:`${short} CPU Critical`,message:`CPU at ${cpu.toFixed(1)}%`,container:short,value:cpu,timestamp:now});
      else if(cpu>50)alerts.push({id:`cpu-w-${c.name}`,type:'warning', title:`${short} CPU High`,    message:`CPU at ${cpu.toFixed(1)}%`,container:short,value:cpu,timestamp:now});
      if(mem>85)     alerts.push({id:`mem-c-${c.name}`,type:'critical',title:`${short} Memory Critical`,message:`Memory at ${mem.toFixed(1)}% (${memUsed})`,container:short,value:mem,timestamp:now});
      else if(mem>70)alerts.push({id:`mem-w-${c.name}`,type:'warning', title:`${short} Memory Warning`, message:`Memory at ${mem.toFixed(1)}% (${memUsed})`,container:short,value:mem,timestamp:now});
    });
    ps.forEach(p=>{ if(!p.status.includes('Up')){const s=p.name.replace(/mypresc-(staging|production|dev)-/,'');alerts.push({id:`down-${p.name}`,type:'critical',title:`${s} Down`,message:`Status: ${p.status}`,container:s,value:0,timestamp:now});}});
    res.json({alerts,count:alerts.length,critical:alerts.filter(a=>a.type==='critical').length,warning:alerts.filter(a=>a.type==='warning').length,timestamp:now});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// WEBSOCKET TERMINAL SSH
// ══════════════════════════════════════════════════════════════════════════════
const wssById = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const match = request.url.match(/^\/terminal\/(.+)$/);
  if (match) {
    wssById.handleUpgrade(request, socket, head, (ws) => {
      wssById.emit('connection', ws, request, match[1]);
    });
  } else {
    socket.destroy();
  }
});

wssById.on('connection', (ws, request, vpsId) => {
  const vps = vpsStore[vpsId];
  if (!vps) { ws.send(JSON.stringify({ type: 'error', data: `VPS "${vpsId}" introuvable` })); ws.close(); return; }
  console.log(`🔌 Terminal SSH → ${vps.username}@${vps.host}`);
  const conn = new Client();
  let stream = null;
  conn.on('ready', () => {
    conn.shell({ term: 'xterm-256color', cols: 220, rows: 50 }, (err, s) => {
      if (err) { ws.send(JSON.stringify({ type: 'error', data: err.message })); ws.close(); return; }
      stream = s;
      stream.on('data', d => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'data', data: d.toString() })); });
      stream.stderr.on('data', d => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'data', data: d.toString() })); });
      stream.on('close', () => { conn.end(); if (ws.readyState === ws.OPEN) ws.close(); });
    });
  });
  conn.on('error', err => { ws.send(JSON.stringify({ type: 'error', data: `SSH: ${err.message}` })); ws.close(); });
  ws.on('message', msg => {
    try {
      const data = JSON.parse(msg.toString());
      if (!stream) return;
      if (data.type === 'input') stream.write(data.data);
      else if (data.type === 'resize') stream.setWindow(data.rows, data.cols, 0, 0);
    } catch {}
  });
  ws.on('close', () => { if (stream) stream.close(); conn.end(); });
  conn.connect({ host: vps.host, port: vps.port || 22, username: vps.username, password: vps.password, readyTimeout: 15000 });
});

// ══════════════════════════════════════════════════════════════════════════════
// HEALTH
// ══════════════════════════════════════════════════════════════════════════════

app.get('/', (req, res) => {
  res.json({ status: 'ok', vps: Object.keys(vpsStore), timestamp: new Date().toISOString() });
});

server.listen(PORT, () => {
  console.log(`\n🚀 MyPresc Backend    → http://localhost:${PORT}`);
  console.log(`🔌 WebSocket Terminal → ws://localhost:${PORT}/terminal/:id`);
  console.log(`🗄️  SQLite history     → metrics-history.db`);
  console.log(`   Collecte toutes les 30s — historique 31 jours\n`);
});