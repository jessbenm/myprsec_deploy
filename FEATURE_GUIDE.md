# 🚀 Quick Start & Features Guide

## 🎯 Vue d'Ensemble des Fonctionnalités

### ✅ Fonctionnalités Implémentées

#### 1. **Authentication & User Management**
- ✅ Registration (email/password)
- ✅ Login with session cookies (24h)
- ✅ GitHub OAuth integration
- ✅ Password change (with verification)
- ✅ Profile editing (name, phone, location, timezone)
- ✅ Audit log (90-day retention)
- ✅ API token generation for external access

#### 2. **VPS Management**
- ✅ Add multiple servers (SSH credentials encrypted)
- ✅ List all user's VPS
- ✅ Soft-delete VPS (preserves audit trail)
- ✅ Test SSH connection before adding
- ✅ GitHub repository integration (per VPS)
- ✅ SSH access toggle (user preference)

#### 3. **Real-Time Monitoring**
- ✅ Live container metrics (CPU, RAM per container)
- ✅ Docker container count (running vs total)
- ✅ HTTP latency probing (uptime tracking)
- ✅ Log streaming (50-200 lines per container)
- ✅ Activity heatmap (24-hour CPU history)
- ✅ Real-time alert evaluation

#### 4. **Alert System**
- ✅ Default alert rules (CPU, RAM, container down)
- ✅ Threshold-based triggers
- ✅ Severity levels (warning, critical)
- ✅ Real-time evaluation against metrics
- ⏳ Future: Discord/Slack webhook notifications

#### 5. **GitHub Actions Integration**
- ✅ Fetch workflows and recent runs
- ✅ Trigger workflows (dispatch)
- ✅ Rerun failed workflows
- ✅ View job details and steps
- ✅ Success rate & average duration tracking
- ✅ Direct links to GitHub UI

#### 6. **Historical Data & Graphs**
- ✅ 24-hour CPU history (per-container)
- ✅ 24-hour memory history (aggregated)
- ✅ 24-hour latency history + uptime %
- ✅ Range selector (1h, 6h, 12h, 24h, 7d, 30d)
- ✅ Auto-scaling intervals for better visualization
- ✅ Charts with Recharts (area, line)

#### 7. **SSH Terminal**
- ✅ Web-based SSH access via WebSocket
- ✅ xterm.js for full terminal emulation
- ✅ Full shell access (bash)
- ✅ Real-time streaming
- ✅ Terminal resize support
- ✅ Copy-paste support

#### 8. **Settings & Integrations**
- ✅ Discord webhook configuration + test
- ✅ Slack webhook configuration + test
- ✅ Notification flags (deploy, failure, rollback)
- ✅ API token management
- ✅ Settings reset to defaults
- ⏳ Future: Webhook notifications on events

#### 9. **UI/UX Features**
- ✅ Dark/Light theme toggle
- ✅ Responsive design (desktop/tablet/mobile)
- ✅ Sidebar navigation
- ✅ Toast notifications (Sonner)
- ✅ Loading states
- ✅ Error handling with user feedback
- ✅ Modal dialogs for actions

---

## 📋 Checklist de Démarrage

### Prerequisites
```bash
# Node.js 18+ required
node --version

# npm or pnpm
npm --version
```

### Installation

```bash
# 1. Install backend dependencies
cd monitoring-backend
npm install

# 2. Install frontend dependencies (from root)
npm install

# 3. Generate encryption key (32 bytes = 64 hex chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Output: abc123def456abc123def456abc123def456abc123def456abc123def456abc1

# 4. Create .env file
cat > .env << EOF
ENCRYPTION_KEY=<paste output from step 3>
PORT=3001
NODE_ENV=development
GITHUB_CLIENT_ID=<your OAuth app ID>
GITHUB_CLIENT_SECRET=<your OAuth secret>
FRONTEND_URL=http://localhost:5173
ENABLE_LEGACY_JSON_MIGRATION=false
EOF

# 5. Start backend (port 3001)
npm run dev

# 6. In another terminal, start frontend (port 5173)
npm run dev
```

### First User

1. Open http://localhost:5173
2. Click "Sign Up"
3. Email: `test@example.com`
4. Password: `MySecurePassword123` (min 8 chars)
5. Name: `My Name`
6. Account created! Auto-logged in.

### Add First VPS

1. Go to "Servers"
2. Click "Add VPS"
3. Fill form:
   - ID: `prod` (URL slug)
   - Name: `Production Server`
   - Host: `173.212.248.243` (your VPS IP)
   - Username: `ubuntu` (SSH user)
   - Password: `<ssh password>`
   - Optional: GitHub repo, GitHub token
