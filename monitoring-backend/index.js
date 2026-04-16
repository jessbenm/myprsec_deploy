const express    = require('express');
const cors       = require('cors');
const { Client } = require('ssh2');
const fs         = require('fs');
const http       = require('http');
const { WebSocketServer } = require('ws');
const Database   = require('better-sqlite3');
const crypto     = require('crypto');
require('dotenv').config();

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// ══════════════════════════════════════════════════════════════════════════════
// VPS STORE  —  structure UNIQUE : vpsStore[id] = { ... }
// ══════════════════════════════════════════════════════════════════════════════
const VPS_FILE = './vps-store.json';

function loadStore() {
  try {
    if (fs.existsSync(VPS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(VPS_FILE, 'utf8'));
      // Compatibilité : ancienne structure { vps: { id: {...} } }
      if (raw && raw.vps && typeof raw.vps === 'object') {
        console.warn('⚠️  Migration vps-store.json : ancienne structure détectée, conversion...');
        return raw.vps;
      }
      return raw;
    }
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
db.pragma('foreign_keys = ON');

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

  CREATE TABLE IF NOT EXISTS auth_users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    password_salt TEXT    NOT NULL,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users(email);

  CREATE TABLE IF NOT EXISTS auth_sessions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    token         TEXT    NOT NULL UNIQUE,
    expires_at    INTEGER NOT NULL,
    created_at    INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token);
  CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);
