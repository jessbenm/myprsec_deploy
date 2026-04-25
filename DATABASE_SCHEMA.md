# 🗄️ Schéma Base de Données — MyPresc Deploy

## Entity-Relationship Diagram

```mermaid
erDiagram
    USERS ||--o{ USER_SESSIONS : "has"
    USERS ||--o{ USER_SETTINGS : "has"
    USERS ||--o{ VPS : "owns"
    USERS ||--o{ OAUTH_ACCOUNTS : "has"
    USERS ||--o{ AUDIT_LOG : "performs"
    
    VPS ||--o{ VPS_GITHUB_INTEGRATIONS : "has"
    VPS ||--o{ METRICS : "generates"
    VPS ||--o{ VPS_SNAPSHOTS : "generates"
    VPS ||--o{ LATENCY_HISTORY : "generates"
    VPS ||--o{ ALERT_RULES : "configured_with"
    VPS ||--o{ PIPELINE_RUNS : "has"
    
    PIPELINE_RUNS ||--o{ PIPELINE_JOBS : "contains"

    USERS {
        int id PK
        string name
        string email UK
        string password_hash
        string password_salt
        string role
        string phone
        string location
        string timezone
        int created_at
        int updated_at
        int deleted_at "nullable"
    }

    USER_SESSIONS {
        int id PK
        int user_id FK
        string token UK
        int expires_at
        string ip_address
        int created_at
    }

    USER_SETTINGS {
        int id PK
        int user_id FK UK
        string discord_webhook
        string slack_webhook
        int notify_deploy
        int notify_failure
        int notify_rollback
        int ssh_access
        string api_token UK
        int created_at
        int updated_at
    }

    VPS {
        int id PK
        int user_id FK
        string slug UK_per_user
        string name
        string host
        int port
        string username
        string ssh_password "encrypted"
        string status
        int created_at
        int updated_at
        int deleted_at "nullable"
    }

    VPS_GITHUB_INTEGRATIONS {
        int id PK
        int vps_id FK UK
        int user_id FK
        string github_repo
        string github_token "encrypted"
        int created_at
        int updated_at
    }

    METRICS {
        int id PK
        int vps_id FK
        int user_id FK
        int timestamp
        string container
        float cpu
        float mem_mb
        float mem_perc
    }

    VPS_SNAPSHOTS {
        int id PK
        int vps_id FK
        int user_id FK
        int timestamp
        float total_cpu
        float total_mem
        int running
        int total
    }

    LATENCY_HISTORY {
        int id PK
        int vps_id FK
        int user_id FK
        int timestamp
        string url
        int ms
        int status
        int ok
    }

    ALERT_RULES {
        int id PK
        int vps_id FK
        int user_id FK
        string metric
        string condition
        float threshold
        string severity
        int enabled
        int created_at
        int updated_at
    }

    PIPELINE_RUNS {
        int id PK
        int vps_id FK
        int user_id FK
        int github_run_id
        string workflow_name
        string status
        string conclusion
        string branch
        string commit_sha
        string commit_message
        string actor
        int started_at
        int completed_at
        int duration_sec
        string github_url
        int created_at
        int updated_at
    }

    PIPELINE_JOBS {
        int id PK
        int run_id FK
        int user_id FK
        int github_job_id
        string name
        string status
        string conclusion
        int started_at
        int completed_at
        int duration_sec
        string steps_json
        int created_at
        int updated_at
    }

    OAUTH_ACCOUNTS {
        int id PK
        int user_id FK
        string provider
        string provider_id UK_per_provider
        int created_at
    }

    AUDIT_LOG {
        int id PK
        int user_id FK "nullable"
        int timestamp
        string action
        string category
        string details
        string ip
        int success
    }
```

## Détails des Tables

### 1. users (Root Table)
```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  password_salt TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'user',      -- 'user' | 'admin'
  phone         TEXT    NOT NULL DEFAULT '',
  location      TEXT    NOT NULL DEFAULT '',
  timezone      TEXT    NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,                      -- Unix ms
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER                                -- NULL = active
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_deleted_at ON users(deleted_at);
```
**Rôle:** Owner de toutes les ressources

---

### 2. user_sessions (Session Management)
```sql
CREATE TABLE user_sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  token      TEXT    NOT NULL UNIQUE,                  -- 64-char hex
  expires_at INTEGER NOT NULL,                        -- Unix ms
  ip_address TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```
**Rôle:** Active login sessions (24h cookies)
**Cleanup:** Auto-delete expired sessions every hour

---

### 3. vps (Managed Servers)
```sql
CREATE TABLE vps (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  slug         TEXT    NOT NULL,                       -- URL-safe id
  name         TEXT    NOT NULL,
  host         TEXT    NOT NULL,
  port         INTEGER NOT NULL DEFAULT 22,
  username     TEXT    NOT NULL,
  ssh_password TEXT    NOT NULL,                       -- Encrypted
  status       TEXT    NOT NULL DEFAULT 'unknown',    -- health indicator
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted_at   INTEGER,                                -- Soft delete
  UNIQUE (user_id, slug),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```
