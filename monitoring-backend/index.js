'use strict';
const express             = require('express');
const cors                = require('cors');
const { Client }          = require('ssh2');
const fs                  = require('fs');
const path                = require('path');
const http                = require('http');
const { WebSocketServer } = require('ws');
const Database            = require('better-sqlite3');
const crypto              = require('crypto');
const { createClient }    = require('redis');
require('dotenv').config();

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 1 — ENV VALIDATION
// Refuse to start if ENCRYPTION_KEY is missing or wrong length.
// ══════════════════════════════════════════════════════════════════════════════
const REQUIRED_ENV = ['ENCRYPTION_KEY'];
const missingEnv   = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length) {
  console.error(`\n❌  Missing required environment variables: ${missingEnv.join(', ')}`);
  console.error('    Copy .env.example to .env and fill in all values.\n');
  process.exit(1);
}
if (Buffer.from(process.env.ENCRYPTION_KEY, 'hex').length !== 32) {
  console.error('\n❌  ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes).\n');
  process.exit(1);
}

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3001;
const REDIS_URL = process.env.REDIS_URL || '';

const redisClient = REDIS_URL ? createClient({ url: REDIS_URL }) : null;
if (redisClient) {
  redisClient.on('error', err => console.error('[redis]', err.message));
}

const defaultOrigins = [
  process.env.FRONTEND_URL,
  process.env.CORS_ORIGIN,
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : []),
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
];
const allowedOrigins = new Set(
  defaultOrigins
    .map(origin => origin && origin.trim())
    .filter(Boolean)
    .map(origin => origin.replace(/\/$/, ''))
);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const normalizedOrigin = origin.replace(/\/$/, '');
    if (allowedOrigins.has(normalizedOrigin)) return callback(null, true);
    return callback(new Error(`Not allowed by CORS: ${origin}`), false);
  },
  credentials: true,
}));
app.use(express.json());

app.get('/', (_req, res) => {
  res.status(200).send('MyPresc Deploy backend is running. Use /api/health for health checks.');
});

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 1 — AES-256-GCM ENCRYPTION
// Used for: ssh_password, github_token, api_token stored in DB.
// Format stored in DB: <ivHex>:<authTagHex>:<ciphertextHex>
// ══════════════════════════════════════════════════════════════════════════════
const ENC_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

function encrypt(text) {
  if (!text) return '';
  const iv        = crypto.randomBytes(12);
  const cipher    = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const authTag   = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(stored) {
  if (!stored) return '';
  try {
    const [ivHex, authTagHex, encHex] = stored.split(':');
    const iv        = Buffer.from(ivHex, 'hex');
    const authTag   = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encHex, 'hex');
    const decipher  = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — DATABASE SETUP
// ══════════════════════════════════════════════════════════════════════════════
const preferredDatabasePath = process.env.DATABASE_PATH || (process.env.RENDER ? '/data/metrics-history.db' : './metrics-history.db');
const preferredDatabaseDir = path.dirname(preferredDatabasePath);
const databasePath = (preferredDatabaseDir && preferredDatabaseDir !== '.' && fs.existsSync(preferredDatabaseDir))
  ? preferredDatabasePath
  : path.resolve(process.env.RENDER ? '/tmp/metrics-history.db' : './metrics-history.db');

if (process.env.RENDER && databasePath !== preferredDatabasePath) {
  console.warn(`[db] ${preferredDatabasePath} is unavailable, falling back to ${databasePath}`);
}

const db = new Database(databasePath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// ── Helpers for schema detection ──────────────────────────────────────────────
function tableExists(name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
}
function hasColumn(table, col) {
  try { return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col); }
  catch { return false; }
}

// ── Rename old-schema tables before creating new ones ─────────────────────────
// Old metrics/snapshots/latency have vps_id TEXT, no user_id — incompatible.
['metrics', 'vps_snapshots', 'latency_history'].forEach(t => {
  if (tableExists(t) && !hasColumn(t, 'user_id')) {
    db.exec(`ALTER TABLE ${t} RENAME TO _legacy_${t}`);
    console.log(`📦 Renamed legacy table: ${t} → _legacy_${t}`);
  }
});
// Old audit_log has no user_id column.
if (tableExists('audit_log') && !hasColumn('audit_log', 'user_id')) {
  db.exec(`ALTER TABLE audit_log RENAME TO _legacy_audit_log`);
  console.log('📦 Renamed legacy table: audit_log → _legacy_audit_log');
}

// ── Create all target tables ───────────────────────────────────────────────────
db.exec(`
  -- ── users (replaces auth_users) ─────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    password_salt TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'user',
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    deleted_at    INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

  -- ── user_sessions (replaces auth_sessions) ───────────────────────────────────
  CREATE TABLE IF NOT EXISTS user_sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    token      TEXT    NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    ip_address TEXT    NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_user_sessions_token      ON user_sessions(token);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id    ON user_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

  -- ── vps (replaces vps-store.json) ────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS vps (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    slug         TEXT    NOT NULL,
    name         TEXT    NOT NULL,
    host         TEXT    NOT NULL,
    port         INTEGER NOT NULL DEFAULT 22,
    username     TEXT    NOT NULL,
    ssh_password TEXT    NOT NULL,
    status       TEXT    NOT NULL DEFAULT 'unknown',
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    deleted_at   INTEGER,
    UNIQUE (user_id, slug),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_vps_user_id ON vps(user_id);
  CREATE INDEX IF NOT EXISTS idx_vps_slug    ON vps(slug);

  -- ── vps_github_integrations ───────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS vps_github_integrations (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    vps_id       INTEGER NOT NULL UNIQUE,
    user_id      INTEGER NOT NULL,
    github_repo  TEXT    NOT NULL,
    github_token TEXT    NOT NULL,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    FOREIGN KEY (vps_id)  REFERENCES vps(id)   ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_vps_github_vps_id ON vps_github_integrations(vps_id);

  -- ── metrics ───────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS metrics (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    vps_id    INTEGER NOT NULL,
    user_id   INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    container TEXT    NOT NULL,
    cpu       REAL    NOT NULL DEFAULT 0,
    mem_mb    REAL    NOT NULL DEFAULT 0,
    mem_perc  REAL    NOT NULL DEFAULT 0,
    FOREIGN KEY (vps_id)  REFERENCES vps(id)   ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_metrics_vps_ts ON metrics(vps_id, timestamp);

  -- ── vps_snapshots ────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS vps_snapshots (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    vps_id    INTEGER NOT NULL,
    user_id   INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    total_cpu REAL    NOT NULL DEFAULT 0,
    total_mem REAL    NOT NULL DEFAULT 0,
    running   INTEGER NOT NULL DEFAULT 0,
    total     INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (vps_id)  REFERENCES vps(id)   ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_snapshots_vps_ts ON vps_snapshots(vps_id, timestamp);

  -- ── latency_history ───────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS latency_history (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    vps_id    INTEGER NOT NULL,
    user_id   INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    url       TEXT    NOT NULL,
    ms        INTEGER NOT NULL DEFAULT 0,
    status    INTEGER NOT NULL DEFAULT 0,
    ok        INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (vps_id)  REFERENCES vps(id)   ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_latency_vps_ts ON latency_history(vps_id, timestamp);

  -- ── audit_log ─────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS audit_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   INTEGER,
    timestamp INTEGER NOT NULL,
    action    TEXT    NOT NULL,
    category  TEXT    NOT NULL DEFAULT 'settings',
    details   TEXT    NOT NULL DEFAULT '',
    ip        TEXT    NOT NULL DEFAULT '',
    success   INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_ts      ON audit_log(timestamp);
  CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_log(user_id);

  -- ── user_settings (replaces settings.json) ────────────────────────────────────
  CREATE TABLE IF NOT EXISTS user_settings (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL UNIQUE,
    discord_webhook  TEXT    NOT NULL DEFAULT '',
    slack_webhook    TEXT    NOT NULL DEFAULT '',
    notify_deploy    INTEGER NOT NULL DEFAULT 0,
    notify_failure   INTEGER NOT NULL DEFAULT 1,
    notify_rollback  INTEGER NOT NULL DEFAULT 1,
    ssh_access       INTEGER NOT NULL DEFAULT 1,
    api_token        TEXT    NOT NULL UNIQUE,
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_user_settings_user_id   ON user_settings(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_settings_api_token ON user_settings(api_token);

  -- ── alert_rules (replaces hardcoded thresholds) ───────────────────────────────
  CREATE TABLE IF NOT EXISTS alert_rules (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    vps_id     INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    metric     TEXT    NOT NULL,
    condition  TEXT    NOT NULL,
    threshold  REAL    NOT NULL,
    severity   TEXT    NOT NULL,
    enabled    INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (vps_id)  REFERENCES vps(id)   ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_alert_rules_vps_id ON alert_rules(vps_id);

  -- ── pipeline_runs ────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS pipeline_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    vps_id          INTEGER NOT NULL,
    user_id         INTEGER NOT NULL,
    github_run_id   INTEGER,
    workflow_name   TEXT    NOT NULL,
    status          TEXT    NOT NULL,
    conclusion      TEXT,
    branch          TEXT    NOT NULL,
    commit_sha      TEXT,
    commit_message  TEXT,
    actor           TEXT,
    started_at      INTEGER,
    completed_at    INTEGER,
    duration_sec    INTEGER,
    github_url      TEXT,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    FOREIGN KEY (vps_id)  REFERENCES vps(id)   ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_pipeline_runs_vps_id  ON pipeline_runs(vps_id);
  CREATE INDEX IF NOT EXISTS idx_pipeline_runs_user_id ON pipeline_runs(user_id);

  -- ── pipeline_jobs ─────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS pipeline_jobs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id         INTEGER NOT NULL,
    user_id        INTEGER NOT NULL,
    github_job_id  INTEGER,
    name           TEXT    NOT NULL,
    status         TEXT    NOT NULL,
    conclusion     TEXT,
    started_at     INTEGER,
    completed_at   INTEGER,
    duration_sec   INTEGER,
    steps_json     TEXT,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    FOREIGN KEY (run_id)  REFERENCES pipeline_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)         ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_run_id ON pipeline_jobs(run_id);

  -- ── oauth_accounts ──────────────────────────────────────────────────��──────
  CREATE TABLE IF NOT EXISTS oauth_accounts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    provider    TEXT    NOT NULL,
    provider_id TEXT    NOT NULL,
    created_at  INTEGER NOT NULL,
    UNIQUE (provider, provider_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_oauth_provider ON oauth_accounts(provider, provider_id);
`);

// ── Phase 2 — Tool & project detection tables ─────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS vps_detected_tools (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    vps_id       INTEGER NOT NULL,
    tool_name    TEXT    NOT NULL,
    tool_version TEXT,
    is_active    INTEGER DEFAULT 0,
    detected_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    raw_output   TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (vps_id)  REFERENCES vps(id)  ON DELETE CASCADE,
    UNIQUE(user_id, vps_id, tool_name)
  );
  CREATE INDEX IF NOT EXISTS idx_detected_tools_vps ON vps_detected_tools(user_id, vps_id);

  CREATE TABLE IF NOT EXISTS vps_detected_projects (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    vps_id       INTEGER NOT NULL,
    project_name TEXT    NOT NULL,
    project_path TEXT    NOT NULL,
    project_type TEXT,
    tech_stack   TEXT,
    is_running   INTEGER DEFAULT 0,
    detected_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (vps_id)  REFERENCES vps(id)  ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_detected_projects_vps ON vps_detected_projects(user_id, vps_id);

  -- ── Phase 3 — GitLab integration ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS gitlab_integrations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    vps_id          INTEGER NOT NULL,
    gitlab_url      TEXT    NOT NULL,
    project_id      TEXT    NOT NULL,
    token_encrypted TEXT    NOT NULL,
    enabled         INTEGER DEFAULT 1,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (vps_id)  REFERENCES vps(id)  ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS gitlab_pipeline_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    vps_id      INTEGER NOT NULL,
    pipeline_id TEXT    NOT NULL,
    status      TEXT,
    ref         TEXT,
    sha         TEXT,
    duration    INTEGER,
    started_at  DATETIME,
    finished_at DATETIME,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (vps_id)  REFERENCES vps(id)  ON DELETE CASCADE
  );

  -- ── Phase 3 — Kubernetes snapshots ────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS k8s_snapshots (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL,
    vps_id           INTEGER NOT NULL,
    nodes_json       TEXT,
    pods_json        TEXT,
    deployments_json TEXT,
    services_json    TEXT,
    namespaces_json  TEXT,
    collected_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (vps_id)  REFERENCES vps(id)  ON DELETE CASCADE
  );

  -- ── Phase 3 — Ansible playbooks ───────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS ansible_playbooks (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL,
    vps_id           INTEGER NOT NULL,
    playbook_path    TEXT    NOT NULL,
    playbook_name    TEXT    NOT NULL,
    last_run_at      DATETIME,
    last_run_status  TEXT,
    discovered_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (vps_id)  REFERENCES vps(id)  ON DELETE CASCADE
  );

  -- ── Phase 3 — Terraform workspaces ────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS terraform_workspaces (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL,
    vps_id         INTEGER NOT NULL,
    workspace_path TEXT    NOT NULL,
    workspace_name TEXT,
    resource_count INTEGER DEFAULT 0,
    last_apply_at  DATETIME,
    state_json     TEXT,
    scanned_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (vps_id)  REFERENCES vps(id)  ON DELETE CASCADE
  );

  -- ── Phase 3 — Prometheus integration ──────────────────────────────────────
  CREATE TABLE IF NOT EXISTS prometheus_integrations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    vps_id          INTEGER NOT NULL,
    prometheus_url  TEXT    NOT NULL DEFAULT 'http://localhost:9090',
    enabled         INTEGER DEFAULT 1,
    last_checked_at DATETIME,
    is_reachable    INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (vps_id)  REFERENCES vps(id)  ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS prometheus_alerts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    vps_id     INTEGER NOT NULL,
    alert_name TEXT,
    severity   TEXT,
    state      TEXT,
    summary    TEXT,
    fired_at   DATETIME,
    resolved_at DATETIME,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (vps_id)  REFERENCES vps(id)  ON DELETE CASCADE
  );

  -- ── Phase 3 — Jenkins integration ─────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS jenkins_integrations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    vps_id          INTEGER NOT NULL,
    jenkins_url     TEXT    NOT NULL,
    username        TEXT    NOT NULL,
    token_encrypted TEXT    NOT NULL,
    enabled         INTEGER DEFAULT 1,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (vps_id)  REFERENCES vps(id)  ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS jenkins_builds (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    vps_id       INTEGER NOT NULL,
    job_name     TEXT    NOT NULL,
    build_number INTEGER,
    status       TEXT,
    duration     INTEGER,
    timestamp    DATETIME,
    url          TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (vps_id)  REFERENCES vps(id)  ON DELETE CASCADE
  );
