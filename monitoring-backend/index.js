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
  try {
    if (fs.existsSync(VPS_FILE)) return JSON.parse(fs.readFileSync(VPS_FILE, 'utf8'));
  } catch (e) {
    console.error('vps-store.json:', e.message);
  }
  return {};
}

function saveStore() {
  fs.writeFileSync(VPS_FILE, JSON.stringify(vpsStore, null, 2));
}

let vpsStore = loadStore();
console.log(`📦 VPS chargés : ${Object.keys(vpsStore).join(', ') || 'aucun'}`);

// ══════════════════════════════════════════════════════════════════════════════
// SQLITE — Historique des métriques + AUDIT LOG
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

  CREATE TABLE IF NOT EXISTS latency_history (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    vps_id    TEXT    NOT NULL,
    timestamp INTEGER NOT NULL,
    url       TEXT    NOT NULL,
    ms        INTEGER DEFAULT 0,
    status    INTEGER DEFAULT 0,
    ok        INTEGER DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_latency_vps_ts ON latency_history(vps_id, timestamp);

  CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp   INTEGER NOT NULL,
    action      TEXT    NOT NULL,
    category    TEXT    NOT NULL DEFAULT 'settings',
    details     TEXT    DEFAULT '',
    ip          TEXT    DEFAULT '',
    success     INTEGER DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(timestamp);
`);

// Nettoyage auto des données > 31 jours
function cleanOldData() {
  const cutoff = Date.now() - 31 * 24 * 60 * 60 * 1000;
  db.prepare('DELETE FROM metrics          WHERE timestamp < ?').run(cutoff);
  db.prepare('DELETE FROM vps_snapshots    WHERE timestamp < ?').run(cutoff);
  db.prepare('DELETE FROM latency_history  WHERE timestamp < ?').run(cutoff);
  // Garder 90 jours pour l'audit log
  const auditCutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  db.prepare('DELETE FROM audit_log        WHERE timestamp < ?').run(auditCutoff);
}
setInterval(cleanOldData, 60 * 60 * 1000);
cleanOldData();

// ══════════════════════════════════════════════════════════════════════════════
// AUDIT LOG HELPER
// ══════════════════════════════════════════════════════════════════════════════
const insertAudit = db.prepare(
  'INSERT INTO audit_log (timestamp, action, category, details, ip, success) VALUES (?, ?, ?, ?, ?, ?)'
);

function auditLog({ action, category = 'settings', details = '', ip = '', success = 1 }) {
  try {
    insertAudit.run(Date.now(), action, category, details, ip, success ? 1 : 0);
    console.log(`📋 Audit [${category}] ${action}${details ? ' — ' + details : ''}`);
  } catch (e) {
    console.error('auditLog error:', e.message);
  }
}

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

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
        stream.on('data',        d => { output += d.toString(); });
        stream.stderr.on('data', d => { output += d.toString(); });
        stream.on('close', () => { conn.end(); resolve(output.trim()); });
      });
    });
    conn.on('error', err => reject(err));
    conn.connect({
      host:     vps.host,
      port:     vps.port || 22,
      username: vps.username,
      password: vps.password,
    });
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
  if (m.includes('warn'))                          return 'warn';
  if (m.includes('debug'))                         return 'debug';
  return 'info';
}

// ══════════════════════════════════════════════════════════════════════════════
// PING HTTP — mesure de latence toutes les 30s
// ══════════════════════════════════════════════════════════════════════════════
function pingHttp(host) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.get(`http://${host}`, { timeout: 5000 }, (res) => {
      const ms = Date.now() - start;
      res.resume();
      resolve({ ms, status: res.statusCode, ok: 1 });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ms: 5000, status: 0, ok: 0 }); });
    req.on('error',   () => { resolve({ ms: Date.now() - start, status: 0, ok: 0 }); });
  });
}

const insertLatency = db.prepare(
  'INSERT INTO latency_history (vps_id, timestamp, url, ms, status, ok) VALUES (?, ?, ?, ?, ?, ?)'
);

