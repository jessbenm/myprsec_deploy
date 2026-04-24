-- ═══════════════════════════════════════════════════════════════════════════════
-- MyPresc Deploy — Multi-Tenant Schema Migration
-- File   : 002_multi_tenant_schema.sql
-- Purpose: Replaces vps-store.json, settings.json, and adds user_id ownership
--          to all resource tables so that no user can see another user's data.
--
-- Run order (dependency-safe):
--   users → user_sessions, user_settings
--   users → vps → vps_github_integrations
--                → metrics
--                → vps_snapshots
--                → latency_history
--                → alert_rules
--                → pipeline_runs → pipeline_jobs
--   users → audit_log (nullable user_id for system events)
-- ═══════════════════════════════════════════════════════════════════════════════

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 1: users
-- Replaces: auth_users
-- Changes : adds `role` (for future admin/viewer distinction)
--           adds `deleted_at` for soft deletes
-- Root owner of every resource in the system.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  password_salt TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'user',  -- 'user' | 'admin'
  created_at    INTEGER NOT NULL,                 -- Unix ms
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER                           -- NULL = active, set for soft delete
);

CREATE INDEX IF NOT EXISTS idx_users_email      ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 2: user_sessions
-- Replaces: auth_sessions
-- Changes : adds `ip_address` (already captured in request context)
-- One row per active browser session; cascades on user delete.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  token      TEXT    NOT NULL UNIQUE,  -- 64-char hex random token (mp_session cookie)
  expires_at INTEGER NOT NULL,         -- Unix ms; checked on every request
  ip_address TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_token      ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id    ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 3: vps