`);

// ── Add profile columns to users if they don't exist (migration) ─────────────
if (!hasColumn('users', 'phone'))    db.exec('ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ""');
if (!hasColumn('users', 'location')) db.exec('ALTER TABLE users ADD COLUMN location TEXT NOT NULL DEFAULT ""');
if (!hasColumn('users', 'timezone')) db.exec('ALTER TABLE users ADD COLUMN timezone TEXT NOT NULL DEFAULT ""');

// ── Migrate auth_users → users (one-time, non-destructive) ────────────────────
if (tableExists('auth_users')) {
  const n = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (n === 0) {
    db.exec(`
      INSERT INTO users (id, name, email, password_hash, password_salt, role, created_at, updated_at)
      SELECT id, name, email, password_hash, password_salt, 'user', created_at, updated_at
      FROM auth_users
    `);
    console.log('✅ Migrated auth_users → users');
  }
}
if (tableExists('auth_sessions')) {
  const n = db.prepare('SELECT COUNT(*) as c FROM user_sessions').get().c;
  if (n === 0) {
    db.exec(`
      INSERT INTO user_sessions (id, user_id, token, expires_at, ip_address, created_at)
      SELECT id, user_id, token, expires_at, '', created_at
      FROM auth_sessions
    `);
    console.log('✅ Migrated auth_sessions → user_sessions');
  }
}

// ── Default alert rules seeder ────────────────────────────────────────────────
const DEFAULT_ALERT_RULES = [
  { metric: 'cpu',            condition: 'gt', threshold: 80, severity: 'critical' },
  { metric: 'cpu',            condition: 'gt', threshold: 50, severity: 'warning'  },
  { metric: 'memory',         condition: 'gt', threshold: 85, severity: 'critical' },
  { metric: 'memory',         condition: 'gt', threshold: 70, severity: 'warning'  },
  { metric: 'container_down', condition: 'eq', threshold: 0,  severity: 'critical' },
];
const insertAlertRuleStmt = db.prepare(`
  INSERT INTO alert_rules (vps_id, user_id, metric, condition, threshold, severity, enabled, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
`);
function seedDefaultAlertRules(vpsId, userId) {
  const now = Date.now();
  DEFAULT_ALERT_RULES.forEach(r =>
    insertAlertRuleStmt.run(vpsId, userId, r.metric, r.condition, r.threshold, r.severity, now, now)
  );
}

// ── Migrate vps-store.json → vps table (one-time) ─────────────────────────────
const VPS_FILE        = './vps-store.json';
const VPS_BACKUP      = './vps-store.backup.json';
const SETTINGS_FILE   = './settings.json';
const SETTINGS_BACKUP = './settings.backup.json';
const ENABLE_LEGACY_JSON_MIGRATION = process.env.ENABLE_LEGACY_JSON_MIGRATION === 'true';

if (ENABLE_LEGACY_JSON_MIGRATION && fs.existsSync(VPS_FILE) && !fs.existsSync(VPS_BACKUP)) {
  try {
    const raw     = JSON.parse(fs.readFileSync(VPS_FILE, 'utf8'));
    const entries = raw.vps ? Object.values(raw.vps) : Object.values(raw);
    const firstUser = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();

    if (firstUser && entries.length > 0) {
      const now = Date.now();
      const stmtVps = db.prepare(`
        INSERT OR IGNORE INTO vps (user_id, slug, name, host, port, username, ssh_password, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'unknown', ?, ?)
      `);
      const stmtGithub = db.prepare(`
        INSERT OR IGNORE INTO vps_github_integrations (vps_id, user_id, github_repo, github_token, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      db.transaction(() => {
        for (const v of entries) {
          const r = stmtVps.run(
            firstUser.id, v.id, v.name || v.id, v.host, v.port || 22,
            v.username, encrypt(v.password), now, now
          );
          const vpsId = r.lastInsertRowid;
          if (v.githubRepo && v.githubToken) {
            stmtGithub.run(vpsId, firstUser.id, cleanGithubRepo(v.githubRepo), encrypt(v.githubToken), now, now);
          }
          seedDefaultAlertRules(vpsId, firstUser.id);
        }
      })();
      console.log(`✅ Migrated ${entries.length} VPS from vps-store.json`);
    } else if (entries.length > 0) {
      console.log('⚠️  VPS data found but no users exist yet — will retry migration on next startup after first signup');
    }

    fs.renameSync(VPS_FILE, VPS_BACKUP);
    console.log('📦 vps-store.json → vps-store.backup.json');
  } catch (e) {
    console.error('⚠️  VPS migration error:', e.message);
  }
}

if (!ENABLE_LEGACY_JSON_MIGRATION && fs.existsSync(VPS_FILE)) {
  console.log('ℹ️  Legacy file detected (vps-store.json) but migration is disabled by default.');
}

// ── Migrate settings.json → user_settings table (one-time) ───────────────────
if (ENABLE_LEGACY_JSON_MIGRATION && fs.existsSync(SETTINGS_FILE) && !fs.existsSync(SETTINGS_BACKUP)) {
  try {
    const raw       = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    const firstUser = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();
    if (firstUser) {
      const exists = db.prepare('SELECT id FROM user_settings WHERE user_id = ?').get(firstUser.id);
      if (!exists) {
        const now = Date.now();
        db.prepare(`
          INSERT INTO user_settings
            (user_id, discord_webhook, slack_webhook, notify_deploy, notify_failure, notify_rollback, ssh_access, api_token, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          firstUser.id,
          raw.discordWebhook || '',
          raw.slackWebhook   || '',
          raw.notifyDeploy   ? 1 : 0,
          raw.notifyFailure  ? 1 : 0,
          raw.notifyRollback ? 1 : 0,
          raw.sshAccess      ? 1 : 0,
          raw.apiToken || crypto.randomBytes(32).toString('hex'),
          now, now
        );
        console.log('✅ Migrated settings.json → user_settings');
      }
    }
    fs.renameSync(SETTINGS_FILE, SETTINGS_BACKUP);
    console.log('📦 settings.json → settings.backup.json');
  } catch (e) {
    console.error('⚠️  Settings migration error:', e.message);
  }
}

if (!ENABLE_LEGACY_JSON_MIGRATION && fs.existsSync(SETTINGS_FILE)) {
  console.log('ℹ️  Legacy file detected (settings.json) but migration is disabled by default.');
}

// ══════════════════════════════════════════════════════════════════════════════
// PREPARED STATEMENTS
// ══════════════════════════════════════════════════════════════════════════════
const stmtInsertUser = db.prepare(`
  INSERT INTO users (name, email, password_hash, password_salt, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const stmtSelectUserByEmail = db.prepare(`
  SELECT id, name, email, password_hash, password_salt, created_at, updated_at
  FROM users WHERE email = ? AND deleted_at IS NULL
`);
const stmtSelectUserById = db.prepare(`
  SELECT id, name, email, phone, location, timezone, created_at, updated_at FROM users WHERE id = ?
`);
const stmtUpdateUserPassword = db.prepare(`
  UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?
`);
const stmtUpdateUserProfile = db.prepare(`
  UPDATE users SET name=?, phone=?, location=?, timezone=?, updated_at=? WHERE id=?
`);
const stmtInsertSession = db.prepare(`
  INSERT INTO user_sessions (user_id, token, expires_at, ip_address, created_at)
  VALUES (?, ?, ?, ?, ?)
`);
const stmtSelectSession = db.prepare(`
  SELECT s.id, s.user_id, s.token, s.expires_at, u.name, u.email, u.created_at, u.updated_at
  FROM user_sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.token = ?
`);
const stmtDeleteSessionByToken   = db.prepare('DELETE FROM user_sessions WHERE token = ?');
const stmtDeleteExpiredSessions  = db.prepare('DELETE FROM user_sessions WHERE expires_at < ?');
const stmtInsertUserSettings     = db.prepare(`
  INSERT INTO user_settings (user_id, api_token, created_at, updated_at) VALUES (?, ?, ?, ?)
`);
const stmtSelectUserSettings     = db.prepare('SELECT * FROM user_settings WHERE user_id = ?');
const stmtUpdateUserSettings     = db.prepare(`
  UPDATE user_settings
  SET discord_webhook=?, slack_webhook=?, notify_deploy=?, notify_failure=?,
      notify_rollback=?, ssh_access=?, updated_at=?
  WHERE user_id=?
`);
const stmtUpdateApiToken         = db.prepare('UPDATE user_settings SET api_token=?, updated_at=? WHERE user_id=?');
const stmtInsertMetric   = db.prepare('INSERT INTO metrics (vps_id, user_id, timestamp, container, cpu, mem_mb, mem_perc) VALUES (?, ?, ?, ?, ?, ?, ?)');
const stmtInsertSnapshot = db.prepare('INSERT INTO vps_snapshots (vps_id, user_id, timestamp, total_cpu, total_mem, running, total) VALUES (?, ?, ?, ?, ?, ?, ?)');
const stmtInsertLatency  = db.prepare('INSERT INTO latency_history (vps_id, user_id, timestamp, url, ms, status, ok) VALUES (?, ?, ?, ?, ?, ?, ?)');
const stmtInsertAudit    = db.prepare('INSERT INTO audit_log (user_id, timestamp, action, category, details, ip, success) VALUES (?, ?, ?, ?, ?, ?, ?)');

// ══════════════════════════════════════════════════════════════════════════════
// AUTH — helpers
// ══════════════════════════════════════════════════════════════════════════════
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

function createAuthToken() { return crypto.randomBytes(32).toString('hex'); }

function sessionCacheKey(token) {
  return `mp_session:${token}`;
}

async function saveSession({ userId, token, expiresAt, ipAddress, createdAt }) {
  const payload = {
    user_id: userId,
    token,
    expires_at: expiresAt,
    ip_address: ipAddress,
    created_at: createdAt,
  };

  if (redisClient?.isReady) {
    const ttlSeconds = Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
    await redisClient.set(sessionCacheKey(token), JSON.stringify(payload), { EX: ttlSeconds });
    return payload;
  }

  stmtInsertSession.run(userId, token, expiresAt, ipAddress, createdAt);
  return payload;
}

async function loadSession(token) {
  if (redisClient?.isReady) {
    const raw = await redisClient.get(sessionCacheKey(token));
    if (!raw) return null;

    const session = JSON.parse(raw);
    if (!session || session.expires_at < Date.now()) {
      await redisClient.del(sessionCacheKey(token));
      return null;
    }

    const user = stmtSelectUserById.get(session.user_id);
    if (!user) return null;

    return {
      sessionId: session.token,
      token: session.token,
      user,
    };
  }

  const session = stmtSelectSession.get(token);
  if (!session) return null;
  if (session.expires_at < Date.now()) { stmtDeleteSessionByToken.run(token); return null; }
  return {
    sessionId: session.id,
    token:     session.token,
    user: { id: session.user_id, name: session.name, email: session.email,
            created_at: session.created_at, updated_at: session.updated_at },
  };
}

async function deleteSession(token) {
  if (redisClient?.isReady) {
    await redisClient.del(sessionCacheKey(token));
    return;
  }
  stmtDeleteSessionByToken.run(token);
}

function buildAuthCookie(token, maxAge) {
  const sameSite = (process.env.COOKIE_SAMESITE || (process.env.NODE_ENV === 'production' ? 'None' : 'Lax')).trim();
  const parts = [`mp_session=${token}`, 'HttpOnly', 'Path=/', `SameSite=${sameSite}`];
  const shouldSecure = process.env.COOKIE_SECURE === 'true' || (sameSite.toLowerCase() === 'none' && process.env.NODE_ENV === 'production');
  if (shouldSecure) parts.push('Secure');
  if (typeof maxAge === 'number') parts.push(`Max-Age=${maxAge}`);
  return parts.join('; ');
}

function setAuthCookie(res, token) {
  res.setHeader('Set-Cookie', buildAuthCookie(token, 60 * 60 * 24));
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', buildAuthCookie('', 0));
}

function parseCookies(req) {
  const header = req.headers?.cookie || '';
  return header.split(';').reduce((acc, part) => {
    const [rawKey, ...rawVal] = part.trim().split('=');
    if (rawKey) acc[rawKey] = decodeURIComponent(rawVal.join('='));
    return acc;
  }, {});
}

async function getSessionUser(req) {
  const token = parseCookies(req).mp_session;
  if (!token) return null;
  return loadSession(token);
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — requireAuth MIDDLEWARE
// ══════════════════════════════════════════════════════════════════════════════
async function requireAuth(req, res, next) {
  const session = await getSessionUser(req);
  if (!session) return res.status(401).json({ success: false, error: 'Authentication required' });
  req.authSession = session;
  next();
}

// ══════════════════════════════════════════════════════════════════════════════
// AUDIT LOG HELPER
// ══════════════════════════════════════════════════════════════════════════════
function auditLog({ userId = null, action, category = 'settings', details = '', ip = '', success = 1 }) {
  try {
    stmtInsertAudit.run(userId, Date.now(), action, category, String(details), String(ip), success ? 1 : 0);
    console.log(`📋 Audit [${category}] ${action}${details ? ' — ' + details : ''}`);
  } catch (e) { console.error('auditLog error:', e.message); }
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
}

// ══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════════════════════
function cleanGithubRepo(repo) {
  if (!repo?.trim()) return null;
  const m = repo.trim().match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?(?:\/.*)?$/);
  return m ? m[1] : repo.trim();
}

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com','tempmail.com','guerrillamail.com','throwaway.email','sharklasers.com',
  'guerrillamail.info','grr.la','guerrillamail.biz','guerrillamail.de','guerrillamail.net',
  'guerrillamail.org','spam4.me','yopmail.com','yopmail.fr','cool.fr.nf','jetable.fr.nf',
  'nospam.ze.tc','nomail.xl.cx','mega.zik.dj','speed.1s.fr','courriel.fr.nf','moncourrier.fr.nf',
  'monemail.fr.nf','monmail.fr.nf','trashmail.com','trashmail.at','trashmail.io','trashmail.me',
  'trashmail.net','trashmail.org','dispostable.com','mailnull.com','spamgourmet.com',
  'maildrop.cc','getairmail.com','filzmail.com','throwam.com','tempr.email','discard.email',
  'spamhereplease.com','fakeinbox.com','mailnesia.com','mailnull.com','spamfree24.org',
  'mailexpire.com','tempinbox.com','tempomail.fr','throwam.com','ymail.com',
]);

function isValidEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(e)) return false;
  const domain = e.split('@')[1];
  if (!domain || domain.split('.').pop().length < 2) return false;
  if (DISPOSABLE_DOMAINS.has(domain)) return false;
  return true;
}

function getEmailError(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(e)) return 'Email address is invalid. Use a valid format like name@example.com';
  const domain = e.split('@')[1];
  if (!domain || domain.split('.').pop().length < 2) return 'Email domain is invalid.';
  if (DISPOSABLE_DOMAINS.has(domain)) return 'Temporary/disposable email addresses are not allowed.';
  return null;
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
  if (m.includes('warn'))  return 'warn';
  if (m.includes('debug')) return 'debug';
  return 'info';
}

function splitLines(raw) {
  return String(raw || '').replace(/\r/g, '').split('\n').map(s => s.trim()).filter(Boolean);
}

function looksLikeMissingCommand(raw) {
  const out = String(raw || '').toLowerCase();
  return out.includes('not_found') || out.includes('command not found') || out.includes('no such file or directory');
}

function looksLikeDockerUnavailable(raw) {
  const out = String(raw || '').toLowerCase();
  return looksLikeMissingCommand(out)
    || out.includes('cannot connect to the docker daemon')
    || out.includes('is the docker daemon running')
    || out.includes('permission denied while trying to connect')
    || out.includes('got permission denied while trying to connect');
}

function parseDockerStatsOutput(raw) {
  return splitLines(raw).map(line => {
    const parts = line.split('|').map(s => s.trim());
    if (parts.length < 4 || !parts[0]) return null;
    const [name, cpu, mem, memPerc] = parts;
    return { name, cpu, mem, memPerc };
  }).filter(Boolean);
}

function parseDockerPsOutput(raw) {
  return splitLines(raw).map(line => {
    const idx = line.indexOf('|');
    if (idx <= 0) return null;
    return { name: line.slice(0, idx).trim(), status: line.slice(idx + 1).trim() };
  }).filter(Boolean);
}

async function getDockerRuntimeSnapshot(vps) {
  const [statsRaw, psRaw] = await Promise.all([
    runSSH(vps, "docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}' 2>&1"),
    runSSH(vps, "docker ps --format '{{.Names}}|{{.Status}}' 2>&1"),
  ]);

  const stats = parseDockerStatsOutput(statsRaw);
  const ps = parseDockerPsOutput(psRaw);
  const accessible = !looksLikeDockerUnavailable(statsRaw) && !looksLikeDockerUnavailable(psRaw);
  return { stats, ps, accessible, statsRaw, psRaw };
}

async function getHostRuntimeSnapshot(vps) {
  const [loadRaw, coresRaw, memRaw] = await Promise.all([
    runSSH(vps, "cat /proc/loadavg 2>/dev/null | awk '{print $1}' || uptime 2>/dev/null | awk -F'load average:' '{print $2}' | cut -d',' -f1 || echo 0"),
    runSSH(vps, 'nproc 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo 1'),
    runSSH(vps, "free -m 2>/dev/null | awk '/^Mem:/ {print $2\"|\"$3}' || echo '0|0'"),
  ]);

  const memParts = String(memRaw || '').trim().split('|');
  const totalMem = Math.max(0, parseFloat(memParts[0]) || 0);
  const usedMem = Math.max(0, parseFloat(memParts[1]) || 0);
  const cores = Math.max(1, parseFloat(String(coresRaw || '').trim()) || 1);
  const load = Math.max(0, parseFloat(String(loadRaw || '').trim()) || 0);
  const cpuPerc = Math.max(0, Math.min(100, (load / cores) * 100));
  const memPerc = totalMem > 0 ? (usedMem / totalMem) * 100 : 0;

  if (!Number.isFinite(cpuPerc) || !Number.isFinite(memPerc)) {
    return null;
  }

  return {
    container: {
      name: 'host-system',
      cpu: `${cpuPerc.toFixed(1)}%`,
      mem: `${usedMem.toFixed(0)}MiB / ${totalMem.toFixed(0)}MiB`,
      memPerc: `${memPerc.toFixed(1)}%`,
      status: 'Up (host)',
    },
    snapshot: {
      totalCpu: cpuPerc,
      totalMem: usedMem,
      running: 1,
      total: 1,
    },
  };
}

async function collectRuntimeForVps(vps) {
  const docker = await getDockerRuntimeSnapshot(vps);
  if (docker.accessible && docker.stats.length > 0) {
    // Use the raw docker outputs (strings) for container fields so frontend parsing stays consistent
    const containers = docker.stats.map(c => ({ name: c.name, cpu: c.cpu, mem: c.mem, memPerc: c.memPerc }));
    const running = docker.ps.filter(p => p.status.includes('Up')).length;
    const total = docker.ps.length;
    // Compute numeric summaries by parsing the string values
    const totalCpu = containers.reduce((s, c) => s + parseCpu(c.cpu), 0) / Math.max(1, containers.length);
    const totalMem = containers.reduce((s, c) => s + parseMem(c.mem), 0);
    return {
      mode: 'docker',
      containers,
      ps: docker.ps,
      summary: { totalCpu, totalMem, running, total },
    };
  }

  const host = await getHostRuntimeSnapshot(vps);
  if (!host) {
    return {
      mode: 'none',
      containers: [],
      ps: [],
      summary: { totalCpu: 0, totalMem: 0, running: 0, total: 0 },
    };
  }

  return {
    mode: 'host',
    // Keep host container fields as strings (same shape as docker.stats entries)
    containers: [{ name: host.container.name, cpu: host.container.cpu, mem: host.container.mem, memPerc: host.container.memPerc }],
    ps: [{ name: host.container.name, status: host.container.status }],
    summary: host.snapshot,
  };
}

// ── SSH command runner ────────────────────────────────────────────────────────
function runSSH(vps, command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let output = '';
    const password = String(vps.password || '');
    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) return reject(err);
        stream.on('data',        d => { output += d.toString(); });
        stream.stderr.on('data', d => { output += d.toString(); });
        stream.on('close', () => { conn.end(); resolve(output.trim()); });
      });
    });
    conn.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
      if (!password || !Array.isArray(prompts) || prompts.length === 0) {
        return finish([]);
      }
      finish(prompts.map(() => password));
    });
    conn.on('error', err => reject(err));
    conn.connect({
      host: vps.host,
      port: vps.port || 22,
      username: vps.username,
      password,
      readyTimeout: 15000,
      tryKeyboard: true,
      keepaliveInterval: 10000,
    });
  });
}

