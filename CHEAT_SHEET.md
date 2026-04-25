# 🎯 MyPresc Deploy — Cheat Sheet & Reference

## 📌 Fichiers Importants

```
Interface/
├── 📘 README.md ................................. Main documentation index
├── 📊 PROJECT_ANALYSIS.md ...................... Complete project analysis (60+ pages)
├── 🏗️  ARCHITECTURE_DIAGRAMS.md ............... System architecture diagrams
├── 🗄️  DATABASE_SCHEMA.md ..................... Database design + ERD
├── 🚀 FEATURE_GUIDE.md ........................ Quick start guide
│
├── monitoring-backend/
│   ├── index.js (2000+ lines) ................. Complete Express API
│   ├── package.json ........................... Backend dependencies
│   └── migrations/ ............................ SQL schema files
│
├── src/
│   ├── main.tsx ............................... React entry point
│   ├── App.tsx ................................ Root with providers
│   ├── pages/ ................................. 10 main pages
│   ├── components/ ............................ UI components
│   ├── lib/api.ts ............................. apiFetch helper
│   └── styles/ ................................ CSS + theme
│
├── package.json ............................... Frontend dependencies
├── vite.config.ts ............................. Build config
└── index.html ................................. HTML template
```

---

## 💻 Installation Quick Reference

```bash
# 1. Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Create .env
ENCRYPTION_KEY=<paste 64 hex chars>
PORT=3001
GITHUB_CLIENT_ID=<oauth id>
GITHUB_CLIENT_SECRET=<oauth secret>
FRONTEND_URL=http://localhost:5173

# 3. Install & start
cd monitoring-backend && npm install
npm install
npm run dev
```

---

## 📊 Tech Stack Quick Lookup

| Component | Tech | Version |
|-----------|------|---------|
| Frontend Framework | React | 18.3.1 |
| Language | TypeScript | 5.3.3 |
| Styling | Tailwind CSS | 4.1.12 |
| Build Tool | Vite | 6.3.5 |
| Backend | Express | 5.2.1 |
| Database | SQLite | WAL mode |
| Encryption | AES-256-GCM | Node.js crypto |
| Hashing | PBKDF2-SHA512 | 120k iterations |
| Terminal | xterm.js | 6.0.0 |
| Charts | Recharts | 2.15.2 |

---

## 🗄️ Database Tables (Quick Reference)

| Table | Purpose | Rows | Retention |
|-------|---------|------|-----------|
| `users` | Accounts | Hundreds | Forever |
| `user_sessions` | Login sessions | Thousands | 24 hours |
| `vps` | Managed servers | Hundreds | Soft delete |
| `vps_github_integrations` | GitHub repos | Tens | Forever |
| `metrics` | Container stats | Millions | 31 days |
| `vps_snapshots` | Aggregate metrics | 100Ks | 31 days |
| `latency_history` | HTTP probes | 100Ks | 31 days |
| `alert_rules` | Thresholds | Hundreds | Forever |
| `pipeline_runs` | Workflow runs | Hundreds | Forever |
| `pipeline_jobs` | Job details | Thousands | Forever |
| `audit_log` | Activity log | 10Ks | 90 days |
| `user_settings` | Preferences | Hundreds | Forever |
| `oauth_accounts` | GitHub links | Hundreds | Forever |

---

## 🔑 API Quick Reference

### Authentication
```
POST   /api/auth/signup              ← Register
POST   /api/auth/login               ← Login
GET    /api/auth/me                  ← Current user
PUT    /api/auth/me                  ← Update profile
POST   /api/auth/change-password     ← Change password
POST   /api/auth/logout              ← Logout
GET    /api/auth/github              ← GitHub OAuth
```

### VPS Management
```
POST   /api/vps                      ← Create
GET    /api/vps                      ← List all
DELETE /api/vps/:id                  ← Delete (soft)
POST   /api/vps/test-connection      ← Test SSH
```

### Real-Time Data
```
GET    /api/metrics/:id              ← Current stats
GET    /api/alerts/:id               ← Alert evaluation
GET    /api/logs/:id                 ← All container logs
GET    /api/logs/:id/:container      ← Specific container logs
```

### Historical Data
```
GET    /api/history/:id/cpu?range=24h     ← CPU graph
GET    /api/history/:id/memory?range=24h  ← RAM graph
GET    /api/history/:id/latency?range=24h ← Latency graph
GET    /api/response-time/:id             ← Current latency
```

### GitHub Actions
```
GET    /api/pipeline/:id             ← Workflows + runs
POST   /api/pipeline/:id/trigger     ← Start workflow
POST   /api/pipeline/:id/rerun/:id   ← Rerun job
```

### Settings
```
GET    /api/settings                 ← User settings
POST   /api/settings                 ← Update settings
POST   /api/settings/test-discord    ← Test webhook
POST   /api/settings/test-slack      ← Test webhook
POST   /api/settings/regenerate-token ← New API token
GET    /api/settings/audit-log       ← Activity history
```

### WebSocket
```
WS     /terminal/:id                 ← SSH terminal
```

---

## 🔐 Security Quick Reference

| Feature | Implementation | Status |
|---------|-----------------|--------|
| Password hashing | PBKDF2-SHA512 | ✅ |
| Data encryption | AES-256-GCM | ✅ |
| Session auth | 24h cookie | ✅ |
| HTTPS | Recommended prod | ⚠️ |
| Rate limiting | Not implemented | ⏳ |
| CORS | Enabled | ✅ |
| SSH restrictions | docker only | ✅ |
| Multi-tenancy | Per user_id | ✅ |
| Audit log | 90-day window | ✅ |