async function collectLatency(vpsId) {
  const vps = vpsStore[vpsId];
  if (!vps) return;
  try {
    const { ms, status, ok } = await pingHttp(vps.host);
    insertLatency.run(vpsId, Date.now(), `http://${vps.host}`, ms, status, ok);
    console.log(`🌐 Latence [${vpsId}] → ${ok ? ms + 'ms' : 'timeout'} (HTTP ${status})`);
  } catch (err) {
    console.error(`❌ collectLatency [${vpsId}]:`, err.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// COLLECTE MÉTRIQUES DOCKER (toutes les 30s)
// ══════════════════════════════════════════════════════════════════════════════
const insertMetric   = db.prepare(
  'INSERT INTO metrics (vps_id, timestamp, container, cpu, mem_mb, mem_perc) VALUES (?, ?, ?, ?, ?, ?)'
);
const insertSnapshot = db.prepare(
  'INSERT INTO vps_snapshots (vps_id, timestamp, total_cpu, total_mem, running, total) VALUES (?, ?, ?, ?, ?, ?)'
);

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

    const ps = psRaw.split('\n').filter(Boolean).map(line => {
      const idx = line.indexOf('|');
      return { name: line.slice(0, idx).trim(), status: line.slice(idx + 1).trim() };
    });

    const now      = Date.now();
    const running  = ps.filter(p => p.status.includes('Up')).length;
    const total    = ps.length;
    const totalCpu = containers.reduce((s, c) => s + c.cpu, 0) / Math.max(1, containers.length);
    const totalMem = containers.reduce((s, c) => s + c.mem, 0);

    db.transaction(() => {
      containers.forEach(c => insertMetric.run(vpsId, now, c.name, c.cpu, c.mem, c.memPerc));
      insertSnapshot.run(vpsId, now, totalCpu, totalMem, running, total);
    })();
  } catch {
    // Silencieux — VPS temporairement inaccessible
  }
}

async function collectAll() {
  await Promise.all(
    Object.keys(vpsStore).map(id =>
      Promise.all([collectMetrics(id), collectLatency(id)])
    )
  );
}

collectAll();
setInterval(collectAll, 30 * 1000);

// ══════════════════════════════════════════════════════════════════════════════
// UTILITAIRES — plages de temps & regroupement
// ══════════════════════════════════════════════════════════════════════════════
function rangeToMs(range) {
  const map = {
    '1h':  3_600_000,
    '6h':  21_600_000,
    '12h': 43_200_000,
    '24h': 86_400_000,
    '7d':  604_800_000,
    '30d': 2_592_000_000,
  };
  return map[range] || 86_400_000;
}

function intervalForRange(rangeMs) {
  if (rangeMs <=  3_600_000) return     60_000;
  if (rangeMs <= 21_600_000) return    300_000;
  if (rangeMs <= 86_400_000) return    900_000;
  if (rangeMs <=604_800_000) return  3_600_000;
  return                              7_200_000;
}

function groupDataByInterval(rows, rangeMs) {
  if (!rows.length) return [];
  const intervalMs = intervalForRange(rangeMs);

  const buckets = {};
  rows.forEach(row => {
    const key = Math.floor(row.timestamp / intervalMs) * intervalMs;
    (buckets[key] ??= []).push(row);
  });

  return Object.entries(buckets)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([ts, items]) => {
      const time     = new Date(Number(ts));
      const longRange = rangeMs >= 604_800_000;
      const label    = longRange
        ? time.toLocaleDateString('fr', { month: 'short', day: 'numeric' })
            + ' ' + time.toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' })
        : time.toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' });
      return { time: label, items };
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES VPS
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /api/vps — Ajouter un VPS (avec githubRepo et githubToken optionnels)
app.post('/api/vps', (req, res) => {
  const { id, name, host, username, password, port, githubRepo, githubToken } = req.body;
  if (!id || !host || !username || !password)
    return res.status(400).json({ error: 'Requis : id, host, username, password' });

  vpsStore[id] = {
    id,
    name:        name || id,
    host,
    port:        port || 22,
    username,
    password,
    githubRepo:  githubRepo  || null,
    githubToken: githubToken || null,
  };
  saveStore();
  Promise.all([collectMetrics(id), collectLatency(id)]);
  auditLog({ action: 'VPS added', category: 'vps', details: `${id} (${username}@${host})`, ip: getClientIp(req) });
  console.log(`✅ VPS "${id}" enregistré : ${username}@${host}${githubRepo ? ' | GitHub: ' + githubRepo : ''}`);
  res.json({ message: 'VPS ajouté', vps: { id, name, host } });
});

app.get('/api/vps', (req, res) => {
  res.json(Object.values(vpsStore).map(v => ({ id: v.id, name: v.name, host: v.host })));
});

app.delete('/api/vps/:id', (req, res) => {
  if (!vpsStore[req.params.id]) return res.status(404).json({ error: 'VPS introuvable' });
  auditLog({ action: 'VPS removed', category: 'vps', details: req.params.id, ip: getClientIp(req) });
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
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
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

    const ps = psRaw.split('\n').filter(Boolean).map(line => {
      const idx = line.indexOf('|');
      return { name: line.slice(0, idx).trim(), status: line.slice(idx + 1).trim() };
    });

    const containers = statsRaw.split('\n').filter(Boolean).map(line => {
      const [name, cpu, mem, memPerc] = line.split('|').map(s => s.trim());
      return { name, cpu, mem, memPerc, status: ps.find(p => p.name === name)?.status || 'unknown' };
    });

    res.json({ vps: { id: vps.id, name: vps.name, host: vps.host }, containers, ps, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// HISTORIQUE CPU
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/history/:id/cpu', (req, res) => {
  const { id }  = req.params;
  const rangeMs = rangeToMs(req.query.range || '24h');
  const since   = Date.now() - rangeMs;

  const rows = db.prepare(`
    SELECT timestamp, container, cpu
    FROM   metrics
    WHERE  vps_id = ? AND timestamp >= ?
    ORDER  BY timestamp ASC
  `).all(id, since);

  if (!rows.length) return res.json({ points: [], containers: [] });

  const shortName  = s => s.replace(/mypresc-(staging|production|dev)-/, '');
  const containers = [...new Set(rows.map(r => r.container))];
  const grouped    = groupDataByInterval(rows, rangeMs);

  const points = grouped.map(({ time, items }) => {
    const point = { time };
    containers.forEach(c => {
      const cItems = items.filter(i => i.container === c);
      point[shortName(c)] = cItems.length
        ? Math.round(cItems.reduce((s, i) => s + i.cpu, 0) / cItems.length * 10) / 10
        : 0;
    });
    return point;
  });

  res.json({ points, containers: containers.map(shortName) });
});

// ══════════════════════════════════════════════════════════════════════════════
// HISTORIQUE MÉMOIRE
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/history/:id/memory', (req, res) => {
  const { id }  = req.params;
  const rangeMs = rangeToMs(req.query.range || '24h');
  const since   = Date.now() - rangeMs;

  const rows = db.prepare(`
    SELECT timestamp, SUM(mem_mb) AS total_mem
    FROM   metrics
    WHERE  vps_id = ? AND timestamp >= ?
    GROUP  BY timestamp
    ORDER  BY timestamp ASC
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
// HISTORIQUE LATENCE HTTP
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/history/:id/latency', (req, res) => {
  const { id }  = req.params;
  const rangeMs = rangeToMs(req.query.range || '24h');
  const since   = Date.now() - rangeMs;

  const rows = db.prepare(`
    SELECT timestamp, ms, status, ok
    FROM   latency_history
    WHERE  vps_id = ? AND timestamp >= ?
    ORDER  BY timestamp ASC
  `).all(id, since);

  if (!rows.length) return res.json({ points: [], avg: 0, p95: 0, uptime: 100 });

  const grouped = groupDataByInterval(rows, rangeMs);
  const points  = grouped.map(({ time, items }) => {
    const okItems = items.filter(i => i.ok);
    return {
      time,
      ms: okItems.length
        ? Math.round(okItems.reduce((s, i) => s + i.ms, 0) / okItems.length)
        : null,
      ok: okItems.length > 0,
    };
  });

  const allMs  = rows.filter(r => r.ok).map(r => r.ms).sort((a, b) => a - b);
  const avg    = allMs.length ? Math.round(allMs.reduce((s, v) => s + v, 0) / allMs.length) : 0;
  const p95    = allMs.length ? allMs[Math.floor(allMs.length * 0.95)] ?? 0 : 0;
  const uptime = rows.length  ? Math.round(rows.filter(r => r.ok).length / rows.length * 1000) / 10 : 100;

  res.json({ points, avg, p95, uptime });
});

// ══════════════════════════════════════════════════════════════════════════════
// LATENCE LIVE + historique 1h
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/response-time/:id', async (req, res) => {
  const vps = vpsStore[req.params.id];
  if (!vps) return res.status(404).json({ error: 'VPS non trouvé' });

  const [live, rows] = await Promise.all([
    pingHttp(vps.host),
    Promise.resolve(
      db.prepare(
        'SELECT timestamp, ms, ok FROM latency_history WHERE vps_id = ? AND timestamp >= ? ORDER BY timestamp ASC'
      ).all(req.params.id, Date.now() - 3_600_000)
    ),
  ]);

  insertLatency.run(req.params.id, Date.now(), `http://${vps.host}`, live.ms, live.status, live.ok);

  const allMs = rows.filter(r => r.ok).map(r => r.ms).sort((a, b) => a - b);
  const avg   = allMs.length ? Math.round(allMs.reduce((s, v) => s + v, 0) / allMs.length) : live.ms;
  const p95   = allMs.length ? allMs[Math.floor(allMs.length * 0.95)] ?? 0 : live.ms;

  const buckets = {};
  rows.forEach(r => {
    const d = new Date(r.timestamp);
    d.setSeconds(0, 0);
    d.setMinutes(Math.floor(d.getMinutes() / 5) * 5);
    const key = d.toISOString();
    (buckets[key] ??= []).push(r);
  });

  const points = Object.entries(buckets)
    .sort(([a], [b]) => new Date(a) - new Date(b))
    .map(([t, items]) => {
      const vals = items.filter(i => i.ok).map(i => i.ms).sort((a, b) => a - b);
      return {
        time: new Date(t).toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' }),
        avg:  vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null,
        p95:  vals.length ? vals[Math.floor(vals.length * 0.95)] ?? null : null,
      };
    });

  res.json({ current: live, avg, p95, points });
});

// ══════════════════════════════════════════════════════════════════════════════
// LOGS
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/logs/:id', async (req, res) => {
  const vps = vpsStore[req.params.id];
  if (!vps) return res.status(404).json({ error: 'VPS non trouvé' });
  const lines = parseInt(req.query.lines) || 50;
  try {
    const psRaw  = await runSSH(vps, "docker ps --format '{{.Names}}'");
    const names  = psRaw.split('\n').filter(Boolean);
    const results = await Promise.all(names.map(async name => {
      try {
        const raw = await runSSH(vps, `docker logs --tail ${lines} --timestamps ${name} 2>&1`);
        return raw.split('\n').filter(Boolean).map(line => {
          const m = line.match(/^(\S+)\s+(.+)$/);
          return {
            container: name,
            timestamp: m?.[1] || new Date().toISOString(),
            message:   m?.[2] || line,
            level:     detectLogLevel(m?.[2] || line),
          };
        });
      } catch { return []; }
    }));
    res.json({
      logs: results.flat()
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 200),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/logs/:id/:container', async (req, res) => {
  const vps = vpsStore[req.params.id];
  if (!vps) return res.status(404).json({ error: 'VPS non trouvé' });
  try {
    const raw  = await runSSH(vps, `docker logs --tail ${parseInt(req.query.lines) || 100} --timestamps ${req.params.container} 2>&1`);
    const logs = raw.split('\n').filter(Boolean).map(line => {
      const m = line.match(/^(\S+)\s+(.+)$/);
      return {
        container: req.params.container,
        timestamp: m?.[1] || new Date().toISOString(),
        message:   m?.[2] || line,
        level:     detectLogLevel(m?.[2] || line),
      };
    });
    res.json({ logs, container: req.params.container });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
      const [name, cpu, mem, memPerc] = line.split('|').map(s => s.trim());
      return { name, cpu, mem, memPerc };
    });
    const ps = psRaw.split('\n').filter(Boolean).map(line => {
      const idx = line.indexOf('|');
      return { name: line.slice(0, idx).trim(), status: line.slice(idx + 1).trim() };
    });

    const alerts = [];
    const now    = new Date().toISOString();
    const short  = s => s.replace(/mypresc-(staging|production|dev)-/, '');

    containers.forEach(c => {
      const s       = short(c.name);
      const cpu     = parseCpu(c.cpu);
      const mem     = parseCpu(c.memPerc);
      const memUsed = c.mem.split('/')[0].trim();

      if      (cpu > 80) alerts.push({ id: `cpu-c-${c.name}`, type: 'critical', title: `${s} CPU Critical`,    message: `CPU at ${cpu.toFixed(1)}%`,                 container: s, value: cpu, timestamp: now });
      else if (cpu > 50) alerts.push({ id: `cpu-w-${c.name}`, type: 'warning',  title: `${s} CPU High`,        message: `CPU at ${cpu.toFixed(1)}%`,                 container: s, value: cpu, timestamp: now });
      if      (mem > 85) alerts.push({ id: `mem-c-${c.name}`, type: 'critical', title: `${s} Memory Critical`, message: `Memory at ${mem.toFixed(1)}% (${memUsed})`, container: s, value: mem, timestamp: now });
      else if (mem > 70) alerts.push({ id: `mem-w-${c.name}`, type: 'warning',  title: `${s} Memory Warning`,  message: `Memory at ${mem.toFixed(1)}% (${memUsed})`, container: s, value: mem, timestamp: now });
    });

    ps.forEach(p => {
      if (!p.status.includes('Up')) {
        const s = short(p.name);
        alerts.push({ id: `down-${p.name}`, type: 'critical', title: `${s} Down`, message: `Status: ${p.status}`, container: s, value: 0, timestamp: now });
      }
    });

    res.json({
      alerts,
      count:     alerts.length,
      critical:  alerts.filter(a => a.type === 'critical').length,
      warning:   alerts.filter(a => a.type === 'warning').length,
      timestamp: now,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GITHUB ACTIONS — Routes Pipeline
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/pipeline/:id — Récupérer les runs GitHub Actions
app.get('/api/pipeline/:id', async (req, res) => {
  const vps = vpsStore[req.params.id];
  if (!vps) return res.status(404).json({ error: 'VPS introuvable' });
  if (!vps.githubRepo || !vps.githubToken)
    return res.status(400).json({ error: 'GitHub repo/token non configurés pour ce VPS' });

  try {
    const { default: fetch } = await import('node-fetch');
    const headers = {
      'Authorization': `Bearer ${vps.githubToken}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    // Récupérer les workflows disponibles
    const workflowsRes = await fetch(
      `https://api.github.com/repos/${vps.githubRepo}/actions/workflows`,
      { headers }
    );
    if (!workflowsRes.ok) throw new Error(`GitHub API: ${workflowsRes.status} — vérifiez repo/token`);
    const workflowsData = await workflowsRes.json();

    // Récupérer les derniers runs (toutes workflows confondus)
    const runsRes = await fetch(
      `https://api.github.com/repos/${vps.githubRepo}/actions/runs?per_page=10`,
      { headers }
    );
    const runsData = await runsRes.json();
    const runs = runsData.workflow_runs || [];

    // Récupérer les jobs du dernier run
    let jobs = [];
    if (runs.length > 0) {
      const jobsRes = await fetch(
        `https://api.github.com/repos/${vps.githubRepo}/actions/runs/${runs[0].id}/jobs`,
        { headers }
      );
      const jobsData = await jobsRes.json();
      jobs = jobsData.jobs || [];
    }

    // Stats globales
    const totalRuns    = runs.length;
    const successRuns  = runs.filter(r => r.conclusion === 'success').length;
    const successRate  = totalRuns ? Math.round((successRuns / totalRuns) * 100) : 0;
    const avgDuration  = runs
      .filter(r => r.run_started_at && r.updated_at && r.conclusion)
      .reduce((sum, r) => {
        const ms = new Date(r.updated_at) - new Date(r.run_started_at);
        return sum + ms;
      }, 0) / Math.max(1, runs.filter(r => r.conclusion).length);

    res.json({
      repo:         vps.githubRepo,
      workflows:    workflowsData.workflows || [],
      runs:         runs.map(r => ({
        id:          r.id,
        name:        r.name,
        status:      r.status,
        conclusion:  r.conclusion,
        branch:      r.head_branch,
        commit:      r.head_sha?.slice(0, 7),
        commitMsg:   r.head_commit?.message?.split('\n')[0] || '',
        actor:       r.actor?.login || '',
        createdAt:   r.created_at,
        updatedAt:   r.updated_at,
        duration:    r.run_started_at && r.updated_at
          ? Math.round((new Date(r.updated_at) - new Date(r.run_started_at)) / 1000)
          : 0,
        url:         r.html_url,
      })),
      jobs:         jobs.map(j => ({
        id:          j.id,
        name:        j.name,
        status:      j.status,
        conclusion:  j.conclusion,
        startedAt:   j.started_at,
        completedAt: j.completed_at,
        duration:    j.started_at && j.completed_at
          ? Math.round((new Date(j.completed_at) - new Date(j.started_at)) / 1000)
          : 0,
        steps:       (j.steps || []).map(s => ({
          name:       s.name,
          status:     s.status,
          conclusion: s.conclusion,
          number:     s.number,
          duration:   s.started_at && s.completed_at
            ? Math.round((new Date(s.completed_at) - new Date(s.started_at)) / 1000)
            : 0,
        })),
      })),
      stats: {
        totalRuns,
        successRuns,
        successRate,
        avgDurationSec: Math.round(avgDuration / 1000),
      },
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error(`[pipeline/${req.params.id}]`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pipeline/:id/trigger — Déclencher un workflow manuellement
app.post('/api/pipeline/:id/trigger', async (req, res) => {
  const vps = vpsStore[req.params.id];
  if (!vps) return res.status(404).json({ error: 'VPS introuvable' });
  if (!vps.githubRepo || !vps.githubToken)
    return res.status(400).json({ error: 'GitHub repo/token non configurés' });

  const { workflow, branch = 'main', inputs = {} } = req.body;
  if (!workflow) return res.status(400).json({ error: 'workflow requis (ex: deploy.yml)' });

  try {
    const { default: fetch } = await import('node-fetch');
    const r = await fetch(
      `https://api.github.com/repos/${vps.githubRepo}/actions/workflows/${workflow}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vps.githubToken}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ ref: branch, inputs }),
      }
    );

    if (r.status === 204) {
      auditLog({ action: 'Pipeline triggered', category: 'pipeline', details: `${vps.githubRepo} — ${workflow} on ${branch}`, ip: getClientIp(req) });
      res.json({ ok: true, message: `Workflow ${workflow} déclenché sur ${branch}` });
    } else {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.message || `GitHub API: ${r.status}`);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pipeline/:id/rerun/:runId — Relancer un run
app.post('/api/pipeline/:id/rerun/:runId', async (req, res) => {
  const vps = vpsStore[req.params.id];
  if (!vps) return res.status(404).json({ error: 'VPS introuvable' });

  try {
    const { default: fetch } = await import('node-fetch');
    const r = await fetch(
      `https://api.github.com/repos/${vps.githubRepo}/actions/runs/${req.params.runId}/rerun`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vps.githubToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );
    if (r.status === 201) {
      auditLog({ action: 'Pipeline rerun', category: 'pipeline', details: `run ${req.params.runId}`, ip: getClientIp(req) });
      res.json({ ok: true });
    } else {
      throw new Error(`GitHub API: ${r.status}`);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// WEBSOCKET TERMINAL SSH
// ══════════════════════════════════════════════════════════════════════════════
const wssById = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const match = request.url.match(/^\/terminal\/(.+)$/);
  if (match) {
    wssById.handleUpgrade(request, socket, head, ws => wssById.emit('connection', ws, request, match[1]));
  } else {
    socket.destroy();
  }
});

wssById.on('connection', (ws, _request, vpsId) => {
  const vps = vpsStore[vpsId];
  if (!vps) {
    ws.send(JSON.stringify({ type: 'error', data: `VPS "${vpsId}" introuvable` }));
    ws.close();
    return;
  }

  console.log(`🔌 Terminal SSH → ${vps.username}@${vps.host}`);
  auditLog({ action: 'SSH terminal opened', category: 'ssh', details: `VPS: ${vpsId}` });

  const conn = new Client();
  let stream = null;

  conn.on('ready', () => {
    conn.shell({ term: 'xterm-256color', cols: 220, rows: 50 }, (err, s) => {
      if (err) {
        ws.send(JSON.stringify({ type: 'error', data: err.message }));
        ws.close();
        return;
      }
      stream = s;
      stream.on('data',        d => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'data', data: d.toString() })); });
      stream.stderr.on('data', d => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'data', data: d.toString() })); });
      stream.on('close', () => { conn.end(); if (ws.readyState === ws.OPEN) ws.close(); });
    });
  });

  conn.on('error', err => {
    auditLog({ action: 'SSH terminal error', category: 'ssh', details: err.message, success: 0 });
    ws.send(JSON.stringify({ type: 'error', data: `SSH: ${err.message}` }));
    ws.close();
  });

  ws.on('message', msg => {
    try {
      const data = JSON.parse(msg.toString());
      if (!stream) return;
      if      (data.type === 'input')  stream.write(data.data);
      else if (data.type === 'resize') stream.setWindow(data.rows, data.cols, 0, 0);
    } catch { /* JSON malformé, on ignore */ }
  });

  ws.on('close', () => { stream?.close(); conn.end(); });

  conn.connect({
    host:         vps.host,
    port:         vps.port || 22,
    username:     vps.username,
    password:     vps.password,
    readyTimeout: 15_000,
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SETTINGS — Persistence in settings.json
// ══════════════════════════════════════════════════════════════════════════════
const SETTINGS_FILE = './settings.json';
const crypto = require('crypto');

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[settings] Failed to load settings.json:', e.message);
  }
  return defaultSettings();
}

function defaultSettings() {
  return {
    discordWebhook: '',
    slackWebhook:   '',
    notifyDeploy:   true,
    notifyFailure:  true,
    notifyRollback: true,
    apiToken:       crypto.randomBytes(32).toString('hex'),
    sshAccess:      true,
  };
}

function saveSettings(s) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
  } catch (e) {
    console.error('[settings] Failed to write settings.json:', e.message);
    throw e;
  }
}

let appSettings = loadSettings();

// ── GET /api/settings ─────────────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  res.json({
    discordWebhook: appSettings.discordWebhook ? '***' : '',
    slackWebhook:   appSettings.slackWebhook   ? '***' : '',
    notifyDeploy:   appSettings.notifyDeploy,
    notifyFailure:  appSettings.notifyFailure,
    notifyRollback: appSettings.notifyRollback,
    apiToken:       appSettings.apiToken,
    sshAccess:      appSettings.sshAccess,
  });
});

// ── POST /api/settings ────────────────────────────────────────────────────
app.post('/api/settings', (req, res) => {
  try {
    const { discordWebhook, slackWebhook, notifyDeploy, notifyFailure, notifyRollback, sshAccess } = req.body;
    const changes = [];

    if (discordWebhook && discordWebhook !== '***') {
      appSettings.discordWebhook = discordWebhook;
      changes.push('Discord webhook updated');
    }
    if (slackWebhook && slackWebhook !== '***') {
      appSettings.slackWebhook = slackWebhook;
      changes.push('Slack webhook updated');
    }

    if (notifyDeploy   !== undefined) {
      if (appSettings.notifyDeploy !== Boolean(notifyDeploy)) changes.push(`notifyDeploy → ${notifyDeploy}`);
      appSettings.notifyDeploy   = Boolean(notifyDeploy);
    }
    if (notifyFailure  !== undefined) {
      if (appSettings.notifyFailure !== Boolean(notifyFailure)) changes.push(`notifyFailure → ${notifyFailure}`);
      appSettings.notifyFailure  = Boolean(notifyFailure);
    }
    if (notifyRollback !== undefined) {
      if (appSettings.notifyRollback !== Boolean(notifyRollback)) changes.push(`notifyRollback → ${notifyRollback}`);
      appSettings.notifyRollback = Boolean(notifyRollback);
    }
    if (sshAccess      !== undefined) {
      if (appSettings.sshAccess !== Boolean(sshAccess)) changes.push(`sshAccess → ${sshAccess}`);
      appSettings.sshAccess      = Boolean(sshAccess);
    }

    saveSettings(appSettings);

    auditLog({
      action:  'Settings saved',
      category: 'settings',
      details:  changes.length ? changes.join(', ') : 'no changes',
      ip:       getClientIp(req),
    });

    console.log('[settings] ✅ Settings saved');
    res.json({ ok: true });
  } catch (e) {
    auditLog({ action: 'Settings save failed', category: 'settings', details: e.message, ip: getClientIp(req), success: 0 });
    console.error('[settings] Save error:', e.message);
    res.status(500).json({ ok: false, error: 'Failed to save settings' });
  }
});

// ── POST /api/settings/test-discord ──────────────────────────────────────
app.post('/api/settings/test-discord', async (req, res) => {
  const webhook = (req.body.webhook && req.body.webhook !== '***')
    ? req.body.webhook
    : appSettings.discordWebhook;

  if (!webhook) {
    return res.status(400).json({ ok: false, error: 'Discord webhook not configured' });
  }

  try {
    const { default: fetch } = await import('node-fetch');
    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: '✅ MyPresc Deploy — Test Notification',
          description: 'Discord webhook connected successfully!',
          color: 0x06b6d4,
          timestamp: new Date().toISOString(),
          footer: { text: 'MyPresc Deploy' },
        }],
      }),
    });

    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new Error(`Discord returned ${r.status}: ${text}`);
    }

    auditLog({ action: 'Discord test sent', category: 'integration', ip: getClientIp(req) });
    console.log('[settings] ✅ Discord test message sent');
    res.json({ ok: true, message: 'Message sent to Discord!' });
  } catch (err) {
    auditLog({ action: 'Discord test failed', category: 'integration', details: err.message, ip: getClientIp(req), success: 0 });
    console.error('[settings] Discord test error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/settings/test-slack ────────────────────────────────────────
app.post('/api/settings/test-slack', async (req, res) => {
  const webhook = (req.body.webhook && req.body.webhook !== '***')
    ? req.body.webhook
    : appSettings.slackWebhook;

  if (!webhook) {
    return res.status(400).json({ ok: false, error: 'Slack webhook not configured' });
  }

  try {
    const { default: fetch } = await import('node-fetch');
    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: '✅ *MyPresc Deploy* — Test notification',
        attachments: [{
          color: '#06b6d4',
          text: 'Slack webhook connected successfully!',
          footer: 'MyPresc Deploy',
          ts: Math.floor(Date.now() / 1000),
        }],
      }),
    });

    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new Error(`Slack returned ${r.status}: ${text}`);
    }

    auditLog({ action: 'Slack test sent', category: 'integration', ip: getClientIp(req) });
    console.log('[settings] ✅ Slack test message sent');
    res.json({ ok: true, message: 'Message sent to Slack!' });
  } catch (err) {
    auditLog({ action: 'Slack test failed', category: 'integration', details: err.message, ip: getClientIp(req), success: 0 });
    console.error('[settings] Slack test error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/settings/regenerate-token ──────────────────────────────────
app.post('/api/settings/regenerate-token', (req, res) => {
  try {
    appSettings.apiToken = crypto.randomBytes(32).toString('hex');
    saveSettings(appSettings);
    auditLog({ action: 'API token regenerated', category: 'security', ip: getClientIp(req) });
    console.log('[settings] ✅ API token regenerated');
    res.json({ ok: true, token: appSettings.apiToken });
  } catch (e) {
    auditLog({ action: 'API token regen failed', category: 'security', details: e.message, ip: getClientIp(req), success: 0 });
    console.error('[settings] Regen token error:', e.message);
    res.status(500).json({ ok: false, error: 'Failed to regenerate token' });
  }
});

// ── POST /api/settings/reset ──────────────────────────────────────────────
app.post('/api/settings/reset', (req, res) => {
  try {
    appSettings = defaultSettings();
    saveSettings(appSettings);
    auditLog({ action: 'Settings reset to defaults', category: 'security', ip: getClientIp(req) });
    console.log('[settings] ✅ Settings reset to defaults');
    res.json({ ok: true });
  } catch (e) {
    auditLog({ action: 'Settings reset failed', category: 'security', details: e.message, ip: getClientIp(req), success: 0 });
    console.error('[settings] Reset error:', e.message);
    res.status(500).json({ ok: false, error: 'Failed to reset settings' });
  }
});

// ── GET /api/settings/audit-log ───────────────────────────────────────────
app.get('/api/settings/audit-log', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);

  const rows = db.prepare(`
    SELECT id, timestamp, action, category, details, ip, success
    FROM   audit_log
    ORDER  BY timestamp DESC
    LIMIT  ?
  `).all(limit);

  const now = Date.now();
  const entries = rows.map(r => {
    const diffMs  = now - r.timestamp;
    const diffMin = Math.floor(diffMs / 60_000);
    const diffH   = Math.floor(diffMs / 3_600_000);
    const diffD   = Math.floor(diffMs / 86_400_000);

    let timeAgo;
    if (diffMin < 1)       timeAgo = 'just now';
    else if (diffMin < 60) timeAgo = `${diffMin} min${diffMin > 1 ? 's' : ''} ago`;
    else if (diffH   < 24) timeAgo = `${diffH} hour${diffH   > 1 ? 's' : ''} ago`;
    else                   timeAgo = `${diffD} day${diffD    > 1 ? 's' : ''} ago`;

    return { ...r, timeAgo };
  });

  res.json({ entries, total: entries.length });
});

// ── sendNotification ──────────────────────────────────────────────────────
async function sendNotification(type, message) {
  const key = `notify${type}`;
  if (!appSettings[key]) return;

  let fetch;
  try {
    ({ default: fetch } = await import('node-fetch'));
  } catch {
    console.warn('[sendNotification] node-fetch not available');
    return;
  }

  const color = type === 'Failure' ? 0xef4444 : 0x10b981;

  if (appSettings.discordWebhook) {
    fetch(appSettings.discordWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: `MyPresc Deploy — ${type}`,
          description: message,
          color,
          timestamp: new Date().toISOString(),
        }],
      }),
    }).catch(err => console.error('[sendNotification] Discord error:', err.message));
  }

  if (appSettings.slackWebhook) {
    fetch(appSettings.slackWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `*MyPresc Deploy — ${type}*\n${message}` }),
    }).catch(err => console.error('[sendNotification] Slack error:', err.message));
  }
}

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
  console.log(`📋 Audit log          → /api/settings/audit-log`);
  console.log(`   Collecte toutes les 30s — historique 31 jours\n`);
});