4. Click "Test Connection" to verify
5. Click "Create VPS"

### View Metrics

1. Go to "Monitoring"
2. Select VPS from dropdown
3. See real-time:
   - CPU, RAM, container count
   - Container logs
   - Active alerts
4. Go to "History" for 24-hour graphs

---

## 🔑 Key Files & Responsibilities

### Backend

| File | Lines | Purpose |
|------|-------|---------|
| `index.js` | 2000+ | Complete Express API |
| `package.json` | 30 | Dependencies + scripts |

### Frontend

| File | Lines | Purpose |
|------|-------|---------|
| `src/App.tsx` | 30 | Root + providers |
| `src/pages/*.tsx` | 5000+ | 10 pages + components |
| `src/lib/api.ts` | 10 | apiFetch helper |
| `src/app/theme-context.tsx` | 30 | Dark/Light theme |
| `src/app/auth-api.ts` | 50 | Auth API calls |

### Database

| Table | Rows | Purpose |
|-------|------|---------|
| `users` | Dozens | User accounts |
| `vps` | Dozens | Managed servers |
| `metrics` | Millions | Container stats (auto-purged at 31 days) |
| `vps_snapshots` | Hundreds of K | Aggregate snapshots (auto-purged at 31 days) |
| `latency_history` | Hundreds of K | Uptime tracking (auto-purged at 31 days) |
| `pipeline_runs` | Hundreds | Workflow history |
| `audit_log` | Thousands | Activity log (auto-purged at 90 days) |

---

## 🔒 Security Checklist

### ✅ Implemented

- [x] AES-256-GCM encryption for SSH passwords & GitHub tokens
- [x] PBKDF2-SHA512 password hashing (120k iterations)
- [x] Session-based auth with 24h cookie
- [x] HttpOnly, SameSite=Lax cookie flags
- [x] GitHub OAuth support
- [x] Multi-tenant data isolation (user_id filter on all queries)
- [x] Foreign key constraints
- [x] Soft deletes (audit trail preservation)
- [x] Input validation (email format, password length)
- [x] CORS with credentials support
- [x] SSH command restrictions (docker stats/ps/logs only)
- [x] Audit logging (90-day retention)

### ⏳ Recommended for Production

- [ ] Rate limiting on public endpoints
- [ ] HTTPS/TLS enforcement
- [ ] API key rotation policy
- [ ] Database backups (daily)
- [ ] Log aggregation (ELK, CloudWatch)
- [ ] Monitoring & alerting
- [ ] Secrets management (HashiCorp Vault)
- [ ] Database replication
- [ ] CDN for static assets
- [ ] Load balancing
- [ ] Container orchestration (Docker Swarm, Kubernetes)

---

## 📊 Performance Tuning

### Database Optimization

```javascript
// WAL mode (write-ahead logging) enabled
db.pragma('journal_mode = WAL');

// Composite index on most-used queries
CREATE INDEX idx_metrics_vps_ts ON metrics(vps_id, timestamp);
// Query: SELECT * FROM metrics WHERE vps_id=? AND timestamp >= ?

// Foreign key enforcement
db.pragma('foreign_keys = ON');
```

### Background Job Tuning

```javascript
// Metric collection every 2 minutes (configurable)
setInterval(collectAll, 2 * 60 * 1000);

// Data cleanup hourly
setInterval(cleanOldData, 60 * 60 * 1000);

// Parallel SSH connections (Promise.all)
await Promise.all(allVps.map(v => Promise.all([collectMetrics(v), collectLatency(v)])));
```

### Frontend Optimization

```javascript
// Lazy loading pages (React Router)
import { lazy, Suspense } from 'react';
const Dashboard = lazy(() => import('./pages/Dashboard'));

// Memoization for expensive components
const Dashboard = memo(function Dashboard() { ... });

// Tailwind CSS (utility-first = smaller bundle)
// Vite fast HMR (Hot Module Replacement)
```

---

## 🐛 Troubleshooting

### Backend won't start

```bash
# Check ENCRYPTION_KEY length (must be 64 hex chars)
node -e "console.log(Buffer.from(process.env.ENCRYPTION_KEY, 'hex').length)"
# Expected output: 32

# Check port 3001 in use
lsof -i :3001

# View database
sqlite3 metrics-history.db ".tables"
```

### SSH connection fails

