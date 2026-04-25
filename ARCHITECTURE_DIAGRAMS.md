# 🏗️ Diagrammes Architecturaux — MyPresc Deploy

## 1. Architecture Globale

```mermaid
graph TB
    subgraph Client["🖥️ FRONTEND (React)"]
        Dashboard["📊 Dashboard"]
        Servers["🖧 Servers<br/>VPS CRUD"]
        Monitoring["📈 Monitoring<br/>Real-time stats"]
        Pipeline["🚀 Pipeline<br/>GitHub Actions"]
        History["📜 History<br/>Deployments"]
        Terminal["⌨️ Terminal<br/>SSH Shell"]
        Settings["⚙️ Settings<br/>Webhooks"]
        Profile["👤 Profile<br/>User Info"]
    end

    subgraph FrontendCore["React Core"]
        Router["React Router"]
        Contexts["Contexts<br/>User|Theme|Env"]
        API["apiFetch<br/>HTTP Client"]
    end

    subgraph Backend["🔧 BACKEND (Express + Node.js)"]
        Auth["🔐 /api/auth<br/>Signup/Login/OAuth"]
        VPS["🖧 /api/vps<br/>CRUD + SSH test"]
        Metrics["📊 /api/metrics<br/>Real-time stats"]
        History2["📜 /api/history<br/>CPU/RAM/Latency"]
        Alerts["⚠️ /api/alerts<br/>Thresholds"]
        Pipeline2["🚀 /api/pipeline<br/>GitHub Actions"]
        Logs["📋 /api/logs<br/>Container logs"]
        Settings2["⚙️ /api/settings<br/>User prefs"]
        Terminal2["⌨️ /terminal<br/>WebSocket SSH"]
    end

    subgraph Core["Core Services"]
        Encrypt["🔒 AES-256-GCM<br/>Encryption"]
        Hash["🔑 PBKDF2-SHA512<br/>Hashing"]
        SSH["🔌 SSH2<br/>Tunnels"]
        Fetch["📡 fetch<br/>GitHub API"]
        WS["🌐 WebSocket<br/>Real-time"]
    end

    subgraph Data["💾 DATA STORAGE"]
        DB["SQLite<br/>13 tables<br/>Multi-tenant"]
        Cache["Memory<br/>Session cache"]
    end

    subgraph External["🌍 EXTERNAL SERVICES"]
        VPS1["VPS 1<br/>SSH Docker"]
        VPS2["VPS N<br/>SSH Docker"]
        GitHub["GitHub API<br/>Actions/Webhooks"]
    end

    subgraph Jobs["⚙️ BACKGROUND JOBS"]
        CollectMetrics["collectAll<br/>Every 2min"]
        Cleanup["Cleanup<br/>Hourly"]
    end

    Client -->|HTTP/WS| FrontendCore
    FrontendCore -->|apiFetch| API
    API -->|HTTP/Cookie| Backend
    Backend -->|Encrypt/Hash| Core
    Core -->|SSH2/Fetch/WS| External
    Backend --> Data
    Data -->|Query/Update| DB
    Backend --> Jobs
    Jobs -->|SSH| VPS1
    Jobs -->|SSH| VPS2
    Jobs -->|Fetch| GitHub

    style Client fill:#1e40af
    style Backend fill:#059669
    style Data fill:#dc2626
    style External fill:#7c3aed
    style Jobs fill:#f59e0b