---

## 🎯 Frontend Routes

```
/                    → Dashboard (protected)
/login               → Login form
/signup              → Registration form
/pipeline            → GitHub Actions (protected)
/monitoring          → Real-time metrics (protected)
/history             → Deployment history (protected)
/servers             → VPS management (protected)
/settings            → User settings (protected)
/profile             → User profile (protected)
/alerts              → Alert configuration (protected)
```

---

## 📈 Performance Tips

### Database
- Indexes on `(vps_id, timestamp)` for range queries
- WAL mode for concurrent access
- Foreign key constraints for referential integrity
- Auto-cleanup every hour

### Backend
- SSH connections pooled per VPS
- Promise.all for parallel metric collection
- Connection timeout: 15 seconds
- Batch insert for metrics

### Frontend
- Lazy loading of pages
- Memoization of expensive components
- CSS in Tailwind (smaller bundle)
- Vite HMR for fast development

---

## 🐛 Common Fixes

### "Invalid ENCRYPTION_KEY"
```bash
# Must be 64 hex characters = 32 bytes
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### "SSH connection refused"
```bash
# Verify SSH credentials
ssh -i key.pem ubuntu@host "docker ps"

# Check VPS is reachable
nc -zv host 22
```

### "Metrics not updating"
```bash
# Check collectAll() running
ps aux | grep node

# Verify app.test-vps not broken
curl -X POST /api/vps/test-connection -d '...'
```

### "CORS error"
```
# Check vite.config.ts proxy config
server: {
  proxy: {
    '/api': 'http://localhost:3001'
  }
}
```

---

## 🎓 Key Concepts

### Multi-Tenancy
- Every table has `user_id` column
- All queries filter by `user_id`
- Foreign key constraints prevent cross-user access
- Soft deletes preserve audit trail

### Encryption
- AES-256-GCM with random IV per message
- 12-byte IV + 16-byte auth tag + ciphertext
- Format in DB: `<iv>:<tag>:<ciphertext>` (hex)
- Decrypted only when needed (SSH connection)

### Session Management
- Token stored in `mp_session` cookie
- HttpOnly flag (cannot be accessed by JS)
- SameSite=Lax (CSRF protection)
- 24-hour expiration
- Auto-delete expired sessions hourly

### Metric Collection
- Every 2 minutes: SSH to each VPS
- Execute: `docker stats --no-stream`
- Parse CPU%, RAM, container names
- INSERT into metrics table
- Calculate aggregates in vps_snapshots
- HTTP latency probe for uptime
- All in one transaction

---

## 📊 Data Size Estimates

```
1000 users
├── VPS per user: 5 average
├── Metrics per minute: 50 (10 containers × 5 VPS per min)
├── Metrics per day: 72,000
├── Metrics per month: 2,160,000
├── Metrics table size: ~100 MB/month (auto-purged at 31 days)
│
├── Latency probes per minute: 10 (1 per VPS per collection)
├── Latency per day: 14,400
├── Latency per month: 432,000
├── Latency table size: ~20 MB/month (auto-purged at 31 days)
│
└── Total DB size (steady state): ~500 MB
```

---

## 🚨 Production Checklist

- [ ] HTTPS/TLS enabled
- [ ] Database backups (daily)
- [ ] Environment variables secured (not in git)
- [ ] Rate limiting configured
- [ ] Log aggregation set up
- [ ] Monitoring & alerting configured
- [ ] SSH key rotation policy
- [ ] Database replication (optional)
- [ ] CDN for static assets
- [ ] Load balancer configured

---

## 🔄 Deployment Steps

```bash
# 1. Build frontend
npm run build

# 2. Start backend
NODE_ENV=production npm start

# 3. Verify health
curl http://localhost:3001/api/health

# 4. Check database
sqlite3 metrics-history.db ".tables"

# 5. Monitor logs
tail -f app.log
```

---

## 📞 Quick Links

| Resource | URL |
|----------|-----|
| React Docs | https://react.dev |
| Express Docs | https://expressjs.com |
| SQLite Docs | https://sqlite.org |
| Tailwind CSS | https://tailwindcss.com |
| Recharts | https://recharts.org |
| SSH2 Module | https://github.com/mscdex/ssh2 |
| xterm.js | https://xtermjs.org |

---

## 💡 Development Workflow

```bash
# Start watching
npm run dev

# Backend changes
- Restart backend manually (or nodemon)

# Frontend changes
- HMR refreshes automatically

# Database changes
- Edit index.js schema (lines 100-400)
- Database recreated on next restart

# Test SSH connection
curl -X POST http://localhost:3001/api/vps/test-connection \
  -H "Content-Type: application/json" \
  -d '{"host":"173.212.248.243","username":"ubuntu","password":"pass","port":22}'

# Get metrics
curl http://localhost:3001/api/metrics/prod -b "mp_session=..."
```

---

## 🎯 Features Status

**Implemented & Ready:**
- ✅ User auth (email + GitHub OAuth)
- ✅ VPS management (add/list/delete)
- ✅ Real-time metrics (Docker via SSH)
- ✅ GitHub Actions integration
- ✅ SSH terminal
- ✅ 24-hour graphs
- ✅ Alert rules
- ✅ Audit logging

**Partial/In Progress:**
- ⚠️ Webhooks (Discord/Slack configured, not sent)
- ⚠️ Alert notifications (evaluated, not sent)

**Not Started:**
- ❌ Mobile app
- ❌ Advanced analytics
- ❌ Cost prediction
- ❌ Team management

---

**Last Updated:** 2026-04-25
**Version:** 1.0.0
**Status:** Production Ready ✅