```bash
# Test SSH manually
ssh -i <key> ubuntu@173.212.248.243 "docker ps"

# Check credentials in database
sqlite3 metrics-history.db "SELECT host, username FROM vps WHERE slug='prod'"

# Enable SSH debug logging in backend
// Add debugging to index.js:
const conn = new Client();
conn.on('debug', (info) => console.log('[SSH DEBUG]', info));
```

### Frontend can't reach backend

```bash
# Check proxy in vite.config.ts
server: {
  proxy: {
    '/api': 'http://localhost:3001',
    '/terminal': {
      target: 'ws://localhost:3001',
      ws: true
    }
  }
}

# Check browser console (F12) for CORS errors
# Check backend is running on port 3001
```

### Metrics not updating

```bash
# Check if collectAll() is running
// Add logging in index.js:
collectAll();
setInterval(() => {
  console.log('[collectAll] running at', new Date().toISOString());
  collectAll();
}, 2 * 60 * 1000);

# Check database for recent metrics
sqlite3 metrics-history.db "SELECT COUNT(*), MAX(timestamp) FROM metrics WHERE timestamp > datetime('now', '-10 minutes')"

# Verify SSH connectivity
GET /api/vps/test-connection (POST body with host/user/pass)
```

---

## 📈 Scaling Considerations

### Short-term (1000 users)
- Single SQLite instance (WAL mode)
- Increase metric cleanup window if storage is issue
- Add rate limiting on public endpoints

### Medium-term (10,000 users)
- Migrate to PostgreSQL (jsonb for steps, better concurrency)
- Add Redis cache for session storage
- Split metrics into separate database
- Implement sharding by user_id

### Long-term (100K+ users)
- Kubernetes deployment
- Load balancer (HAProxy, AWS ELB)
- Time-series database (InfluxDB, Timescale)
- API gateway (Kong, AWS API Gateway)
- CDN for static assets (Cloudflare, AWS CloudFront)
- Message queue for background jobs (Redis, RabbitMQ)

---

## 📞 API Examples

### TypeScript/JavaScript

```typescript
// Fetch current user
const res = await fetch('/api/auth/me', {
  credentials: 'include'
});
const user = await res.json();

// Create VPS
const vpsRes = await fetch('/api/vps', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: 'staging',
    name: 'Staging Server',
    host: '192.168.1.100',
    username: 'ubuntu',
    password: 'MyPassword123',
    port: 22,
    githubRepo: 'owner/repo',
    githubToken: 'ghp_...'
  })
});

// Get metrics
const metricsRes = await fetch('/api/metrics/staging', {
  credentials: 'include'
});
const metrics = await metricsRes.json();
```

### cURL

```bash
# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"user@example.com","password":"MyPass123"}'

# Get VPS list
curl http://localhost:3001/api/vps \
  -b cookies.txt

# Get metrics
curl http://localhost:3001/api/metrics/prod \
  -b cookies.txt

# Trigger workflow
curl -X POST http://localhost:3001/api/pipeline/prod/trigger \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"workflow":"deploy.yml","branch":"main"}'
```

---

## 📚 Documentation

- **PROJECT_ANALYSIS.md** — Complete project overview
- **DATABASE_SCHEMA.md** — Database design & ERD
- **ARCHITECTURE_DIAGRAMS.md** — System architecture
- **Quick Start & Features Guide** — This file

---

## 🎓 Learning Resources

**Backend Architecture**
- Express.js routing: https://expressjs.com/guide/routing.html
- SQLite optimization: https://www.sqlite.org/wal.html
- SSH2 module: https://github.com/mscdex/ssh2

**Frontend Architecture**
- React hooks: https://react.dev/reference/react/hooks
- React Router: https://reactrouter.com/
- Tailwind CSS: https://tailwindcss.com/
- Recharts: https://recharts.org/

**Security**
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- Cryptography: https://nodejs.org/api/crypto.html
- PBKDF2: https://en.wikipedia.org/wiki/PBKDF2

---

## 🤝 Contributing

### Code Style
- Backend: CommonJS (Node.js native)
- Frontend: React functional components + hooks
- Formatting: ESM for frontend, CommonJS for backend
- Naming: camelCase for variables, PascalCase for components

### Testing
```bash
# Manual testing
npm run dev  # Start both frontend & backend

# Check logs
tail -f ~/.pm2/logs/backend.log
```

### Git Workflow
```bash
# Create feature branch
git checkout -b feature/vps-health-check

# Make changes
# Commit
git commit -am "feat: add VPS health check"

# Push & PR
git push origin feature/vps-health-check
```

---

## 📄 License

Proprietary — MyPresc Deploy © 2026

---

**Last Updated:** 2026-04-25
**Version:** 1.0.0
**Status:** Production Ready ✅