**Rôle:** VPS/Server registry per user
**Security:** SSH password encrypted before INSERT
**Statuses:** healthy | warning | error | unknown | loading

---

### 4. vps_github_integrations (Git Integration)
```sql
CREATE TABLE vps_github_integrations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  vps_id       INTEGER NOT NULL UNIQUE,               -- 1:0-1 with vps
  user_id      INTEGER NOT NULL,
  github_repo  TEXT    NOT NULL,                      -- "owner/repo"
  github_token TEXT    NOT NULL,                      -- Encrypted
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  FOREIGN KEY (vps_id)  REFERENCES vps(id)   ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```
**Rôle:** Optional GitHub Actions setup per VPS

---

### 5. metrics (Container Metrics)
```sql
CREATE TABLE metrics (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  vps_id    INTEGER NOT NULL,
  user_id   INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,                         -- Unix ms
  container TEXT    NOT NULL,                         -- Container name
  cpu       REAL    NOT NULL DEFAULT 0,              -- %
  mem_mb    REAL    NOT NULL DEFAULT 0,              -- MB
  mem_perc  REAL    NOT NULL DEFAULT 0,              -- %
  FOREIGN KEY (vps_id)  REFERENCES vps(id)   ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_metrics_vps_ts ON metrics(vps_id, timestamp);
```
**Rôle:** Per-container CPU/RAM tracking
**Frequency:** Inserted every 2 minutes (collectAll job)
**Retention:** 31 days, then auto-delete

---

### 6. vps_snapshots (Aggregated Snapshots)
```sql
CREATE TABLE vps_snapshots (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  vps_id    INTEGER NOT NULL,
  user_id   INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,                         -- Unix ms
  total_cpu REAL    NOT NULL DEFAULT 0,              -- % average
  total_mem REAL    NOT NULL DEFAULT 0,              -- MB total
  running   INTEGER NOT NULL DEFAULT 0,              -- Container count
  total     INTEGER NOT NULL DEFAULT 0,              -- Total defined
  FOREIGN KEY (vps_id)  REFERENCES vps(id)   ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_snapshots_vps_ts ON vps_snapshots(vps_id, timestamp);
```
**Rôle:** Aggregate metrics (used for graphs)

---

### 7. latency_history (Uptime Tracking)
```sql
CREATE TABLE latency_history (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  vps_id    INTEGER NOT NULL,
  user_id   INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,                         -- Unix ms
  url       TEXT    NOT NULL,                         -- http://<host>
  ms        INTEGER NOT NULL DEFAULT 0,              -- Response time
  status    INTEGER NOT NULL DEFAULT 0,              -- HTTP code
  ok        INTEGER NOT NULL DEFAULT 1,              -- 1 = ok, 0 = timeout
  FOREIGN KEY (vps_id)  REFERENCES vps(id)   ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_latency_vps_ts ON latency_history(vps_id, timestamp);
```
**Rôle:** HTTP ping results for uptime %
**Metrics:** avg latency, p95, uptime %

---

### 8. alert_rules (Threshold Configuration)
```sql
CREATE TABLE alert_rules (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  vps_id     INTEGER NOT NULL,
  user_id    INTEGER NOT NULL,
  metric     TEXT    NOT NULL,                        -- cpu|memory|container_down
  condition  TEXT    NOT NULL,                        -- gt|eq|lt
  threshold  REAL    NOT NULL,
  severity   TEXT    NOT NULL,                        -- warning|critical
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (vps_id)  REFERENCES vps(id)   ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_alert_rules_vps_id ON alert_rules(vps_id);
```
**Default Rules:**
- CPU > 80% (critical), > 50% (warning)
- Memory > 85% (critical), > 70% (warning)
- Container down (critical)

---

### 9. pipeline_runs (Workflow Runs)
```sql
CREATE TABLE pipeline_runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  vps_id          INTEGER NOT NULL,
  user_id         INTEGER NOT NULL,
  github_run_id   INTEGER,
  workflow_name   TEXT    NOT NULL,
  status          TEXT    NOT NULL,                   -- queued|in_progress|completed
  conclusion      TEXT,                                -- success|failure|cancelled
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
```

---

### 10. pipeline_jobs (Job Details)
```sql
CREATE TABLE pipeline_jobs (
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
  steps_json     TEXT,                                -- JSON array of steps
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  FOREIGN KEY (run_id)  REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)         ON DELETE CASCADE
);
```

---

### 11. audit_log (Activity Tracking)
```sql
CREATE TABLE audit_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER,                                  -- NULL for system events
  timestamp INTEGER NOT NULL,                         -- Unix ms
  action    TEXT    NOT NULL,                         -- "User signup", "VPS added"
  category  TEXT    NOT NULL DEFAULT 'settings',     -- security|vps|pipeline|etc
  details   TEXT    NOT NULL DEFAULT '',
  ip        TEXT    NOT NULL DEFAULT '',
  success   INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_audit_ts      ON audit_log(timestamp);
CREATE INDEX idx_audit_user_id ON audit_log(user_id);
```
**Retention:** 90 days, then auto-delete