-- Replaces: vps-store.json  (the entire file)
-- `slug` is the URL-path identifier that was the old JSON key (e.g. "staging").
-- It is unique per user so two users can both have a "staging" VPS.
-- ssh_password must be encrypted at the application layer before INSERT.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vps (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  slug         TEXT    NOT NULL,               -- URL-safe id used in API paths
  name         TEXT    NOT NULL,               -- Display name ("vps staging")
  host         TEXT    NOT NULL,               -- IP address or hostname
  port         INTEGER NOT NULL DEFAULT 22,    -- SSH port
  username     TEXT    NOT NULL,               -- SSH login username
  ssh_password TEXT    NOT NULL,               -- Encrypted SSH password
  status       TEXT    NOT NULL DEFAULT 'unknown',  -- healthy|warning|error|unknown
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted_at   INTEGER,                        -- Soft delete; NULL = active
  UNIQUE (user_id, slug),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vps_user_id    ON vps(user_id);
CREATE INDEX IF NOT EXISTS idx_vps_slug       ON vps(slug);
CREATE INDEX IF NOT EXISTS idx_vps_status     ON vps(status);
CREATE INDEX IF NOT EXISTS idx_vps_deleted_at ON vps(deleted_at);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 4: vps_github_integrations
-- Replaces: githubRepo + githubToken fields in vps-store.json
-- Optional (not every VPS has GitHub configured — enforced by backend check
--   `if (!vps.githubRepo || !vps.githubToken)`).
-- 1:0-or-1 with vps; UNIQUE(vps_id) enforces the one-per-VPS rule.
-- github_token must be encrypted at the application layer before INSERT.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vps_github_integrations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  vps_id       INTEGER NOT NULL UNIQUE,        -- 1:1; a VPS has at most one GitHub link
  user_id      INTEGER NOT NULL,
  github_repo  TEXT    NOT NULL,               -- "owner/repo" format (cleaned)
  github_token TEXT    NOT NULL,               -- Encrypted GitHub Personal Access Token
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  FOREIGN KEY (vps_id)  REFERENCES vps(id)   ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vps_github_vps_id  ON vps_github_integrations(vps_id);
CREATE INDEX IF NOT EXISTS idx_vps_github_user_id ON vps_github_integrations(user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 5: metrics
-- Replaces: metrics  (same name, structural change)
-- Changes : vps_id changes from TEXT to INTEGER FK; adds user_id.
-- Per-container CPU / memory sample, collected every ~2 minutes via docker stats.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS metrics (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  vps_id    INTEGER NOT NULL,
  user_id   INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  container TEXT    NOT NULL,
  cpu       REAL    NOT NULL DEFAULT 0,       -- CPU percentage
  mem_mb    REAL    NOT NULL DEFAULT 0,       -- Memory used in MiB
  mem_perc  REAL    NOT NULL DEFAULT 0,       -- Memory percentage
  FOREIGN KEY (vps_id)  REFERENCES vps(id)   ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_metrics_vps_ts    ON metrics(vps_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_metrics_user_id   ON metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_metrics_container ON metrics(container);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 6: vps_snapshots
-- Replaces: vps_snapshots  (same name, structural change)
-- Changes : vps_id changes from TEXT to INTEGER FK; adds user_id.
-- One aggregate row per collection cycle: total CPU avg, total memory sum,
-- running container count, total container count.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vps_snapshots (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  vps_id    INTEGER NOT NULL,
  user_id   INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  total_cpu REAL    NOT NULL DEFAULT 0,  -- Average CPU across all containers
  total_mem REAL    NOT NULL DEFAULT 0,  -- Total memory in MiB
  running   INTEGER NOT NULL DEFAULT 0,  -- Containers with status "Up"
  total     INTEGER NOT NULL DEFAULT 0,  -- All containers (docker ps)
  FOREIGN KEY (vps_id)  REFERENCES vps(id)   ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_snapshots_vps_ts   ON vps_snapshots(vps_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_snapshots_user_id  ON vps_snapshots(user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 7: latency_history
-- Replaces: latency_history  (same name, structural change)
-- Changes : vps_id changes from TEXT to INTEGER FK; adds user_id.
-- HTTP reachability probe to http://<vps.host> every ~2 minutes.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS latency_history (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  vps_id    INTEGER NOT NULL,
  user_id   INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  url       TEXT    NOT NULL,              -- http://<host>
  ms        INTEGER NOT NULL DEFAULT 0,    -- Round-trip latency in ms
  status    INTEGER NOT NULL DEFAULT 0,    -- HTTP status code (0 = timeout/error)
  ok        INTEGER NOT NULL DEFAULT 1,    -- 1 = reachable, 0 = down
  FOREIGN KEY (vps_id)  REFERENCES vps(id)   ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_latency_vps_ts   ON latency_history(vps_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_latency_user_id  ON latency_history(user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 8: audit_log
-- Replaces: audit_log  (same name, structural change)
-- Changes : adds user_id (NULLABLE — system background events have no user actor).
--           ON DELETE SET NULL preserves audit history when a user is deleted.
-- Categories in use: settings | vps | ssh | pipeline | security | integration
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER,                           -- NULL for system-generated events
  timestamp INTEGER NOT NULL,
  action    TEXT    NOT NULL,
  category  TEXT    NOT NULL DEFAULT 'settings',
  details   TEXT    NOT NULL DEFAULT '',
  ip        TEXT    NOT NULL DEFAULT '',
  success   INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_ts       ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_user_id  ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_category ON audit_log(category);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 9: user_settings
-- Replaces: settings.json  (the entire file)
-- One row per user; created automatically on signup.
-- api_token is unique per user (replaces the single global apiToken).
-- discord_webhook / slack_webhook are per-user (replaces global webhooks).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_settings (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL UNIQUE,    -- 1:1 with users
  discord_webhook  TEXT    NOT NULL DEFAULT '',
  slack_webhook    TEXT    NOT NULL DEFAULT '',
  notify_deploy    INTEGER NOT NULL DEFAULT 0, -- 0=off, 1=on
  notify_failure   INTEGER NOT NULL DEFAULT 1,
  notify_rollback  INTEGER NOT NULL DEFAULT 1,
  ssh_access       INTEGER NOT NULL DEFAULT 1, -- Whether SSH terminal is enabled
  api_token        TEXT    NOT NULL UNIQUE,    -- 64-char hex; regeneratable
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id   ON user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_api_token ON user_settings(api_token);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 10: alert_rules
-- Replaces: hardcoded thresholds in /api/alerts/:id handler (index.js lines 889-898)
-- Makes alert thresholds configurable per VPS instead of global constants.
-- On VPS creation, seed 5 default rows matching the hardcoded values:
--   cpu  gt 80  critical
--   cpu  gt 50  warning
--   mem  gt 85  critical
--   mem  gt 70  warning
--   container_down eq 0  critical
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_rules (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  vps_id     INTEGER NOT NULL,
  user_id    INTEGER NOT NULL,
  metric     TEXT    NOT NULL,    -- 'cpu' | 'memory' | 'container_down'
  condition  TEXT    NOT NULL,    -- 'gt' | 'lt' | 'eq'
  threshold  REAL    NOT NULL,    -- e.g. 80.0 for CPU > 80%
  severity   TEXT    NOT NULL,    -- 'critical' | 'warning' | 'info'
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (vps_id)  REFERENCES vps(id)   ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_vps_id   ON alert_rules(vps_id);
CREATE INDEX IF NOT EXISTS idx_alert_rules_user_id  ON alert_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled  ON alert_rules(enabled);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 11: pipeline_runs
-- Replaces: live GitHub API calls in GET /api/pipeline/:id and History.tsx
-- Caches GitHub Actions workflow run data locally for the History page,
-- rollback UI, and deployment timeline without requiring a live GitHub request.
-- Linked to vps because the GitHub credentials come from vps_github_integrations.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  vps_id          INTEGER NOT NULL,
  user_id         INTEGER NOT NULL,
  github_run_id   INTEGER,                    -- GitHub Actions run ID (for rerun API)
  workflow_name   TEXT    NOT NULL,
  status          TEXT    NOT NULL,           -- 'in_progress' | 'queued' | 'completed'
  conclusion      TEXT,                       -- 'success' | 'failure' | 'cancelled' | NULL
  branch          TEXT    NOT NULL,
  commit_sha      TEXT,
  commit_message  TEXT,
  actor           TEXT,                       -- GitHub login of who triggered the run
  started_at      INTEGER,                    -- Unix ms
  completed_at    INTEGER,                    -- Unix ms
  duration_sec    INTEGER,
  github_url      TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  FOREIGN KEY (vps_id)  REFERENCES vps(id)   ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_vps_id     ON pipeline_runs(vps_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_user_id    ON pipeline_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status     ON pipeline_runs(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_created_at ON pipeline_runs(created_at);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 12: pipeline_jobs
-- Child of pipeline_runs; each run has 1-N jobs.
-- `steps_json` is a JSON blob because steps are leaf data never joined on
-- independently (matches the API shape: jobs[].steps[]).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_jobs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id         INTEGER NOT NULL,
  user_id        INTEGER NOT NULL,
  github_job_id  INTEGER,                     -- GitHub Actions job ID
  name           TEXT    NOT NULL,
  status         TEXT    NOT NULL,
  conclusion     TEXT,
  started_at     INTEGER,
  completed_at   INTEGER,
  duration_sec   INTEGER,
  steps_json     TEXT,                        -- JSON: [{name,status,conclusion,number,duration}]
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  FOREIGN KEY (run_id)  REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)         ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_run_id  ON pipeline_jobs(run_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_user_id ON pipeline_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_status  ON pipeline_jobs(status);