// ── HTTP latency probe ────────────────────────────────────────────────────────
function pingHttp(host) {
  return new Promise(resolve => {
    const start = Date.now();
    const req   = http.get(`http://${host}`, { timeout: 5000 }, res => {
      const ms = Date.now() - start;
      res.resume();
      resolve({ ms, status: res.statusCode, ok: 1 });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ms: 5000, status: 0, ok: 0 }); });
    req.on('error',   () => resolve({ ms: Date.now() - start, status: 0, ok: 0 }));
  });
}

// ── VPS lookup helpers (user-scoped) ─────────────────────────────────────────
function getVpsBySlug(userId, slug) {
  const row = db.prepare('SELECT * FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, slug);
  if (!row) return null;
  return { ...row, password: decrypt(row.ssh_password) };
}

function hasSshAccess(vpsRow) {
  return !!decrypt(vpsRow?.ssh_password);
}

function getGithub(vpsId) {
  const row = db.prepare('SELECT * FROM vps_github_integrations WHERE vps_id = ?').get(vpsId);
  if (!row) return null;
  return { ...row, token: decrypt(row.github_token) };
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — BACKGROUND METRIC COLLECTION
// Reads all active VPS from DB (across all users), decrypts credentials,
// collects metrics, writes with correct integer vps_id + user_id.
// ══════════════════════════════════════════════════════════════════════════════
async function collectMetrics(vpsRow) {
  if (!hasSshAccess(vpsRow)) return;
  const vps = { ...vpsRow, password: decrypt(vpsRow.ssh_password) };
  try {
    const runtime = await collectRuntimeForVps(vps);

    const now      = Date.now();
    const running  = runtime.summary.running;
    const total    = runtime.summary.total;
    const totalCpu = runtime.summary.totalCpu;
    const totalMem = runtime.summary.totalMem;

    db.transaction(() => {
      runtime.containers.forEach(c => stmtInsertMetric.run(vpsRow.id, vpsRow.user_id, now, c.name, c.cpu, c.mem, c.memPerc));
      stmtInsertSnapshot.run(vpsRow.id, vpsRow.user_id, now, totalCpu, totalMem, running, total);
    })();
  } catch {
    // VPS may be temporarily unreachable — silently skip
  }
}

async function collectLatency(vpsRow) {
  if (!hasSshAccess(vpsRow)) return;
  try {
    const { ms, status, ok } = await pingHttp(vpsRow.host);
    stmtInsertLatency.run(vpsRow.id, vpsRow.user_id, Date.now(), `http://${vpsRow.host}`, ms, status, ok);
    console.log(`🌐 Latency [${vpsRow.slug}] → ${ok ? ms + 'ms' : 'timeout'} (HTTP ${status})`);
  } catch (err) {
    console.error(`❌ collectLatency [${vpsRow.slug}]:`, err.message);
  }
}

async function collectAll() {
  const allVps = db.prepare('SELECT * FROM vps WHERE deleted_at IS NULL').all();
  if (allVps.length === 0) return;
  await Promise.all(allVps.map(v => Promise.all([collectMetrics(v), collectLatency(v)])));
}

collectAll();
setInterval(collectAll, 2 * 60 * 1000);

// ── Periodic cleanup ──────────────────────────────────────────────────────────
function cleanOldData() {
  const cutoff      = Date.now() - 31 * 24 * 60 * 60 * 1000;
  const auditCutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  db.prepare('DELETE FROM metrics         WHERE timestamp < ?').run(cutoff);
  db.prepare('DELETE FROM vps_snapshots   WHERE timestamp < ?').run(cutoff);
  db.prepare('DELETE FROM latency_history WHERE timestamp < ?').run(cutoff);
  db.prepare('DELETE FROM audit_log       WHERE timestamp < ?').run(auditCutoff);
}
function cleanupExpiredSessions() {
  if (redisClient?.isReady) return;
  try { stmtDeleteExpiredSessions.run(Date.now()); } catch (e) { console.error('[sessions] cleanup:', e.message); }
}
cleanupExpiredSessions();
cleanOldData();
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);
setInterval(cleanOldData,            60 * 60 * 1000);

// ══════════════════════════════════════════════════════════════════════════════
// TIME-RANGE UTILITIES
// ══════════════════════════════════════════════════════════════════════════════
function rangeToMs(range) {
  const map = { '1h': 3_600_000, '6h': 21_600_000, '12h': 43_200_000, '24h': 86_400_000, '7d': 604_800_000, '30d': 2_592_000_000 };
  return map[range] || 86_400_000;
}

function intervalForRange(rangeMs) {
  if (rangeMs <=   3_600_000) return    60_000;
  if (rangeMs <=  21_600_000) return   300_000;
  if (rangeMs <=  86_400_000) return   900_000;
  if (rangeMs <= 604_800_000) return 3_600_000;
  return                             7_200_000;
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
        ? time.toLocaleDateString('fr', { month: 'short', day: 'numeric' }) + ' ' + time.toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' })
        : time.toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' });
      return { time: label, items };
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// OPEN ROUTES — no auth required
// These must be registered BEFORE the global auth middleware below.
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/health ───────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// ── POST /api/auth/signup ─────────────────────────────────────────────────────
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body || {};
    if (!name || !email || !password || !confirmPassword)
      return res.status(400).json({ success: false, error: 'name, email, password and confirmPassword are required' });

    const normalizedEmail = String(email).trim().toLowerCase();
    const trimmedName     = String(name).trim();
    const pw              = String(password);

    const emailErr = getEmailError(normalizedEmail);
    if (emailErr) return res.status(400).json({ success: false, error: emailErr });
    if (pw.length < 8)
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters long' });
    if (pw !== String(confirmPassword))
      return res.status(400).json({ success: false, error: 'Passwords do not match' });
    if (stmtSelectUserByEmail.get(normalizedEmail))
      return res.status(409).json({ success: false, error: 'This email is already registered' });

    const { salt, hash } = hashPassword(pw);
    const now     = Date.now();
    const result  = stmtInsertUser.run(trimmedName, normalizedEmail, hash, salt, now, now);
    const userId  = result.lastInsertRowid;
    const newUser = stmtSelectUserById.get(userId);

    // Create default settings row for this user
    stmtInsertUserSettings.run(userId, crypto.randomBytes(32).toString('hex'), now, now);

    const token = createAuthToken();
    await saveSession({ userId, token, expiresAt: now + 24 * 60 * 60 * 1000, ipAddress: getClientIp(req), createdAt: now });
    setAuthCookie(res, token);

    auditLog({ userId, action: 'User signup', category: 'security', ip: getClientIp(req) });
    return res.status(201).json({ success: true, message: 'Account created successfully', data: { user: newUser } });
  } catch (error) {
    console.error('[auth/signup]', error);
    return res.status(500).json({ success: false, error: 'Failed to create account' });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ success: false, error: 'email and password are required' });

    const normalizedEmail = String(email).trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ success: false, error: 'Email address is invalid. Use a valid format like name@example.com' });
    }
    const user = stmtSelectUserByEmail.get(normalizedEmail);
    if (!user || !verifyPassword(String(password), user.password_salt, user.password_hash)) {
      auditLog({ action: 'Failed login', category: 'security', details: normalizedEmail, ip: getClientIp(req), success: 0 });
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = createAuthToken();
    const now   = Date.now();
    await saveSession({ userId: user.id, token, expiresAt: now + 24 * 60 * 60 * 1000, ipAddress: getClientIp(req), createdAt: now });
    setAuthCookie(res, token);

    auditLog({ userId: user.id, action: 'User login', category: 'security', ip: getClientIp(req) });
    return res.json({ success: true, message: 'Login successful', data: { user: { id: user.id, name: user.name, email: user.email, created_at: user.created_at, updated_at: user.updated_at } } });
  } catch (error) {
    console.error('[auth/login]', error);
    return res.status(500).json({ success: false, error: 'Failed to login' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
app.post('/api/auth/logout', async (req, res) => {
  try {
    const token = parseCookies(req).mp_session;
    if (token) await deleteSession(token);
    clearAuthCookie(res);
    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('[auth/logout]', error);
    return res.status(500).json({ success: false, error: 'Failed to logout' });
  }
});

// ── GET /api/auth/github — redirect to GitHub OAuth ──────────────────────────
app.get('/api/auth/github', (req, res) => {
  const clientId   = process.env.GITHUB_CLIENT_ID;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  if (!clientId) {
    return res.redirect(`${frontendUrl}/login?error=github_not_configured`);
  }
  const requestProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const requestHost = req.get('host');
  const callbackUrl = `${requestProto}://${requestHost}/api/auth/github/callback`;
  const state = crypto.randomBytes(16).toString('hex');
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: callbackUrl, scope: 'user:email', state });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// ── GET /api/auth/github/callback — handle GitHub OAuth callback ──────────────
app.get('/api/auth/github/callback', async (req, res) => {
  const { code } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const clientId     = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!code || !clientId || !clientSecret) {
    return res.redirect(`${frontendUrl}/login?error=github_oauth_failed`);
  }

  try {
    const { default: fetch } = await import('node-fetch');

    // Exchange code for access token
    const tokenRes  = await fetch('https://github.com/login/oauth/access_token', {
      method:  'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body:    JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('GitHub token exchange failed');

    const ghHeaders = {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    // Get GitHub user profile
    const [userRes, emailsRes] = await Promise.all([
      fetch('https://api.github.com/user',        { headers: ghHeaders }),
      fetch('https://api.github.com/user/emails', { headers: ghHeaders }),
    ]);
    const githubUser = await userRes.json();
    const emailList  = await emailsRes.json();

    // Pick primary verified email, fallback to any
    let email = githubUser.email;
    if (!email && Array.isArray(emailList)) {
      const primary = emailList.find(e => e.primary && e.verified) || emailList[0];
      email = primary?.email || null;
    }
    if (!email) throw new Error('No email returned from GitHub');

    const normalizedEmail = email.trim().toLowerCase();
    const now = Date.now();

    // Check existing OAuth link
    let user = null;
    const oauthRow = db.prepare('SELECT * FROM oauth_accounts WHERE provider = ? AND provider_id = ?').get('github', String(githubUser.id));

    if (oauthRow) {
      user = stmtSelectUserById.get(oauthRow.user_id);
    } else {
      user = stmtSelectUserByEmail.get(normalizedEmail);
      if (!user) {
        // Create new account
        const displayName = (githubUser.name || githubUser.login || 'GitHub User').trim();
        const result  = stmtInsertUser.run(displayName, normalizedEmail, '', '', now, now);
        const newId   = result.lastInsertRowid;
        stmtInsertUserSettings.run(newId, crypto.randomBytes(32).toString('hex'), now, now);
        user = stmtSelectUserById.get(newId);
        auditLog({ userId: newId, action: 'User signup via GitHub', category: 'security', ip: getClientIp(req) });
      }
      // Link OAuth account
      db.prepare('INSERT OR IGNORE INTO oauth_accounts (user_id, provider, provider_id, created_at) VALUES (?, ?, ?, ?)').run(user.id, 'github', String(githubUser.id), now);
    }

    // Create session & set cookie
    const token = createAuthToken();
    await saveSession({ userId: user.id, token, expiresAt: now + 24 * 60 * 60 * 1000, ipAddress: getClientIp(req), createdAt: now });
    setAuthCookie(res, token);
    auditLog({ userId: user.id, action: 'User login via GitHub', category: 'security', ip: getClientIp(req) });

    return res.redirect(`${frontendUrl}/`);
  } catch (err) {
    console.error('[github/callback]', err.message);
    return res.redirect(`${frontendUrl}/login?error=github_oauth_failed`);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — GLOBAL AUTH MIDDLEWARE
// Every /api/* route registered after this point requires a valid session.
// The only exceptions (signup, login, logout, health) are already handled above
// and will never reach this middleware because they call res.json() without next().
// ══════════════════════════════════════════════════════════════════════════════
app.use('/api', requireAuth);

// ══════════════════════════════════════════════════════════════════════════════
// PROTECTED ROUTES — all scoped to req.authSession.user.id
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
app.get('/api/auth/me', (req, res) => {
  const user = stmtSelectUserById.get(req.authSession.user.id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  return res.json({ success: true, data: { user } });
});

// ── PUT /api/auth/me — update profile ─────────────────────────────────────────
app.put('/api/auth/me', (req, res) => {
  const userId = req.authSession.user.id;
  const { name, phone, location, timezone } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ success: false, error: 'Name is required' });
  stmtUpdateUserProfile.run(name.trim(), (phone || '').trim(), (location || '').trim(), (timezone || '').trim(), Date.now(), userId);
  auditLog({ userId, action: 'Profile updated', category: 'settings', ip: getClientIp(req) });
  const updated = stmtSelectUserById.get(userId);
  return res.json({ success: true, data: { user: updated } });
});

// ── POST /api/auth/change-password ────────────────────────────────────────────
app.post('/api/auth/change-password', (req, res) => {
  const userId = req.authSession.user.id;
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword)
    return res.status(400).json({ success: false, error: 'currentPassword and newPassword are required' });
  if (String(newPassword).length < 8)
    return res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });

  const user = db.prepare('SELECT password_hash, password_salt FROM users WHERE id = ?').get(userId);
  if (!user || !verifyPassword(String(currentPassword), user.password_salt, user.password_hash))
    return res.status(401).json({ success: false, error: 'Current password is incorrect' });

  const { salt, hash } = hashPassword(String(newPassword));
  stmtUpdateUserPassword.run(hash, salt, Date.now(), userId);
  auditLog({ userId, action: 'Password changed', category: 'security', ip: getClientIp(req) });
  return res.json({ success: true, message: 'Password changed successfully' });
});

// ── GET /api/profile/stats ────────────────────────────────────────────────────
app.get('/api/profile/stats', (req, res) => {
  const userId = req.authSession.user.id;
  const deployments = db.prepare(`SELECT COUNT(*) as count FROM pipeline_runs WHERE user_id = ? AND conclusion = 'success'`).get(userId)?.count || 0;
  const rollbacks   = db.prepare(`SELECT COUNT(*) as count FROM audit_log WHERE user_id = ? AND action LIKE 'Rollback%'`).get(userId)?.count || 0;
  const latencyRows = db.prepare('SELECT ok FROM latency_history WHERE user_id = ? AND timestamp > ?').all(userId, Date.now() - 30 * 24 * 60 * 60 * 1000);
  const uptime      = latencyRows.length ? Math.round(latencyRows.filter(r => r.ok).length / latencyRows.length * 1000) / 10 : 100;
  return res.json({ deployments, rollbacks, uptime });
});

// ── GET /api/profile/activity ─────────────────────────────────────────────────
app.get('/api/profile/activity', (req, res) => {
  const userId = req.authSession.user.id;
  const rows   = db.prepare('SELECT timestamp, action, category, details FROM audit_log WHERE user_id = ? ORDER BY timestamp DESC LIMIT 10').all(userId);
  const now    = Date.now();
  const entries = rows.map(r => {
    const label = r.details ? `${r.action} — ${r.details}` : r.action;
    const diff  = now - r.timestamp;
    const m     = Math.floor(diff / 60000);
    const timeAgo = m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
    const color = r.category === 'security' ? '#ef4444' : r.category === 'pipeline' ? '#10b981' : r.category === 'vps' ? '#3b82f6' : '#8b5cf6';
    return { action: label, category: r.category, time: timeAgo, color };
  });
  return res.json({ entries });
});

// ══════════════════════════════════════════════════════════════════════════════
// VPS ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /api/vps — add a server ─────────────────────────────────────────────
app.post('/api/vps', (req, res) => {
  const userId = req.authSession.user.id;
  const { id: slug, name, host, username, password, port, githubRepo, githubToken } = req.body;

  if (!slug || !host || !username)
    return res.status(400).json({ error: 'Required: id, host, username' });

  // Reject if slug already exists for this user
  const existing = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, slug);
  if (existing) return res.status(409).json({ error: `A VPS with id "${slug}" already exists` });

  const now          = Date.now();
  const encPassword  = password ? encrypt(password) : '';
  const cleanRepo    = cleanGithubRepo(githubRepo);

  const result = db.prepare(`
    INSERT INTO vps (user_id, slug, name, host, port, username, ssh_password, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'healthy', ?, ?)
  `).run(userId, slug, name || slug, host, port || 22, username, encPassword, now, now);

  const vpsId = result.lastInsertRowid;
  console.log(`✅ VPS created: id=${vpsId}, slug=${slug}, user=${userId}`);

  if (cleanRepo && githubToken) {
    try {
      db.prepare(`
        INSERT INTO vps_github_integrations (vps_id, user_id, github_repo, github_token, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(vpsId, userId, cleanRepo, encrypt(githubToken), now, now);
      console.log(`✅ GitHub integration added for VPS ${vpsId}: ${cleanRepo}`);
    } catch (e) {
      console.error(`⚠️  Failed to add GitHub integration for ${vpsId}:`, e.message);
    }
  }

  seedDefaultAlertRules(vpsId, userId);
  console.log(`✅ Default alert rules seeded for VPS ${vpsId}`);

  if (encPassword) {
    collectMetrics({ id: vpsId, user_id: userId, host, port: port || 22, username, ssh_password: encPassword, slug });
    collectLatency({ id: vpsId, user_id: userId, host, slug });
  }

  auditLog({ userId, action: 'VPS added', category: 'vps', details: `${slug} (${username}@${host})${cleanRepo ? ' | GitHub: ' + cleanRepo : ''}`, ip: getClientIp(req) });
  // Return properly formatted response matching frontend expectations
  res.status(201).json({ 
    success: true,
    message: 'VPS added successfully', 
    vps: { 
      id: slug, 
      name: name || slug, 
      host,
      status: 'healthy',
      sshConfigured: !!encPassword
    } 
  });
});

// ── POST /api/vps/test-connection — test SSH without creating a VPS ──────────
app.post('/api/vps/test-connection', async (req, res) => {
  const { host, port = 22, username, password } = req.body || {};
  if (!host || !username || !password) {
    return res.status(400).json({ ok: false, error: 'host, username and password are required for SSH test' });
  }

  try {
    const out = await runSSH({ host, port, username, password }, 'echo ok && hostname && uptime');
    return res.json({ ok: true, output: out });
  } catch (err) {
    return res.status(503).json({ ok: false, error: err.message });
  }
});

// ── GET /api/vps — list user's servers ───────────────────────────────────────
app.get('/api/vps', (req, res) => {
  try {
    const userId = req.authSession.user.id;
    const list = db.prepare("SELECT slug AS id, name, host, status, CASE WHEN ssh_password IS NOT NULL AND ssh_password != '' THEN 1 ELSE 0 END AS sshConfigured FROM vps WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC").all(userId);
    console.log(`📋 GET /api/vps: found ${list.length} VPS for user ${userId}`);
    res.json(list);
  } catch (err) {
    console.error('[GET /api/vps] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch VPS list' });
  }
});

// ── DELETE /api/vps/:id — hard delete (cascades to metrics, snapshots, etc.) ─
app.delete('/api/vps/:id', (req, res) => {
  try {
    const userId  = req.authSession.user.id;
    const slugRaw = req.params.id.trim();
    // Cherche aussi par name en fallback si le slug ne matche pas
    const row = db.prepare('SELECT id, slug FROM vps WHERE user_id = ? AND (slug = ? OR TRIM(slug) = ?) AND deleted_at IS NULL').get(userId, slugRaw, slugRaw);
    if (!row) {
      console.warn(`❌ DELETE /api/vps: VPS "${slugRaw}" not found for user ${userId}`);
      return res.status(404).json({ error: 'VPS introuvable' });
    }

    // Soft delete instead of hard delete to preserve audit trail
    db.prepare('UPDATE vps SET deleted_at = ? WHERE id = ?').run(Date.now(), row.id);
    console.log(`✅ VPS deleted (soft): id=${row.id}, slug=${row.slug}, user=${userId}`);
    
    auditLog({ userId, action: 'VPS removed', category: 'vps', details: req.params.id, ip: getClientIp(req) });
    res.json({ success: true, message: 'VPS removed', id: req.params.id });
  } catch (err) {
    console.error('[DELETE /api/vps] Error:', err.message);
    res.status(500).json({ error: 'Failed to delete VPS' });
  }
});

// ── PATCH /api/vps/:id/github — update expired/revoked GitHub token ──────────
app.patch('/api/vps/:id/github', (req, res) => {
  try {
    const userId = req.authSession.user.id;
    const vpsRow = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
    if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });

    const { token, repo } = req.body;
    if (!token?.trim()) return res.status(400).json({ error: 'token is required' });

    const encToken  = encrypt(token.trim());
    const now       = Date.now();
    const existing  = db.prepare('SELECT id FROM vps_github_integrations WHERE vps_id = ?').get(vpsRow.id);

    if (existing) {
      if (repo) {
        const cleanRepo = cleanGithubRepo(repo);
        db.prepare('UPDATE vps_github_integrations SET github_token = ?, github_repo = ?, updated_at = ? WHERE vps_id = ?').run(encToken, cleanRepo, now, vpsRow.id);
      } else {
        db.prepare('UPDATE vps_github_integrations SET github_token = ?, updated_at = ? WHERE vps_id = ?').run(encToken, now, vpsRow.id);
      }
    } else {
      const cleanRepo = cleanGithubRepo(repo);
      if (!cleanRepo) return res.status(400).json({ error: 'repo is required for first-time GitHub setup' });
      db.prepare('INSERT INTO vps_github_integrations (vps_id, user_id, github_repo, github_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(vpsRow.id, userId, cleanRepo, encToken, now, now);
    }

    auditLog({ userId, action: 'GitHub token updated', category: 'vps', details: req.params.id, ip: getClientIp(req) });
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/vps/github] Error:', err.message);
    res.status(500).json({ error: 'Failed to update GitHub token' });
  }
});

// ── POST /api/vps/:id/test ────────────────────────────────────────────────────
app.post('/api/vps/:id/test', async (req, res) => {
  const vps = getVpsBySlug(req.authSession.user.id, req.params.id);
  if (!vps) return res.status(404).json({ error: 'VPS not found' });
  if (!hasSshAccess(vps)) return res.status(400).json({ error: 'SSH is not configured for this VPS yet' });
  try {
    const out = await runSSH(vps, 'echo ok && hostname && uptime');
    res.json({ ok: true, output: out });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// REAL-TIME METRICS
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/metrics/:id', async (req, res) => {
  const vps = getVpsBySlug(req.authSession.user.id, req.params.id);
  if (!vps) return res.status(404).json({ error: 'VPS not found' });
  if (!hasSshAccess(vps)) return res.status(400).json({ error: 'SSH is not configured for this VPS yet' });

  try {
    const runtime = await collectRuntimeForVps(vps);
    if (runtime.mode === 'docker') {
      return res.json({
        vps: { id: vps.slug, name: vps.name, host: vps.host },
        mode: 'docker',
        containers: runtime.containers.map(c => ({
          name: c.name,
          cpu: `${c.cpu.toFixed(1)}%`,
          mem: `${c.mem.toFixed(0)}MiB`,
          memPerc: `${c.memPerc.toFixed(1)}%`,
          status: runtime.ps.find(p => p.name === c.name)?.status || 'unknown',
        })),
        ps: runtime.ps,
        timestamp: new Date().toISOString(),
      });
    }

    if (runtime.mode === 'host') {
      return res.json({
        vps: { id: vps.slug, name: vps.name, host: vps.host },
        mode: 'host',
        containers: [{ ...runtime.containers[0], status: runtime.ps[0]?.status || 'Up (host)' }],
        ps: runtime.ps,
        timestamp: new Date().toISOString(),
      });
    }

    return res.json({
      vps: { id: vps.slug, name: vps.name, host: vps.host },
      mode: 'none',
      containers: [],
      ps: [],
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// HISTORY ROUTES
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/history/:id/cpu', (req, res) => {
  const userId  = req.authSession.user.id;
  const vpsRow  = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });

  const rangeMs = rangeToMs(req.query.range || '24h');
  const since   = Date.now() - rangeMs;
  const rows    = db.prepare('SELECT timestamp, container, cpu FROM metrics WHERE vps_id = ? AND user_id = ? AND timestamp >= ? ORDER BY timestamp ASC').all(vpsRow.id, userId, since);

  if (!rows.length) return res.json({ points: [], containers: [] });

  const shortName  = s => s.replace(/mypresc-(staging|production|dev)-/, '');
  const containers = [...new Set(rows.map(r => r.container))];
  const grouped    = groupDataByInterval(rows, rangeMs);
  const points     = grouped.map(({ time, items }) => {
    const point = { time };
    containers.forEach(c => {
      const cItems = items.filter(i => i.container === c);
      point[shortName(c)] = cItems.length ? Math.round(cItems.reduce((s, i) => s + i.cpu, 0) / cItems.length * 10) / 10 : 0;
    });
    return point;
  });
  res.json({ points, containers: containers.map(shortName) });
});

app.get('/api/history/:id/memory', (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });

  const rangeMs = rangeToMs(req.query.range || '24h');
  const since   = Date.now() - rangeMs;
  const rows    = db.prepare('SELECT timestamp, SUM(mem_mb) AS total_mem FROM metrics WHERE vps_id = ? AND user_id = ? AND timestamp >= ? GROUP BY timestamp ORDER BY timestamp ASC').all(vpsRow.id, userId, since);

  if (!rows.length) return res.json({ points: [] });

  const grouped = groupDataByInterval(rows, rangeMs);
  const points  = grouped.map(({ time, items }) => ({
    time,
    v: Math.round(items.reduce((s, i) => s + i.total_mem, 0) / items.length / 1024 * 100) / 100,
  }));
  res.json({ points });
});

app.get('/api/history/:id/latency', (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });

  const rangeMs = rangeToMs(req.query.range || '24h');
  const since   = Date.now() - rangeMs;
  const rows    = db.prepare('SELECT timestamp, ms, status, ok FROM latency_history WHERE vps_id = ? AND user_id = ? AND timestamp >= ? ORDER BY timestamp ASC').all(vpsRow.id, userId, since);

  if (!rows.length) return res.json({ points: [], avg: 0, p95: 0, uptime: 100 });

  const grouped = groupDataByInterval(rows, rangeMs);
  const points  = grouped.map(({ time, items }) => {
    const okItems = items.filter(i => i.ok);
    return { time, ms: okItems.length ? Math.round(okItems.reduce((s, i) => s + i.ms, 0) / okItems.length) : null, ok: okItems.length > 0 };
  });

  const allMs  = rows.filter(r => r.ok).map(r => r.ms).sort((a, b) => a - b);
  const avg    = allMs.length ? Math.round(allMs.reduce((s, v) => s + v, 0) / allMs.length) : 0;
  const p95    = allMs.length ? allMs[Math.floor(allMs.length * 0.95)] ?? 0 : 0;
  const uptime = rows.length  ? Math.round(rows.filter(r => r.ok).length / rows.length * 1000) / 10 : 100;
  res.json({ points, avg, p95, uptime });
});

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 5 — LIVE RESPONSE TIME (read-only — no write to latency_history)
// Writing latency data is exclusively the job of the periodic collectAll().
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/response-time/:id', async (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id, host FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });

  const [live, rows] = await Promise.all([
    pingHttp(vpsRow.host),
    Promise.resolve(
      db.prepare('SELECT timestamp, ms, ok FROM latency_history WHERE vps_id = ? AND user_id = ? AND timestamp >= ? ORDER BY timestamp ASC').all(vpsRow.id, userId, Date.now() - 3_600_000)
    ),
  ]);

  // PHASE 5: removed insertLatency here — only the scheduler writes latency data

  const allMs = rows.filter(r => r.ok).map(r => r.ms).sort((a, b) => a - b);
  const avg   = allMs.length ? Math.round(allMs.reduce((s, v) => s + v, 0) / allMs.length) : live.ms;
  const p95   = allMs.length ? allMs[Math.floor(allMs.length * 0.95)] ?? 0 : live.ms;

  const buckets = {};
  rows.forEach(r => {
    const d = new Date(r.timestamp);
    d.setSeconds(0, 0); d.setMinutes(Math.floor(d.getMinutes() / 5) * 5);
    (buckets[d.toISOString()] ??= []).push(r);
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
  const vps = getVpsBySlug(req.authSession.user.id, req.params.id);
  if (!vps) return res.status(404).json({ error: 'VPS not found' });
  if (!hasSshAccess(vps)) return res.status(400).json({ error: 'SSH is not configured for this VPS yet' });
  const lines = Math.min(parseInt(req.query.lines) || 50, 500);
  try {
    const namesRaw = await runSSH(vps, "docker ps --format '{{.Names}}' 2>&1");
    const names = splitLines(namesRaw);
    if (looksLikeDockerUnavailable(namesRaw) || names.length === 0) {
      const systemRaw = await runSSH(vps, `journalctl -n ${lines} --no-pager 2>/dev/null || tail -n ${lines} /var/log/syslog 2>/dev/null || tail -n ${lines} /var/log/messages 2>/dev/null || echo ""`);
      const logs = splitLines(systemRaw).map(line => ({
        container: 'system',
        timestamp: new Date().toISOString(),
        message: line,
        level: detectLogLevel(line),
      })).slice(-200).reverse();
      return res.json({ logs, timestamp: new Date().toISOString() });
    }

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
  const vps = getVpsBySlug(req.authSession.user.id, req.params.id);
  if (!vps) return res.status(404).json({ error: 'VPS not found' });
  if (!hasSshAccess(vps)) return res.status(400).json({ error: 'SSH is not configured for this VPS yet' });
  try {
    if (req.params.container === 'system' || req.params.container === 'host-system') {
      const lines = Math.min(parseInt(req.query.lines) || 100, 1000);
      const raw = await runSSH(vps, `journalctl -n ${lines} --no-pager 2>/dev/null || tail -n ${lines} /var/log/syslog 2>/dev/null || tail -n ${lines} /var/log/messages 2>/dev/null || echo ""`);
      const logs = splitLines(raw).map(line => ({
        container: 'system',
        timestamp: new Date().toISOString(),
        message: line,
        level: detectLogLevel(line),
      }));
      return res.json({ logs, container: 'system' });
    }

    const raw  = await runSSH(vps, `docker logs --tail ${Math.min(parseInt(req.query.lines) || 100, 1000)} --timestamps ${req.params.container} 2>&1`);
    const logs = raw.split('\n').filter(Boolean).map(line => {
      const m = line.match(/^(\S+)\s+(.+)$/);
      return { container: req.params.container, timestamp: m?.[1] || new Date().toISOString(), message: m?.[2] || line, level: detectLogLevel(m?.[2] || line) };
    });
    res.json({ logs, container: req.params.container });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ALERTS — thresholds loaded from alert_rules table
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/alerts/:id', async (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });

  const vps = getVpsBySlug(userId, req.params.id);
  if (!hasSshAccess(vps)) return res.status(400).json({ error: 'SSH is not configured for this VPS yet' });
  const rules = db.prepare('SELECT * FROM alert_rules WHERE vps_id = ? AND enabled = 1').all(vpsRow.id);

  // Index rules by metric, sorted by threshold desc (most severe first)
  const cpuRules  = rules.filter(r => r.metric === 'cpu').sort((a, b) => b.threshold - a.threshold);
  const memRules  = rules.filter(r => r.metric === 'memory').sort((a, b) => b.threshold - a.threshold);
  const downRule  = rules.find(r => r.metric === 'container_down');

  // Fallback to defaults if no rules seeded
  const cpuRulesFinal = cpuRules.length ? cpuRules : [
    { condition: 'gt', threshold: 80, severity: 'critical' },
    { condition: 'gt', threshold: 50, severity: 'warning'  },
  ];
  const memRulesFinal = memRules.length ? memRules : [
    { condition: 'gt', threshold: 85, severity: 'critical' },
    { condition: 'gt', threshold: 70, severity: 'warning'  },
  ];

  try {
    const runtime = await collectRuntimeForVps(vps);
    const containers = runtime.containers;
    const ps = runtime.ps;

    const alerts = [];
    const now    = new Date().toISOString();
    const short  = s => s.replace(/mypresc-(staging|production|dev)-/, '');

    containers.forEach(c => {
      const s       = short(c.name);
      const cpu     = parseCpu(c.cpu);
      const mem     = parseCpu(c.memPerc);
      const memUsed = c.mem.split('/')[0].trim();

      for (const rule of cpuRulesFinal) {
        if (rule.condition === 'gt' && cpu > rule.threshold) {
          alerts.push({ id: `cpu-${rule.severity[0]}-${c.name}`, type: rule.severity, title: `${s} CPU ${rule.severity === 'critical' ? 'Critical' : 'High'}`, message: `CPU at ${cpu.toFixed(1)}%`, container: s, value: cpu, timestamp: now });
          break;
        }
      }
      for (const rule of memRulesFinal) {
        if (rule.condition === 'gt' && mem > rule.threshold) {
          alerts.push({ id: `mem-${rule.severity[0]}-${c.name}`, type: rule.severity, title: `${s} Memory ${rule.severity === 'critical' ? 'Critical' : 'Warning'}`, message: `Memory at ${mem.toFixed(1)}% (${memUsed})`, container: s, value: mem, timestamp: now });
          break;
        }
      }
    });

    if (downRule || !rules.length) {
      ps.forEach(p => {
        if (!p.status.includes('Up')) {
          alerts.push({ id: `down-${p.name}`, type: 'critical', title: `${short(p.name)} Down`, message: `Status: ${p.status}`, container: short(p.name), value: 0, timestamp: now });
        }
      });
    }

    if (runtime.mode !== 'docker') {
      const host = await getHostRuntimeSnapshot(vps);
      if (host) {
        const cpu = parseCpu(host.container.cpu);
        const mem = parseCpu(host.container.memPerc);
        for (const rule of cpuRulesFinal) {
          if (rule.condition === 'gt' && cpu > rule.threshold) {
            alerts.push({ id: `cpu-${rule.severity[0]}-host-system`, type: rule.severity, title: `host-system CPU ${rule.severity === 'critical' ? 'Critical' : 'High'}`, message: `CPU at ${cpu.toFixed(1)}%`, container: 'host-system', value: cpu, timestamp: now });
            break;
          }
        }
        for (const rule of memRulesFinal) {
          if (rule.condition === 'gt' && mem > rule.threshold) {
            alerts.push({ id: `mem-${rule.severity[0]}-host-system`, type: rule.severity, title: `host-system Memory ${rule.severity === 'critical' ? 'Critical' : 'Warning'}`, message: `Memory at ${mem.toFixed(1)}%`, container: 'host-system', value: mem, timestamp: now });
            break;
          }
        }
      }
    }

    res.json({ alerts, count: alerts.length, critical: alerts.filter(a => a.type === 'critical').length, warning: alerts.filter(a => a.type === 'warning').length, timestamp: now });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// PIPELINE — GitHub Actions (user-scoped via vps + vps_github_integrations)
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/pipeline/:id', async (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });

  const github = getGithub(vpsRow.id);
  if (!github) return res.status(400).json({ error: 'GitHub not configured for this VPS' });

  try {
    const { default: fetch } = await import('node-fetch');
    const headers = { 'Authorization': `Bearer ${github.token}`, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };

    const [workflowsRes, runsRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${github.github_repo}/actions/workflows`, { headers }),
      fetch(`https://api.github.com/repos/${github.github_repo}/actions/runs?per_page=10`, { headers }),
    ]);
    if (!workflowsRes.ok) throw new Error(`GitHub API: ${workflowsRes.status}`);

    const workflowsData = await workflowsRes.json();
    const runsData      = await runsRes.json();
    const runs          = runsData.workflow_runs || [];

    let jobs = [];
    if (runs.length > 0) {
      const jobsRes  = await fetch(`https://api.github.com/repos/${github.github_repo}/actions/runs/${runs[0].id}/jobs`, { headers });
      const jobsData = await jobsRes.json();
      jobs = jobsData.jobs || [];
    }

    const totalRuns   = runs.length;
    const successRuns = runs.filter(r => r.conclusion === 'success').length;
    const successRate = totalRuns ? Math.round((successRuns / totalRuns) * 100) : 0;
    const avgDuration = runs.filter(r => r.run_started_at && r.updated_at && r.conclusion).reduce((sum, r) => sum + (new Date(r.updated_at) - new Date(r.run_started_at)), 0) / Math.max(1, runs.filter(r => r.conclusion).length);

    res.json({
      repo:      github.github_repo,
      workflows: workflowsData.workflows || [],
      runs:      runs.map(r => ({ id: r.id, name: r.name, status: r.status, conclusion: r.conclusion, branch: r.head_branch, commit: r.head_sha?.slice(0, 7), commitMsg: r.head_commit?.message?.split('\n')[0] || '', actor: r.actor?.login || '', createdAt: r.created_at, updatedAt: r.updated_at, duration: r.run_started_at && r.updated_at ? Math.round((new Date(r.updated_at) - new Date(r.run_started_at)) / 1000) : 0, url: r.html_url })),
      jobs:      jobs.map(j => ({ id: j.id, name: j.name, status: j.status, conclusion: j.conclusion, startedAt: j.started_at, completedAt: j.completed_at, duration: j.started_at && j.completed_at ? Math.round((new Date(j.completed_at) - new Date(j.started_at)) / 1000) : 0, steps: (j.steps || []).map(s => ({ name: s.name, status: s.status, conclusion: s.conclusion, number: s.number, duration: s.started_at && s.completed_at ? Math.round((new Date(s.completed_at) - new Date(s.started_at)) / 1000) : 0 })) })),
      stats:     { totalRuns, successRuns, successRate, avgDurationSec: Math.round(avgDuration / 1000) },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[pipeline/${req.params.id}]`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pipeline/:id/trigger', async (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });

  const github = getGithub(vpsRow.id);
  if (!github) return res.status(400).json({ error: 'GitHub not configured for this VPS' });

  const { workflow, branch = 'main', inputs = {} } = req.body;
  if (!workflow) return res.status(400).json({ error: 'workflow is required (e.g. deploy.yml)' });

  try {
    const { default: fetch } = await import('node-fetch');
    const r = await fetch(`https://api.github.com/repos/${github.github_repo}/actions/workflows/${workflow}/dispatches`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${github.token}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
      body:    JSON.stringify({ ref: branch, inputs }),
    });
    if (r.status === 204) {
      auditLog({ userId, action: 'Pipeline triggered', category: 'pipeline', details: `${github.github_repo} — ${workflow} on ${branch}`, ip: getClientIp(req) });
      res.json({ ok: true, message: `Workflow ${workflow} triggered on ${branch}` });
    } else {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.message || `GitHub API: ${r.status}`);
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/pipeline/:id/rerun/:runId', async (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });

  const github = getGithub(vpsRow.id);
  if (!github) return res.status(400).json({ error: 'GitHub not configured for this VPS' });

  try {
    const { default: fetch } = await import('node-fetch');
    const r = await fetch(`https://api.github.com/repos/${github.github_repo}/actions/runs/${req.params.runId}/rerun`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${github.token}`, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (r.status === 201) {
      auditLog({ userId, action: 'Pipeline rerun', category: 'pipeline', details: `run ${req.params.runId}`, ip: getClientIp(req) });
      res.json({ ok: true });
    } else {
      throw new Error(`GitHub API: ${r.status}`);
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 4 — SETTINGS ENDPOINTS
// All scoped to req.authSession.user.id — no global state.
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/settings ─────────────────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  const settings = stmtSelectUserSettings.get(req.authSession.user.id);
  if (!settings) return res.status(404).json({ error: 'Settings not found' });
  res.json({
    discordWebhook: settings.discord_webhook,
    slackWebhook:   settings.slack_webhook,
    notifyDeploy:   !!settings.notify_deploy,
    notifyFailure:  !!settings.notify_failure,
    notifyRollback: !!settings.notify_rollback,
    sshAccess:      !!settings.ssh_access,
    apiToken:       settings.api_token,
  });
});

// ── POST /api/settings ────────────────────────────────────────────────────────
app.post('/api/settings', (req, res) => {
  const userId = req.authSession.user.id;
  const settings = stmtSelectUserSettings.get(userId);
  if (!settings) return res.status(404).json({ error: 'Settings not found' });

  const { discordWebhook, slackWebhook, notifyDeploy, notifyFailure, notifyRollback, sshAccess } = req.body;

  // Only update a webhook if a new value was explicitly provided
  const newDiscord = (typeof discordWebhook === 'string' && discordWebhook.trim()) ? discordWebhook.trim() : settings.discord_webhook;
  const newSlack   = (typeof slackWebhook   === 'string' && slackWebhook.trim())   ? slackWebhook.trim()   : settings.slack_webhook;

  stmtUpdateUserSettings.run(
    newDiscord,
    newSlack,
    notifyDeploy    !== undefined ? (notifyDeploy    ? 1 : 0) : settings.notify_deploy,
    notifyFailure   !== undefined ? (notifyFailure   ? 1 : 0) : settings.notify_failure,
    notifyRollback  !== undefined ? (notifyRollback  ? 1 : 0) : settings.notify_rollback,
    sshAccess       !== undefined ? (sshAccess       ? 1 : 0) : settings.ssh_access,
    Date.now(),
    userId
  );

  auditLog({ userId, action: 'Settings updated', category: 'settings', ip: getClientIp(req) });
  res.json({ ok: true });
});

// ── POST /api/settings/test-discord ──────────────────────────────────────────
app.post('/api/settings/test-discord', async (req, res) => {
  const userId   = req.authSession.user.id;
  const settings = stmtSelectUserSettings.get(userId);
  const url      = (req.body?.webhook?.trim()) || settings?.discord_webhook;

  if (!url) return res.status(400).json({ ok: false, error: 'No Discord webhook configured' });

  try {
    const { default: fetch } = await import('node-fetch');
    const r = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ content: '✅ Test notification from **MyPresc Deploy** — connection verified.' }),
    });
    if (r.ok || r.status === 204) {
      auditLog({ userId, action: 'Discord webhook tested', category: 'integration', ip: getClientIp(req) });
      return res.json({ ok: true });
    }
    return res.json({ ok: false, error: `Discord returned HTTP ${r.status}` });
  } catch (err) {
    return res.json({ ok: false, error: err.message });
  }
});

// ── POST /api/settings/test-slack ────────────────────────────────────────────
app.post('/api/settings/test-slack', async (req, res) => {
  const userId   = req.authSession.user.id;
  const settings = stmtSelectUserSettings.get(userId);
  const url      = (req.body?.webhook?.trim()) || settings?.slack_webhook;

  if (!url) return res.status(400).json({ ok: false, error: 'No Slack webhook configured' });

  try {
    const { default: fetch } = await import('node-fetch');
    const r = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text: '✅ Test notification from *MyPresc Deploy* — connection verified.' }),
    });
    if (r.ok) {
      auditLog({ userId, action: 'Slack webhook tested', category: 'integration', ip: getClientIp(req) });
      return res.json({ ok: true });
    }
    return res.json({ ok: false, error: `Slack returned HTTP ${r.status}` });
  } catch (err) {
    return res.json({ ok: false, error: err.message });
  }
});

// ── POST /api/settings/regenerate-token ──────────────────────────────────────
app.post('/api/settings/regenerate-token', (req, res) => {
  const userId   = req.authSession.user.id;
  const newToken = crypto.randomBytes(32).toString('hex');
  stmtUpdateApiToken.run(newToken, Date.now(), userId);
  auditLog({ userId, action: 'API token regenerated', category: 'security', ip: getClientIp(req) });
  res.json({ token: newToken });
});

// ── POST /api/settings/reset ──────────────────────────────────────────────────
app.post('/api/settings/reset', (req, res) => {
  const userId   = req.authSession.user.id;
  const newToken = crypto.randomBytes(32).toString('hex');
  stmtUpdateUserSettings.run('', '', 0, 1, 1, 1, Date.now(), userId);
  stmtUpdateApiToken.run(newToken, Date.now(), userId);
  auditLog({ userId, action: 'Settings reset to defaults', category: 'settings', ip: getClientIp(req) });
  res.json({ ok: true });
});

// ── GET /api/settings/audit-log ───────────────────────────────────────────────
app.get('/api/settings/audit-log', (req, res) => {
  const userId = req.authSession.user.id;
  const limit  = Math.min(parseInt(req.query.limit) || 20, 100);
  const rows   = db.prepare('SELECT id, timestamp, action, category, details, ip, success FROM audit_log WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?').all(userId, limit);
  const entries = rows.map(r => ({
    ...r,
    timeAgo: (() => {
      const diff = Date.now() - r.timestamp;
      const m    = Math.floor(diff / 60000);
      if (m < 1)  return 'just now';
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      return `${Math.floor(h / 24)}d ago`;
    })(),
  }));
  res.json({ entries });
});

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — VPS TOOL & PROJECT DETECTION
// ══════════════════════════════════════════════════════════════════════════════

const DETECTION_COMMANDS = [
  { tool: 'docker',          cmd: 'command -v docker >/dev/null 2>&1 && docker --version 2>/dev/null || echo "NOT_FOUND"' },
  { tool: 'docker-compose',  cmd: '(command -v docker >/dev/null 2>&1 && docker compose version 2>/dev/null) || (command -v docker-compose >/dev/null 2>&1 && docker-compose --version 2>/dev/null) || echo "NOT_FOUND"' },
  { tool: 'kubectl',         cmd: '(command -v kubectl >/dev/null 2>&1 && kubectl version --client 2>/dev/null) || (command -v microk8s >/dev/null 2>&1 && microk8s kubectl version --client 2>/dev/null) || (command -v k3s >/dev/null 2>&1 && k3s kubectl version --client 2>/dev/null) || echo "NOT_FOUND"' },
  { tool: 'k3s',             cmd: 'command -v k3s >/dev/null 2>&1 && k3s --version 2>/dev/null | head -1 || echo "NOT_FOUND"' },
  { tool: 'microk8s',        cmd: 'command -v microk8s >/dev/null 2>&1 && microk8s version 2>/dev/null | head -1 || echo "NOT_FOUND"' },
  { tool: 'nginx',           cmd: 'nginx -v 2>&1 || echo "NOT_FOUND"' },
  { tool: 'nginx-status',    cmd: '(command -v systemctl >/dev/null 2>&1 && systemctl is-active nginx 2>/dev/null) || (pgrep -x nginx >/dev/null 2>&1 && echo "active") || echo "NOT_FOUND"' },
  { tool: 'gitlab-runner',   cmd: 'gitlab-runner --version 2>/dev/null || echo "NOT_FOUND"' },
  { tool: 'jenkins',         cmd: '(command -v systemctl >/dev/null 2>&1 && systemctl is-active jenkins 2>/dev/null) || pgrep -f jenkins 2>/dev/null || echo "NOT_FOUND"' },
  { tool: 'ansible',         cmd: 'ansible --version 2>/dev/null | head -1 || echo "NOT_FOUND"' },
  { tool: 'terraform',       cmd: 'terraform version 2>/dev/null | head -1 || echo "NOT_FOUND"' },
  { tool: 'prometheus',      cmd: '(command -v systemctl >/dev/null 2>&1 && systemctl is-active prometheus 2>/dev/null) || pgrep -f prometheus 2>/dev/null || echo "NOT_FOUND"' },
  { tool: 'node',            cmd: 'node --version 2>/dev/null || echo "NOT_FOUND"' },
  { tool: 'python3',         cmd: '(python3 --version 2>/dev/null || python --version 2>/dev/null) || echo "NOT_FOUND"' },
  { tool: 'java',            cmd: 'java -version 2>&1 | head -1 || echo "NOT_FOUND"' },
  { tool: 'php',             cmd: 'php --version 2>/dev/null | head -1 || echo "NOT_FOUND"' },
];

const PROJECT_COMMANDS = [
  'ls /var/www/ 2>/dev/null || echo "NOT_FOUND"',
  'ls /opt/ 2>/dev/null || echo "NOT_FOUND"',
  'find /home -name "docker-compose.yml" 2>/dev/null | head -10 || echo "NOT_FOUND"',
  'find /opt -name "docker-compose.yml" 2>/dev/null | head -10 || echo "NOT_FOUND"',
  'find /var/www -name "package.json" -maxdepth 3 2>/dev/null | head -10 || echo "NOT_FOUND"',
  'find /var/www -name "requirements.txt" -maxdepth 3 2>/dev/null | head -10 || echo "NOT_FOUND"',
  'find /var/www -name "pom.xml" -maxdepth 3 2>/dev/null | head -10 || echo "NOT_FOUND"',
];

const SCAN_CACHE_MS = 6 * 60 * 60 * 1000; // 6h

function getVpsRowById(userId, vpsId) {
  const row = db.prepare('SELECT * FROM vps WHERE user_id = ? AND id = ? AND deleted_at IS NULL').get(userId, vpsId);
  if (!row) return null;
  return { ...row, password: decrypt(row.ssh_password) };
}

async function runDetection(vpsRow, userId, vpsId) {
  const password = decrypt(vpsRow.ssh_password);
  const vps = { ...vpsRow, password };
  const upsertTool = db.prepare(`
    INSERT INTO vps_detected_tools (user_id, vps_id, tool_name, tool_version, is_active, raw_output, detected_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, vps_id, tool_name) DO UPDATE SET
      tool_version = excluded.tool_version,
      is_active    = excluded.is_active,
      raw_output   = excluded.raw_output,
      detected_at  = CURRENT_TIMESTAMP
  `);

  for (const { tool, cmd } of DETECTION_COMMANDS) {
    try {
      const out = await runSSH(vps, cmd);
      const found = !out.includes('NOT_FOUND') && out.trim().length > 0;
      const version = found ? out.trim().split('\n')[0].slice(0, 200) : null;
      upsertTool.run(userId, vpsId, tool, version, found ? 1 : 0, out.trim().slice(0, 500));
    } catch { upsertTool.run(userId, vpsId, tool, null, 0, 'SSH error'); }
  }

  // Detect projects
  db.prepare('DELETE FROM vps_detected_projects WHERE user_id = ? AND vps_id = ?').run(userId, vpsId);
  const insertProject = db.prepare(`
    INSERT INTO vps_detected_projects (user_id, vps_id, project_name, project_path, project_type, tech_stack, is_running)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `);

  try {
    const composeFiles = await runSSH(vps, 'find /home /opt /var/www -name "docker-compose.yml" 2>/dev/null | head -20 || echo ""');
    for (const p of composeFiles.split('\n').filter(l => l && !l.includes('NOT_FOUND'))) {
      const dir  = p.replace('/docker-compose.yml', '');
      const name = dir.split('/').pop() || dir;
      insertProject.run(userId, vpsId, name, dir, 'docker-compose', 'Docker', 0);
    }
  } catch {}

  try {
    const pkgFiles = await runSSH(vps, 'find /home /opt /var/www -maxdepth 5 -name "package.json" 2>/dev/null | head -20 || echo ""');
    for (const p of pkgFiles.split('\n').filter(l => l && !l.includes('NOT_FOUND'))) {
      const dir  = p.replace('/package.json', '');
      const name = dir.split('/').pop() || dir;
      insertProject.run(userId, vpsId, name, dir, 'nodejs', 'Node.js', 0);
    }
  } catch {}

  try {
    const reqFiles = await runSSH(vps, 'find /home /opt /var/www -maxdepth 5 -name "requirements.txt" 2>/dev/null | head -20 || echo ""');
    for (const p of reqFiles.split('\n').filter(l => l && !l.includes('NOT_FOUND'))) {
      const dir  = p.replace('/requirements.txt', '');
      const name = dir.split('/').pop() || dir;
      insertProject.run(userId, vpsId, name, dir, 'python', 'Python', 0);
    }
  } catch {}
}

// GET /api/vps/:id/detected-tools
app.get('/api/vps/:id/detected-tools', (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });
  const tools = db.prepare('SELECT * FROM vps_detected_tools WHERE user_id = ? AND vps_id = ? ORDER BY tool_name').all(userId, vpsRow.id);
  res.json({ tools });
});

// GET /api/vps/:id/detected-projects
app.get('/api/vps/:id/detected-projects', (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });
  const projects = db.prepare('SELECT * FROM vps_detected_projects WHERE user_id = ? AND vps_id = ? ORDER BY project_name').all(userId, vpsRow.id);
  res.json({ projects });
});

// POST /api/vps/:id/detect — trigger full scan
app.post('/api/vps/:id/detect', async (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT * FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });
  if (!hasSshAccess(vpsRow)) return res.status(400).json({ error: 'SSH not configured' });

  // Check cache (skip if scanned recently)
  const last = db.prepare('SELECT detected_at FROM vps_detected_tools WHERE vps_id = ? ORDER BY detected_at DESC LIMIT 1').get(vpsRow.id);
  const force = req.body?.force === true;
  if (!force && last) {
    const age = Date.now() - new Date(last.detected_at).getTime();
    if (age < SCAN_CACHE_MS) {
      const tools    = db.prepare('SELECT * FROM vps_detected_tools WHERE user_id = ? AND vps_id = ?').all(userId, vpsRow.id);
      const projects = db.prepare('SELECT * FROM vps_detected_projects WHERE user_id = ? AND vps_id = ?').all(userId, vpsRow.id);
      return res.json({ cached: true, tools, projects });
    }
  }

  try {
    await runDetection(vpsRow, userId, vpsRow.id);
    const tools    = db.prepare('SELECT * FROM vps_detected_tools WHERE user_id = ? AND vps_id = ?').all(userId, vpsRow.id);
    const projects = db.prepare('SELECT * FROM vps_detected_projects WHERE user_id = ? AND vps_id = ?').all(userId, vpsRow.id);
    auditLog({ userId, action: 'VPS tool scan', category: 'vps', details: req.params.id, ip: getClientIp(req) });
    res.json({ cached: false, tools, projects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — GITLAB CI/CD INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/vps/:id/gitlab/connect
app.post('/api/vps/:id/gitlab/connect', (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });
  const { gitlab_url, project_id, token } = req.body || {};
  if (!gitlab_url || !project_id || !token) return res.status(400).json({ error: 'gitlab_url, project_id and token are required' });
  const enc = encrypt(token);
  db.prepare(`
    INSERT INTO gitlab_integrations (user_id, vps_id, gitlab_url, project_id, token_encrypted)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT DO NOTHING
  `).run(userId, vpsRow.id, gitlab_url, project_id, enc);
  auditLog({ userId, action: 'GitLab connected', category: 'integration', details: project_id, ip: getClientIp(req) });
  res.json({ ok: true });
});

// GET /api/vps/:id/gitlab/pipelines
app.get('/api/vps/:id/gitlab/pipelines', async (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });
  const gl = db.prepare('SELECT * FROM gitlab_integrations WHERE user_id = ? AND vps_id = ? AND enabled = 1').get(userId, vpsRow.id);
  if (!gl) return res.json({ available: false });
  try {
    const { default: fetch } = await import('node-fetch');
    const token = decrypt(gl.token_encrypted);
    const r = await fetch(`${gl.gitlab_url}/api/v4/projects/${encodeURIComponent(gl.project_id)}/pipelines?per_page=10`, {
      headers: { 'PRIVATE-TOKEN': token },
    });
    if (!r.ok) return res.json({ available: false, error: `GitLab API: ${r.status}` });
    const pipelines = await r.json();
    res.json({ available: true, pipelines });
  } catch (err) { res.json({ available: false, error: err.message }); }
});

// GET /api/vps/:id/gitlab/pipelines/:pid
app.get('/api/vps/:id/gitlab/pipelines/:pid', async (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });
  const gl = db.prepare('SELECT * FROM gitlab_integrations WHERE user_id = ? AND vps_id = ? AND enabled = 1').get(userId, vpsRow.id);
  if (!gl) return res.json({ available: false });
  try {
    const { default: fetch } = await import('node-fetch');
    const token = decrypt(gl.token_encrypted);
    const r = await fetch(`${gl.gitlab_url}/api/v4/projects/${encodeURIComponent(gl.project_id)}/pipelines/${req.params.pid}`, {
      headers: { 'PRIVATE-TOKEN': token },
    });
    if (!r.ok) return res.json({ available: false, error: `GitLab API: ${r.status}` });
    res.json({ available: true, pipeline: await r.json() });
  } catch (err) { res.json({ available: false, error: err.message }); }
});

// POST /api/vps/:id/gitlab/pipelines/:pid/retry
app.post('/api/vps/:id/gitlab/pipelines/:pid/retry', async (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });
  const gl = db.prepare('SELECT * FROM gitlab_integrations WHERE user_id = ? AND vps_id = ? AND enabled = 1').get(userId, vpsRow.id);
  if (!gl) return res.json({ available: false });
  try {
    const { default: fetch } = await import('node-fetch');
    const token = decrypt(gl.token_encrypted);
    const r = await fetch(`${gl.gitlab_url}/api/v4/projects/${encodeURIComponent(gl.project_id)}/pipelines/${req.params.pid}/retry`, {
      method: 'POST',
      headers: { 'PRIVATE-TOKEN': token },
    });
    if (!r.ok) return res.json({ ok: false, error: `GitLab API: ${r.status}` });
    auditLog({ userId, action: 'GitLab pipeline retry', category: 'integration', details: req.params.pid, ip: getClientIp(req) });
    res.json({ ok: true, pipeline: await r.json() });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

// GET /api/vps/:id/gitlab/runner-status
app.get('/api/vps/:id/gitlab/runner-status', async (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });
  const tool = db.prepare("SELECT * FROM vps_detected_tools WHERE user_id = ? AND vps_id = ? AND tool_name = 'gitlab-runner'").get(userId, vpsRow.id);
  if (!tool || !tool.is_active) return res.json({ available: false });
  const vps = getVpsBySlug(userId, req.params.id);
  if (!hasSshAccess(vps)) return res.json({ available: false });
  try {
    const out = await runSSH(vps, 'systemctl is-active gitlab-runner 2>/dev/null || echo "unknown"');
    res.json({ available: true, status: out.trim() });
  } catch { res.json({ available: false }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — KUBERNETES (READ-ONLY via SSH)
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/vps/:id/k8s/overview
app.get('/api/vps/:id/k8s/overview', async (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });
  const tool = db.prepare("SELECT * FROM vps_detected_tools WHERE user_id = ? AND vps_id = ? AND tool_name IN ('kubectl','k3s','microk8s') AND is_active = 1 LIMIT 1").get(userId, vpsRow.id);
  if (!tool) return res.json({ available: false });
  const vps = getVpsBySlug(userId, req.params.id);
  if (!hasSshAccess(vps)) return res.json({ available: false });
  try {
    const [nodes, pods, deploys, svcs] = await Promise.all([
      runSSH(vps, 'kubectl get nodes --no-headers 2>/dev/null || echo "NOT_FOUND"'),
      runSSH(vps, 'kubectl get pods -A --no-headers 2>/dev/null | head -30 || echo "NOT_FOUND"'),
      runSSH(vps, 'kubectl get deployments -A --no-headers 2>/dev/null | head -20 || echo "NOT_FOUND"'),
      runSSH(vps, 'kubectl get services -A --no-headers 2>/dev/null | head -20 || echo "NOT_FOUND"'),
    ]);
    const snap = { nodes_json: nodes, pods_json: pods, deployments_json: deploys, services_json: svcs };
    db.prepare('INSERT INTO k8s_snapshots (user_id, vps_id, nodes_json, pods_json, deployments_json, services_json) VALUES (?, ?, ?, ?, ?, ?)').run(userId, vpsRow.id, nodes, pods, deploys, svcs);
    res.json({ available: true, ...snap });
  } catch (err) { res.json({ available: false, error: err.message }); }
});

// GET /api/vps/:id/k8s/pods
app.get('/api/vps/:id/k8s/pods', async (req, res) => {
  const userId = req.authSession.user.id;
  const vps = getVpsBySlug(userId, req.params.id);
  if (!vps) return res.status(404).json({ error: 'VPS not found' });
  const tool = db.prepare("SELECT * FROM vps_detected_tools WHERE user_id = ? AND vps_id = ? AND tool_name IN ('kubectl','k3s','microk8s') AND is_active = 1 LIMIT 1").get(userId, vps.id);
  if (!tool) return res.json({ available: false });
  if (!hasSshAccess(vps)) return res.json({ available: false });
  try {
    const out = await runSSH(vps, 'kubectl get pods -A -o json 2>/dev/null || echo "{}"');
    res.json({ available: true, raw: out });
  } catch (err) { res.json({ available: false, error: err.message }); }
});

// GET /api/vps/:id/k8s/deployments
app.get('/api/vps/:id/k8s/deployments', async (req, res) => {
  const userId = req.authSession.user.id;
  const vps = getVpsBySlug(userId, req.params.id);
  if (!vps) return res.status(404).json({ error: 'VPS not found' });
  const tool = db.prepare("SELECT * FROM vps_detected_tools WHERE user_id = ? AND vps_id = ? AND tool_name IN ('kubectl','k3s','microk8s') AND is_active = 1 LIMIT 1").get(userId, vps.id);
  if (!tool) return res.json({ available: false });
  if (!hasSshAccess(vps)) return res.json({ available: false });
  try {
    const out = await runSSH(vps, 'kubectl get deployments -A -o json 2>/dev/null || echo "{}"');
    res.json({ available: true, raw: out });
  } catch (err) { res.json({ available: false, error: err.message }); }
});

// GET /api/vps/:id/k8s/services
app.get('/api/vps/:id/k8s/services', async (req, res) => {
  const userId = req.authSession.user.id;
  const vps = getVpsBySlug(userId, req.params.id);
  if (!vps) return res.status(404).json({ error: 'VPS not found' });
  const tool = db.prepare("SELECT * FROM vps_detected_tools WHERE user_id = ? AND vps_id = ? AND tool_name IN ('kubectl','k3s','microk8s') AND is_active = 1 LIMIT 1").get(userId, vps.id);
  if (!tool) return res.json({ available: false });
  if (!hasSshAccess(vps)) return res.json({ available: false });
  try {
    const out = await runSSH(vps, 'kubectl get services -A -o json 2>/dev/null || echo "{}"');
    res.json({ available: true, raw: out });
  } catch (err) { res.json({ available: false, error: err.message }); }
});

// GET /api/vps/:id/k8s/logs/:namespace/:pod
app.get('/api/vps/:id/k8s/logs/:namespace/:pod', async (req, res) => {
  const userId = req.authSession.user.id;
  const vps = getVpsBySlug(userId, req.params.id);
  if (!vps) return res.status(404).json({ error: 'VPS not found' });
  if (!hasSshAccess(vps)) return res.json({ available: false });
  try {
    const out = await runSSH(vps, `kubectl logs -n ${req.params.namespace} ${req.params.pod} --tail=100 2>/dev/null || echo ""`);
    res.json({ available: true, logs: out });
  } catch (err) { res.json({ available: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — ANSIBLE (READ-ONLY scan)
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/vps/:id/ansible/playbooks
app.get('/api/vps/:id/ansible/playbooks', (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });
  const tool = db.prepare("SELECT * FROM vps_detected_tools WHERE user_id = ? AND vps_id = ? AND tool_name = 'ansible' AND is_active = 1").get(userId, vpsRow.id);
  if (!tool) return res.json({ available: false });
  const playbooks = db.prepare('SELECT * FROM ansible_playbooks WHERE user_id = ? AND vps_id = ? ORDER BY playbook_name').all(userId, vpsRow.id);
  res.json({ available: true, playbooks });
});

// POST /api/vps/:id/ansible/playbooks/scan
app.post('/api/vps/:id/ansible/playbooks/scan', async (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });
  const vps = getVpsBySlug(userId, req.params.id);
  if (!hasSshAccess(vps)) return res.status(400).json({ error: 'SSH not configured' });
  try {
    const out = await runSSH(vps, 'find ~/playbooks /etc/ansible /opt/ansible -name "*.yml" -o -name "*.yaml" 2>/dev/null | head -30 || echo ""');
    db.prepare('DELETE FROM ansible_playbooks WHERE user_id = ? AND vps_id = ?').run(userId, vpsRow.id);
    const ins = db.prepare('INSERT INTO ansible_playbooks (user_id, vps_id, playbook_path, playbook_name) VALUES (?, ?, ?, ?)');
    for (const p of out.split('\n').filter(l => l.trim())) {
      const name = p.split('/').pop() || p;
      ins.run(userId, vpsRow.id, p.trim(), name);
    }
    const playbooks = db.prepare('SELECT * FROM ansible_playbooks WHERE user_id = ? AND vps_id = ?').all(userId, vpsRow.id);
    auditLog({ userId, action: 'Ansible scan', category: 'integration', details: req.params.id, ip: getClientIp(req) });
    res.json({ available: true, playbooks });
  } catch (err) { res.json({ available: false, error: err.message }); }
});

// GET /api/vps/:id/ansible/logs
app.get('/api/vps/:id/ansible/logs', async (req, res) => {
  const userId = req.authSession.user.id;
  const vps = getVpsBySlug(userId, req.params.id);
  if (!vps) return res.status(404).json({ error: 'VPS not found' });
  if (!hasSshAccess(vps)) return res.json({ available: false });
  try {
    const out = await runSSH(vps, 'tail -50 /var/log/ansible.log 2>/dev/null || tail -50 ~/.ansible/log 2>/dev/null || echo "No logs found"');
    res.json({ available: true, logs: out });
  } catch (err) { res.json({ available: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — TERRAFORM (READ-ONLY)
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/vps/:id/terraform/workspaces
app.get('/api/vps/:id/terraform/workspaces', (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });
  const tool = db.prepare("SELECT * FROM vps_detected_tools WHERE user_id = ? AND vps_id = ? AND tool_name = 'terraform' AND is_active = 1").get(userId, vpsRow.id);
  if (!tool) return res.json({ available: false });
  const workspaces = db.prepare('SELECT * FROM terraform_workspaces WHERE user_id = ? AND vps_id = ? ORDER BY workspace_name').all(userId, vpsRow.id);
  res.json({ available: true, workspaces });
});

// POST /api/vps/:id/terraform/workspaces/scan
app.post('/api/vps/:id/terraform/workspaces/scan', async (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });
  const vps = getVpsBySlug(userId, req.params.id);
  if (!hasSshAccess(vps)) return res.status(400).json({ error: 'SSH not configured' });
  try {
    const out = await runSSH(vps, 'find ~ /opt /var/www -name "*.tf" -maxdepth 5 2>/dev/null | xargs -I{} dirname {} 2>/dev/null | sort -u | head -10 || echo ""');
    db.prepare('DELETE FROM terraform_workspaces WHERE user_id = ? AND vps_id = ?').run(userId, vpsRow.id);
    const ins = db.prepare('INSERT INTO terraform_workspaces (user_id, vps_id, workspace_path, workspace_name) VALUES (?, ?, ?, ?)');
    for (const p of out.split('\n').filter(l => l.trim())) {
      const name = p.split('/').pop() || p;
      ins.run(userId, vpsRow.id, p.trim(), name);
    }
    const workspaces = db.prepare('SELECT * FROM terraform_workspaces WHERE user_id = ? AND vps_id = ?').all(userId, vpsRow.id);
    res.json({ available: true, workspaces });
  } catch (err) { res.json({ available: false, error: err.message }); }
});

// GET /api/vps/:id/terraform/state/:wsid
app.get('/api/vps/:id/terraform/state/:wsid', async (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });
  const ws = db.prepare('SELECT * FROM terraform_workspaces WHERE id = ? AND user_id = ? AND vps_id = ?').get(req.params.wsid, userId, vpsRow.id);
  if (!ws) return res.status(404).json({ error: 'Workspace not found' });
  const vps = getVpsBySlug(userId, req.params.id);
  if (!hasSshAccess(vps)) return res.json({ available: false });
  try {
    const out = await runSSH(vps, `cd ${ws.workspace_path} && terraform state list 2>/dev/null || echo ""`);
    res.json({ available: true, resources: out.split('\n').filter(Boolean) });
  } catch (err) { res.json({ available: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — PROMETHEUS
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/vps/:id/prometheus/connect
app.post('/api/vps/:id/prometheus/connect', (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });
  const { prometheus_url = 'http://localhost:9090' } = req.body || {};
  db.prepare(`
    INSERT INTO prometheus_integrations (user_id, vps_id, prometheus_url)
    VALUES (?, ?, ?)
    ON CONFLICT DO NOTHING
  `).run(userId, vpsRow.id, prometheus_url);
  res.json({ ok: true });
});

// GET /api/vps/:id/prometheus/targets
app.get('/api/vps/:id/prometheus/targets', async (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id, host FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });
  const pi = db.prepare('SELECT * FROM prometheus_integrations WHERE user_id = ? AND vps_id = ? AND enabled = 1').get(userId, vpsRow.id);
  const url = pi?.prometheus_url || `http://${vpsRow.host}:9090`;
  try {
    const { default: fetch } = await import('node-fetch');
    const r = await fetch(`${url}/api/v1/targets`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return res.json({ available: false });
    const data = await r.json();
    db.prepare('UPDATE prometheus_integrations SET is_reachable = 1, last_checked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND vps_id = ?').run(userId, vpsRow.id);
    res.json({ available: true, targets: data.data });
  } catch { res.json({ available: false }); }
});

// GET /api/vps/:id/prometheus/alerts
app.get('/api/vps/:id/prometheus/alerts', async (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id, host FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });
  const pi = db.prepare('SELECT * FROM prometheus_integrations WHERE user_id = ? AND vps_id = ? AND enabled = 1').get(userId, vpsRow.id);
  const url = pi?.prometheus_url || `http://${vpsRow.host}:9090`;
  try {
    const { default: fetch } = await import('node-fetch');
    const r = await fetch(`${url}/api/v1/alerts`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return res.json({ available: false });
    const data = await r.json();
    res.json({ available: true, alerts: data.data?.alerts || [] });
  } catch { res.json({ available: false }); }
});

// GET /api/vps/:id/prometheus/query
app.get('/api/vps/:id/prometheus/query', async (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id, host FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q is required' });
  const pi = db.prepare('SELECT * FROM prometheus_integrations WHERE user_id = ? AND vps_id = ? AND enabled = 1').get(userId, vpsRow.id);
  const url = pi?.prometheus_url || `http://${vpsRow.host}:9090`;
  try {
    const { default: fetch } = await import('node-fetch');
    const r = await fetch(`${url}/api/v1/query?query=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return res.json({ available: false });
    const data = await r.json();
    res.json({ available: true, result: data.data });
  } catch { res.json({ available: false }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — JENKINS
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/vps/:id/jenkins/connect
app.post('/api/vps/:id/jenkins/connect', (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });
  const { jenkins_url, username, token } = req.body || {};
  if (!jenkins_url || !username || !token) return res.status(400).json({ error: 'jenkins_url, username and token are required' });
  db.prepare(`
    INSERT INTO jenkins_integrations (user_id, vps_id, jenkins_url, username, token_encrypted)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT DO NOTHING
  `).run(userId, vpsRow.id, jenkins_url, username, encrypt(token));
  auditLog({ userId, action: 'Jenkins connected', category: 'integration', details: jenkins_url, ip: getClientIp(req) });
  res.json({ ok: true });
});

// GET /api/vps/:id/jenkins/jobs
app.get('/api/vps/:id/jenkins/jobs', async (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });
  const ji = db.prepare('SELECT * FROM jenkins_integrations WHERE user_id = ? AND vps_id = ? AND enabled = 1').get(userId, vpsRow.id);
  if (!ji) return res.json({ available: false });
  try {
    const { default: fetch } = await import('node-fetch');
    const token = decrypt(ji.token_encrypted);
    const auth = 'Basic ' + Buffer.from(`${ji.username}:${token}`).toString('base64');
    const r = await fetch(`${ji.jenkins_url}/api/json?tree=jobs[name,color,lastBuild[number,result,timestamp,duration]]`, {
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return res.json({ available: false, error: `Jenkins API: ${r.status}` });
    const data = await r.json();
    res.json({ available: true, jobs: data.jobs || [] });
  } catch (err) { res.json({ available: false, error: err.message }); }
});

// GET /api/vps/:id/jenkins/jobs/:name
app.get('/api/vps/:id/jenkins/jobs/:name', async (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });
  const ji = db.prepare('SELECT * FROM jenkins_integrations WHERE user_id = ? AND vps_id = ? AND enabled = 1').get(userId, vpsRow.id);
  if (!ji) return res.json({ available: false });
  try {
    const { default: fetch } = await import('node-fetch');
    const token = decrypt(ji.token_encrypted);
    const auth = 'Basic ' + Buffer.from(`${ji.username}:${token}`).toString('base64');
    const r = await fetch(`${ji.jenkins_url}/job/${encodeURIComponent(req.params.name)}/api/json?tree=builds[number,result,timestamp,duration,url]{0,10}`, {
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return res.json({ available: false, error: `Jenkins API: ${r.status}` });
    res.json({ available: true, job: await r.json() });
  } catch (err) { res.json({ available: false, error: err.message }); }
});

// POST /api/vps/:id/jenkins/jobs/:name/build
app.post('/api/vps/:id/jenkins/jobs/:name/build', async (req, res) => {
  const userId = req.authSession.user.id;
  const vpsRow = db.prepare('SELECT id FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, req.params.id);
  if (!vpsRow) return res.status(404).json({ error: 'VPS not found' });
  const ji = db.prepare('SELECT * FROM jenkins_integrations WHERE user_id = ? AND vps_id = ? AND enabled = 1').get(userId, vpsRow.id);
  if (!ji) return res.json({ available: false });
  try {
    const { default: fetch } = await import('node-fetch');
    const token = decrypt(ji.token_encrypted);
    const auth = 'Basic ' + Buffer.from(`${ji.username}:${token}`).toString('base64');
    const r = await fetch(`${ji.jenkins_url}/job/${encodeURIComponent(req.params.name)}/build`, {
      method: 'POST',
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(8000),
    });
    if (r.status === 201 || r.status === 200) {
      auditLog({ userId, action: 'Jenkins build triggered', category: 'integration', details: req.params.name, ip: getClientIp(req) });
      return res.json({ ok: true });
    }
    res.json({ ok: false, error: `Jenkins API: ${r.status}` });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

// ── Phase 5 — Proxy RAG ───────────────────────────────────────────────────────
app.post('/api/rag/ask', async (req, res) => {
  try {
    const { default: fetch } = await import('node-fetch');
    const response = await fetch(`${process.env.RAG_URL || 'http://rag:3002'}/rag/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.authorization || '',
        'Cookie': req.headers.cookie || '',
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch {
    res.json({
      answer: "L'assistant DevOps est temporairement indisponible. Vérifie que le service RAG est démarré.",
      commands: [], steps: [], off_topic: false, error: true,
    });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — WEBSOCKET SSH TERMINAL (auth via cookie on upgrade request)
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

wssById.on('connection', async (ws, request, vpsSlug) => {
  // Authenticate from the upgrade request cookie
  const sessionData = await getSessionUser(request);
  if (!sessionData) {
    ws.send(JSON.stringify({ type: 'error', data: 'Authentication required' }));
    ws.close();
    return;
  }

  const userId = sessionData.user.id;

  // Check SSH access toggle for this user
  const settings = stmtSelectUserSettings.get(userId);
  if (!settings?.ssh_access) {
    ws.send(JSON.stringify({ type: 'error', data: 'SSH access is disabled in your settings' }));
    ws.close();
    return;
  }

  const vpsRow = db.prepare('SELECT * FROM vps WHERE user_id = ? AND slug = ? AND deleted_at IS NULL').get(userId, vpsSlug);
  if (!vpsRow) {
    ws.send(JSON.stringify({ type: 'error', data: `VPS "${vpsSlug}" not found` }));
    ws.close();
    return;
  }

  const password = decrypt(vpsRow.ssh_password);
  console.log(`🔌 SSH terminal → ${vpsRow.username}@${vpsRow.host}`);
  auditLog({ userId, action: 'SSH terminal opened', category: 'ssh', details: `VPS: ${vpsSlug}` });

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
    auditLog({ userId, action: 'SSH terminal error', category: 'ssh', details: err.message, success: 0 });
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

  conn.connect({ host: vpsRow.host, port: vpsRow.port || 22, username: vpsRow.username, password, readyTimeout: 15_000 });
});

// ══════════════════════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════════════════════
async function start() {
  if (redisClient) {
    try {
      await redisClient.connect();
      console.log(`🧠 Redis session store connected at ${REDIS_URL}`);
    } catch (error) {
      console.error('[redis] connect failed:', error.message);
    }
  }

  server.listen(PORT, () => {
    console.log(`\n✅ Backend running on http://localhost:${PORT}`);
    console.log(`🔒 Auth required on all /api/* routes (except /signup, /login, /logout, /health)`);
    console.log(`🔐 Encryption: AES-256-GCM active for SSH passwords and tokens\n`);
  });
}

start();