`);

const insertAuthUser = db.prepare(`
  INSERT INTO auth_users (name, email, password_hash, password_salt, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const selectAuthUserByEmail = db.prepare(`
  SELECT id, name, email, password_hash, password_salt, created_at, updated_at
  FROM auth_users
  WHERE email = ?
`);
const selectAuthUserById = db.prepare(`
  SELECT id, name, email, created_at, updated_at
  FROM auth_users
  WHERE id = ?
`);
const updateAuthUserPassword = db.prepare(`
  UPDATE auth_users
  SET password_hash = ?, password_salt = ?, updated_at = ?
  WHERE id = ?
`);
const deleteAuthUser = db.prepare('DELETE FROM auth_users WHERE id = ?');
const insertAuthSession = db.prepare(`
  INSERT INTO auth_sessions (user_id, token, expires_at, created_at)
  VALUES (?, ?, ?, ?)
`);
const selectAuthSession = db.prepare(`
  SELECT s.id, s.user_id, s.token, s.expires_at, u.name, u.email, u.created_at, u.updated_at
  FROM auth_sessions s
  JOIN auth_users u ON u.id = s.user_id
  WHERE s.token = ?
`);
const deleteAuthSessionByToken = db.prepare('DELETE FROM auth_sessions WHERE token = ?');
const deleteExpiredAuthSessions = db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?');

function cleanupExpiredAuthSessions() {
  try {
    deleteExpiredAuthSessions.run(Date.now());
  } catch (error) {
    console.error('[auth] cleanup failed:', error.message);
  }
}

cleanupExpiredAuthSessions();
setInterval(cleanupExpiredAuthSessions, 60 * 60 * 1000);

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

function createAuthToken() {
  return crypto.randomBytes(32).toString('hex');
}

function setAuthCookie(res, token) {
  const cookieParts = [
    `mp_session=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
  ];
  if (process.env.NODE_ENV === 'production') cookieParts.push('Secure');
  cookieParts.push(`Max-Age=${60 * 60 * 24}`);
  res.setHeader('Set-Cookie', cookieParts.join('; '));
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', 'mp_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rawValue.join('='));
    return acc;
  }, {});
}

function getSessionUser(req) {
  const cookies = parseCookies(req);
  const token = cookies.mp_session;
  if (!token) return null;

  const session = selectAuthSession.get(token);
  if (!session) return null;
  if (session.expires_at < Date.now()) {
    deleteAuthSessionByToken.run(token);
    return null;
  }

  return {
    sessionId: session.id,
    token: session.token,
    user: {
      id: session.user_id,
      name: session.name,
      email: session.email,
      created_at: session.created_at,
      updated_at: session.updated_at,
    },
  };
}

function requireAuth(req, res, next) {
  const session = getSessionUser(req);
  if (!session) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  req.authSession = session;
  next();
}

app.post('/api/auth/signup', (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body || {};

    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({ success: false, error: 'name, email, password and confirmPassword are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const trimmedName = String(name).trim();
    const strongPassword = String(password);

    if (strongPassword.length < 10) {
      return res.status(400).json({ success: false, error: 'Password must be at least 10 characters long' });
    }

    if (strongPassword !== String(confirmPassword)) {
      return res.status(400).json({ success: false, error: 'Passwords do not match' });
    }

    const existingUser = selectAuthUserByEmail.get(normalizedEmail);
    if (existingUser) {
      return res.status(409).json({ success: false, error: 'This email is already registered' });
    }

    const { salt, hash } = hashPassword(strongPassword);
    const now = Date.now();
    const result = insertAuthUser.run(trimmedName, normalizedEmail, hash, salt, now, now);
    const newUser = selectAuthUserById.get(result.lastInsertRowid);

    const token = createAuthToken();
    insertAuthSession.run(newUser.id, token, now + 24 * 60 * 60 * 1000, now);
    setAuthCookie(res, token);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: { user: newUser },
    });
  } catch (error) {
    console.error('[auth/signup]', error);
    return res.status(500).json({ success: false, error: 'Failed to create account' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'email and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = selectAuthUserByEmail.get(normalizedEmail);

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const ok = verifyPassword(String(password), user.password_salt, user.password_hash);
    if (!ok) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = createAuthToken();
    const now = Date.now();
    insertAuthSession.run(user.id, token, now + 24 * 60 * 60 * 1000, now);
    setAuthCookie(res, token);

    return res.json({
      success: true,
      message: 'Login successful',
      data: { user: { id: user.id, name: user.name, email: user.email, created_at: user.created_at, updated_at: user.updated_at } },
    });
  } catch (error) {
    console.error('[auth/login]', error);
    return res.status(500).json({ success: false, error: 'Failed to login' });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  return res.json({ success: true, data: { user: req.authSession.user } });
});

app.post('/api/auth/logout', (req, res) => {
  try {
    const cookies = parseCookies(req);
    const token = cookies.mp_session;
    if (token) deleteAuthSessionByToken.run(token);
    clearAuthCookie(res);
    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('[auth/logout]', error);
    return res.status(500).json({ success: false, error: 'Failed to logout' });
  }
});

function cleanOldData() {
  const cutoff      = Date.now() - 31 * 24 * 60 * 60 * 1000;
  const auditCutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  db.prepare('DELETE FROM metrics          WHERE timestamp < ?').run(cutoff);
  db.prepare('DELETE FROM vps_snapshots    WHERE timestamp < ?').run(cutoff);
  db.prepare('DELETE FROM latency_history  WHERE timestamp < ?').run(cutoff);
  db.prepare('DELETE FROM audit_log        WHERE timestamp < ?').run(auditCutoff);
}
setInterval(cleanOldData, 60 * 60 * 1000);
cleanOldData();

// ══════════════════════════════════════════════════════════════════════════════
// AUDIT LOG
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
// HELPER — Nettoyer URL GitHub → "owner/repo"
// ══════════════════════════════════════════════════════════════════════════════
function cleanGithubRepo(repo) {
  if (!repo || !repo.trim()) return null;
  const match = repo.trim().match(/github\.com\/([^\/]+\/[^\/]+?)(?:\.git)?(?:\/.*)?$/);
  return match ? match[1] : repo.trim();
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
// PING HTTP
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

// ══════════════════════════════════════════════════════════════════════════════
// COLLECTE LATENCE  —  structure unique : vpsStore[vpsId]
// ══════════════════════════════════════════════════════════════════════════════
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
// COLLECTE MÉTRIQUES DOCKER  —  structure unique : vpsStore[vpsId]
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
    // Silencieux — VPS peut être temporairement inaccessible
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
setInterval(collectAll, 2 * 60 * 1000); 

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
      const time      = new Date(Number(ts));
      const longRange = rangeMs >= 604_800_000;
      const label     = longRange
        ? time.toLocaleDateString('fr', { month: 'short', day: 'numeric' })
            + ' ' + time.toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' })
        : time.toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' });
      return { time: label, items };
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES VPS
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /api/vps ─────────────────────────────────────────────────────────────
app.post('/api/vps', (req, res) => {
  const { id, name, host, username, password, port, githubRepo, githubToken } = req.body;
  if (!id || !host || !username || !password)
    return res.status(400).json({ error: 'Requis : id, host, username, password' });

  const cleanRepo = cleanGithubRepo(githubRepo);

  vpsStore[id] = {
    id,
    name:        name || id,
    host,
    port:        port || 22,
    username,
    password,
    githubRepo:  cleanRepo,
    githubToken: githubToken || null,
  };
  saveStore();
  Promise.all([collectMetrics(id), collectLatency(id)]);
  auditLog({
    action:   'VPS added',
    category: 'vps',
    details:  `${id} (${username}@${host})${cleanRepo ? ' | GitHub: ' + cleanRepo : ''}`,
    ip:       getClientIp(req),
  });
  console.log(`✅ VPS "${id}" enregistré : ${username}@${host}${cleanRepo ? ' | GitHub: ' + cleanRepo : ''}`);
  res.json({ message: 'VPS ajouté', vps: { id, name, host } });
});

// ── GET /api/vps ──────────────────────────────────────────────────────────────
app.get('/api/vps', (req, res) => {
  res.json(Object.values(vpsStore).map(v => ({ id: v.id, name: v.name, host: v.host })));
});

// ── DELETE /api/vps/:id ───────────────────────────────────────────────────────
app.delete('/api/vps/:id', (req, res) => {
  if (!vpsStore[req.params.id]) return res.status(404).json({ error: 'VPS introuvable' });
  auditLog({ action: 'VPS removed', category: 'vps', details: req.params.id, ip: getClientIp(req) });
  delete vpsStore[req.params.id];
  saveStore();
  res.json({ ok: true });
});

// ── POST /api/vps/:id/test ────────────────────────────────────────────────────
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

    res.json({
      vps:       { id: vps.id, name: vps.name, host: vps.host },
      containers,
      ps,
      timestamp: new Date().toISOString(),
    });
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
// LATENCE LIVE
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
app.get('/api/pipeline/:id', async (req, res) => {
  const vps = vpsStore[req.params.id];
  if (!vps) return res.status(404).json({ error: 'VPS introuvable' });
  if (!vps.githubRepo || !vps.githubToken)
    return res.status(400).json({ error: 'GitHub repo/token non configurés pour ce VPS' });

  try {
    const { default: fetch } = await import('node-fetch');
    const headers = {
      'Authorization':        `Bearer ${vps.githubToken}`,
      'Accept':               'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    const workflowsRes = await fetch(
      `https://api.github.com/repos/${vps.githubRepo}/actions/workflows`,
      { headers }
    );
    if (!workflowsRes.ok) throw new Error(`GitHub API: ${workflowsRes.status} — vérifiez repo/token`);
    const workflowsData = await workflowsRes.json();

    const runsRes  = await fetch(
      `https://api.github.com/repos/${vps.githubRepo}/actions/runs?per_page=10`,
      { headers }
    );
    const runsData = await runsRes.json();
    const runs     = runsData.workflow_runs || [];

    let jobs = [];
    if (runs.length > 0) {
      const jobsRes  = await fetch(
        `https://api.github.com/repos/${vps.githubRepo}/actions/runs/${runs[0].id}/jobs`,
        { headers }
      );
      const jobsData = await jobsRes.json();
      jobs           = jobsData.jobs || [];
    }

    const totalRuns   = runs.length;
    const successRuns = runs.filter(r => r.conclusion === 'success').length;
    const successRate = totalRuns ? Math.round((successRuns / totalRuns) * 100) : 0;
    const avgDuration = runs
      .filter(r => r.run_started_at && r.updated_at && r.conclusion)
      .reduce((sum, r) => sum + (new Date(r.updated_at) - new Date(r.run_started_at)), 0)
      / Math.max(1, runs.filter(r => r.conclusion).length);

    res.json({
      repo:      vps.githubRepo,
      workflows: workflowsData.workflows || [],
      runs:      runs.map(r => ({
        id:        r.id,
        name:      r.name,
        status:    r.status,
        conclusion:r.conclusion,
        branch:    r.head_branch,
        commit:    r.head_sha?.slice(0, 7),
        commitMsg: r.head_commit?.message?.split('\n')[0] || '',
        actor:     r.actor?.login || '',
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        duration:  r.run_started_at && r.updated_at
          ? Math.round((new Date(r.updated_at) - new Date(r.run_started_at)) / 1000)
          : 0,
        url:       r.html_url,
      })),
      jobs: jobs.map(j => ({
        id:          j.id,
        name:        j.name,
        status:      j.status,
        conclusion:  j.conclusion,
        startedAt:   j.started_at,
        completedAt: j.completed_at,
        duration:    j.started_at && j.completed_at
          ? Math.round((new Date(j.completed_at) - new Date(j.started_at)) / 1000)
          : 0,
        steps: (j.steps || []).map(s => ({
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
        method:  'POST',
        headers: {
          'Authorization':        `Bearer ${vps.githubToken}`,
          'Accept':               'application/vnd.github+json',
          'Content-Type':         'application/json',
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

app.post('/api/pipeline/:id/rerun/:runId', async (req, res) => {
  const vps = vpsStore[req.params.id];
  if (!vps) return res.status(404).json({ error: 'VPS introuvable' });

  try {
    const { default: fetch } = await import('node-fetch');
    const r = await fetch(
      `https://api.github.com/repos/${vps.githubRepo}/actions/runs/${req.params.runId}/rerun`,
      {
        method:  'POST',
        headers: {
          'Authorization':        `Bearer ${vps.githubToken}`,
          'Accept':               'application/vnd.github+json',
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
    } catch { }
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

// ...existing code...

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

server.listen(PORT, () => {
  console.log(`✅ Backend en écoute sur http://localhost:${PORT}`);
});