---

### 12. user_settings (Preferences)
```sql
CREATE TABLE user_settings (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL UNIQUE,
  discord_webhook  TEXT    NOT NULL DEFAULT '',
  slack_webhook    TEXT    NOT NULL DEFAULT '',
  notify_deploy    INTEGER NOT NULL DEFAULT 0,
  notify_failure   INTEGER NOT NULL DEFAULT 1,
  notify_rollback  INTEGER NOT NULL DEFAULT 1,
  ssh_access       INTEGER NOT NULL DEFAULT 1,
  api_token        TEXT    NOT NULL UNIQUE,          -- For API auth
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

### 13. oauth_accounts (OAuth Linking)
```sql
CREATE TABLE oauth_accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  provider    TEXT    NOT NULL,                       -- 'github'
  provider_id TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (provider, provider_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## Data Flow During Metric Collection

```mermaid
sequenceDiagram
    participant Backend
    participant SSHVps as SSH VPS
    participant DB as SQLite DB
    participant Cleanup

    Backend->>Backend: collectAll() triggered every 2min
    
    loop For Each VPS
        Backend->>SSHVps: SSH connect (decrypt password)
        SSHVps-->>Backend: Connected
        
        Backend->>SSHVps: docker stats --no-stream
        SSHVps-->>Backend: CPU%, RAM per container
        
        Backend->>SSHVps: docker ps
        SSHVps-->>Backend: Running vs total containers
        
        Backend->>DB: INSERT metrics (per-container)
        Backend->>DB: INSERT vps_snapshots (aggregate)
        
        Backend->>SSHVps: HTTP GET http://<host> (5s timeout)
        SSHVps-->>Backend: Response time + status
        
        Backend->>DB: INSERT latency_history
        Backend->>SSHVps: SSH close connection
    end
    
    parallel
        Cleanup->>DB: DELETE metrics WHERE timestamp < 31 days
    and
        Cleanup->>DB: DELETE latency_history WHERE timestamp < 31 days
    end
```

---

## Indexes for Performance

```sql
-- User lookups
CREATE INDEX idx_users_email              ON users(email);
CREATE INDEX idx_users_deleted_at         ON users(deleted_at);

-- Session lookups
CREATE INDEX idx_user_sessions_token      ON user_sessions(token);
CREATE INDEX idx_user_sessions_user_id    ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- VPS queries
CREATE INDEX idx_vps_user_id              ON vps(user_id);
CREATE INDEX idx_vps_slug                 ON vps(slug);
CREATE INDEX idx_vps_status               ON vps(status);
CREATE INDEX idx_vps_deleted_at           ON vps(deleted_at);

-- GitHub integration
CREATE INDEX idx_vps_github_vps_id        ON vps_github_integrations(vps_id);

-- Metrics range queries (most important for graphs)
CREATE INDEX idx_metrics_vps_ts           ON metrics(vps_id, timestamp);
                                          -- Supports: WHERE vps_id=? AND timestamp >= ?
                                          -- Order by timestamp
                                          
CREATE INDEX idx_snapshots_vps_ts         ON vps_snapshots(vps_id, timestamp);
CREATE INDEX idx_latency_vps_ts           ON latency_history(vps_id, timestamp);

-- Alert rules
CREATE INDEX idx_alert_rules_vps_id       ON alert_rules(vps_id);

-- Pipeline queries
CREATE INDEX idx_pipeline_runs_vps_id     ON pipeline_runs(vps_id);
CREATE INDEX idx_pipeline_runs_user_id    ON pipeline_runs(user_id);
CREATE INDEX idx_pipeline_jobs_run_id     ON pipeline_jobs(run_id);

-- Settings
CREATE INDEX idx_user_settings_user_id    ON user_settings(user_id);
CREATE INDEX idx_user_settings_api_token  ON user_settings(api_token);

-- OAuth
CREATE INDEX idx_oauth_provider           ON oauth_accounts(provider, provider_id);

-- Audit log (range queries common)
CREATE INDEX idx_audit_ts                 ON audit_log(timestamp);
CREATE INDEX idx_audit_user_id            ON audit_log(user_id);
```

---

## Multi-Tenant Isolation Strategy

**Every query filtered by user_id** — Impossible for user to access another user's data:

```javascript
// Example: Always include user_id filter
const vpsList = db.prepare(`
  SELECT * FROM vps 
  WHERE user_id = ? AND deleted_at IS NULL
`).all(req.authSession.user.id);

const metrics = db.prepare(`
  SELECT * FROM metrics
  WHERE vps_id = ? AND user_id = ?
`).all(vpsId, req.authSession.user.id);

const alerts = db.prepare(`
  SELECT * FROM alert_rules
  WHERE vps_id = ? AND user_id = ?
`).all(vpsId, req.authSession.user.id);
```

**Foreign Key Constraints** enforce referential integrity:
- Every record linked to correct user via vps or direct user_id
- DELETE CASCADE prevents orphaned records
- ON DELETE SET NULL only for optional relationships

