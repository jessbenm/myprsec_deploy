Design a modern DevOps control panel 
called "MyPresc Deploy" with dark theme 
(background #0f1117, cards #1a1f2e, 
accent #2563eb).

LAYOUT :
Sidebar gauche fixe (60px icones)
+ Header top avec breadcrumb
+ Zone principale en grille

━━━━━━━━━━━━━━━━━━━━━━━
PAGE 1 — DASHBOARD OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━

Header :
→ Logo MyPrescription
→ Environment selector :
   [STAGING ▼] [PRODUCTION]
→ Status global pill :
   🟢 All Systems Operational
→ Avatar + notifications bell

4 KPI Cards en haut :
┌─────────────┐ ┌─────────────┐
│ 🖥 VPS Health│ │⚡ Uptime     │
│   99.8%     │ │   9d 7h     │
└─────────────┘ └─────────────┘
┌─────────────┐ ┌─────────────┐
│ 🐳 Containers│ │ 🔄 Last Deploy│
│   6/6 UP    │ │  2h ago ✅  │
└─────────────┘ └─────────────┘

Section principale en 2 colonnes :

COLONNE GAUCHE (60%) :
→ Container Status Cards
   Chaque conteneur = une card :
   [nginx] [frontend] [backend]
   [postgres] [redis] [certbot]
   
   Chaque card contient :
   - Nom + icone
   - Status badge (healthy/up/down)
   - CPU % bar
   - RAM usage / limit bar
   - Uptime
   - Petit sparkline graph

→ Real-time Logs Stream
   Terminal style
   Auto-scroll
   Filter by container
   Color coded (error=red, 
   warn=yellow, info=green)

COLONNE DROITE (40%) :
→ Resource Usage Charts
   RAM total donut chart
   CPU line chart (last 1h)
   Network in/out area chart

→ Quick Actions
   [Restart Container ▼]
   [View Full Logs]
   [Run Health Check]

━━━━━━━━━━━━━━━━━━━━━━━
PAGE 2 — CI/CD PIPELINE
━━━━━━━━━━━━━━━━━━━━━━━

Pipeline Visual (horizontal) :
  
┌──────┐    ┌──────┐    ┌──────┐    ┌──────┐
│ Push │ →  │Tests │ →  │Build │ →  │Deploy│
│  ✅  │    │  ✅  │    │  ✅  │    │  ✅  │
└──────┘    └──────┘    └──────┘    └──────┘
  
Chaque stage cliquable :
→ Expand pour voir les logs
→ Duration badge
→ Status icon animé

Test Results Panel :
┌────────────────────────────┐
│ Unit Tests      47/47 ✅   │
│ Integration     12/12 ✅   │
│ E2E Tests        8/10 ⚠️   │
│ Security Scan    Pass ✅   │
│ Docker Build     Pass ✅   │
└────────────────────────────┘

Deploy Controls :
Big button zone :

┌─────────────────────────────┐
│  🚀 DEPLOY TO PRODUCTION    │
│  Version: v1.2.4            │
│  Tests: 67/69 passed ⚠️     │
│  [Cancel]  [Deploy Anyway]  │
└─────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━
PAGE 3 — MONITORING
━━━━━━━━━━━━━━━━━━━━━━━

Time range selector :
[1h] [6h] [24h] [7d] [30d]

Charts fullwidth :
→ CPU Usage per container
   Multi-line chart
   Color per container

→ Memory Usage
   Stacked area chart
   With limit lines (red dashed)

→ HTTP Requests/sec
   Bar chart
   Color: green=2xx, 
   yellow=4xx, red=5xx

→ Response Time P95
   Line chart
   SLA threshold line

→ Database Connections
   Gauge chart

Alerts Panel :
┌────────────────────────────┐
│ 🔴 Backend RAM > 80%  2m  │
│ 🟡 High req rate      5m  │
│ 🟢 All checks passed  now │
└────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━
PAGE 4 — DEPLOY HISTORY
━━━━━━━━━━━━━━━━━━━━━━━

Timeline vertical :

● v1.2.4 — Today 14:32
  └ Deployed by: Yasmine
  └ Tests: 67/69 ✅
  └ Duration: 4m 32s
  └ [Rollback] [View logs]

● v1.2.3 — Yesterday 10:15
  └ Deployed by: Mohammed  
  └ Tests: 69/69 ✅
  └ Duration: 3m 58s
  └ [Rollback] [View logs]

● v1.2.2 — 3 days ago ❌
  └ FAILED — Build error
  └ Auto-rolled back
  └ [View error]

Filter bar :
[All] [Success] [Failed] 
[Staging] [Production]

━━━━━━━━━━━━━━━━━━━━━━━
PAGE 5 — MULTI VPS
━━━━━━━━━━━━━━━━━━━━━━━

Server Grid cards :

┌──────────────────┐
│ 🖥 VPS Staging   │
│ 173.212.248.243  │
│ ████████░░ 80%   │ RAM
│ ███░░░░░░░ 30%   │ CPU
│ 🟢 6/6 containers│
│ [Manage] [SSH]   │
└──────────────────┘

┌──────────────────┐
│ 🖥 VPS Production│
│ xxx.xxx.xxx.xxx  │
│ ████████░░ 55%   │ RAM
│ ████░░░░░░ 40%   │ CPU
│ 🟢 6/6 containers│
│ [Manage] [SSH]   │
└──────────────────┘

┌──────────────────┐
│ ➕ Add New VPS   │
│                  │
│   Click to add   │
│   new server     │
└──────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━
SIDEBAR NAVIGATION
━━━━━━━━━━━━━━━━━━━━━━━

Icons only (60px) :
🏠 Dashboard
🔄 Pipeline  
📊 Monitoring
📜 History
🖥 Servers
⚙️ Settings

Bottom :
👤 Profile
🌙 Dark/Light toggle

━━━━━━━━━━━━━━━━━━━━━━━
DESIGN SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━

Colors :
→ Background : #0f1117
→ Cards : #1a1f2e
→ Border : #2d3748
→ Primary : #2563eb
→ Success : #16a34a
→ Warning : #ea580c
→ Error : #dc2626
→ Text primary : #f1f5f9
→ Text secondary : #94a3b8

Typography :
→ Font : Inter
→ Headings : 600 weight
→ Body : 400 weight
→ Code/logs : JetBrains Mono

Components :
→ Cards with subtle border
→ Glassmorphism on modals
→ Smooth animations 300ms
→ Skeleton loaders
→ Toast notifications
→ Animated status badges