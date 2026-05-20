# PROMPT CLAUDE CODE — MyPresc Deploy : RAG DevOps Assistant + Extensions Outils

> Colle tout ce texte dans Claude Code depuis la racine du projet MyPresc Deploy.

---

## RÈGLE ABSOLUE AVANT TOUT

**Lis entièrement le projet avant d'écrire une seule ligne de code.**
Tu ne modifies rien, tu n'installes rien, tu ne crées rien tant que tu n'as pas terminé la Phase 1 complète et produit le rapport de diagnostic. Toute action prématurée est interdite.

---

## PHASE 1 — DIAGNOSTIC COMPLET DU PROJET (LECTURE SEULE)

Lis et analyse dans leur intégralité les fichiers suivants :

- `README.md`
- `monitoring-backend/index.js` (fichier principal backend — routes, DB, auth, SSH, WebSocket, métriques, GitHub Actions, chiffrement)
- `monitoring-backend/package.json`
- `package.json` (frontend)
- `src/pages/*.tsx` (toutes les pages React)
- `src/components/*.tsx` (tous les composants)
- `src/lib/api.ts` (helper HTTP)
- `src/App.tsx` ou `src/main.tsx` (routing principal, sidebar)
- `docker-compose.yml` et `docker-compose.dev.yml`
- `infra/.env.example`
- `infra/scripts/*.sh` (tous les scripts)
- Tout autre fichier `.ts`, `.tsx`, `.js`, `.json` à la racine ou dans `src/`

Après lecture complète, produis un rapport de diagnostic structuré :

### 1.1 — Stack complète
- Frontend : framework, version, liste de toutes les pages, routing, composants principaux
- Backend : framework, version, liste de toutes les routes groupées par catégorie, middlewares
- Base de données : toutes les tables avec colonnes, relations, index, contraintes
- Infrastructure : services Docker, réseau, volumes, Nginx, SSL, Redis
- Authentification : mécanisme complet, durée session, chiffrement utilisé
- WebSocket : implémentation, canal SSH, terminal
- CI/CD : intégration GitHub Actions, tables concernées, endpoints
- Jobs background : intervalles, actions, tables mises à jour
- Sidebar : liste exacte des liens actuels, composant concerné, comment ajouter un lien

### 1.2 — Points d'intégration disponibles
- Où hooker de nouvelles intégrations dans `index.js`
- Tables DB qui auront besoin de tables complémentaires
- Pages frontend où de nouvelles données peuvent s'afficher
- Pattern SSH exact utilisé pour la collecte de métriques (base pour nouvelles intégrations)
- Pattern de chiffrement exact (AES-256-GCM, fonctions `encrypt()` / `decrypt()`)
- Pattern `requireAuth` middleware exact à reproduire pour chaque nouvel endpoint

### 1.3 — Contraintes et risques
- Variables d'environnement actuellement utilisées (liste exhaustive)
- Ports utilisés (internes et externes)
- Valeurs hardcodées pouvant créer des conflits
- Pattern d'isolation multi-tenant (comment `user_id` est appliqué partout)

**Attends ma confirmation avant de passer à la Phase 2.**

---

## PHASE 2 — SYSTÈME DE DÉTECTION D'OUTILS PAR VPS

Implémente un système de détection automatique qui s'exécute à chaque connexion SSH d'un VPS.

### 2.1 — Règles de détection

- **Lecture seule** : aucune installation, aucune modification, aucun redémarrage
- **Non bloquant** : si un outil est absent, skip silencieux, jamais d'erreur
- **Isolé par VPS et par user** : résultats stockés par `user_id` + `vps_id`
- **Mis en cache** : stocké en DB, re-scanné uniquement sur demande explicite ou toutes les 6h

Commandes SSH de détection (toutes avec `2>/dev/null || echo "NOT_FOUND"`) :

```bash
# Docker
docker --version 2>/dev/null || echo "NOT_FOUND"
docker compose version 2>/dev/null || echo "NOT_FOUND"
docker ps --format "{{.Names}},{{.Status}},{{.Image}},{{.Ports}}" 2>/dev/null || echo "NOT_FOUND"

# Kubernetes
kubectl version --client 2>/dev/null || echo "NOT_FOUND"
kubectl get nodes --no-headers 2>/dev/null || echo "NOT_FOUND"
which k3s 2>/dev/null || echo "NOT_FOUND"
which microk8s 2>/dev/null || echo "NOT_FOUND"

# Nginx
nginx -v 2>&1 || echo "NOT_FOUND"
systemctl is-active nginx 2>/dev/null || echo "NOT_FOUND"
ls /etc/nginx/sites-enabled/ 2>/dev/null || echo "NOT_FOUND"

# GitLab Runner
gitlab-runner --version 2>/dev/null || echo "NOT_FOUND"
systemctl is-active gitlab-runner 2>/dev/null || echo "NOT_FOUND"

# Jenkins
systemctl is-active jenkins 2>/dev/null || echo "NOT_FOUND"
curl -s http://localhost:8080/api/json 2>/dev/null | head -c 100 || echo "NOT_FOUND"

# Ansible
ansible --version 2>/dev/null | head -1 || echo "NOT_FOUND"

# Terraform
terraform version 2>/dev/null | head -1 || echo "NOT_FOUND"

# Prometheus
systemctl is-active prometheus 2>/dev/null || echo "NOT_FOUND"
curl -s http://localhost:9090/-/healthy 2>/dev/null || echo "NOT_FOUND"

# Runtimes
node --version 2>/dev/null || echo "NOT_FOUND"
python3 --version 2>/dev/null || echo "NOT_FOUND"
java -version 2>&1 | head -1 || echo "NOT_FOUND"
php --version 2>/dev/null | head -1 || echo "NOT_FOUND"

# Détection des projets actifs sur le VPS
ls /var/www/ 2>/dev/null || echo "NOT_FOUND"
ls /opt/ 2>/dev/null || echo "NOT_FOUND"
ls ~/projects/ 2>/dev/null || echo "NOT_FOUND"
find /home -name "docker-compose.yml" 2>/dev/null | head -10 || echo "NOT_FOUND"
find /opt -name "docker-compose.yml" 2>/dev/null | head -10 || echo "NOT_FOUND"
find /var/www -name "package.json" -maxdepth 3 2>/dev/null | head -10 || echo "NOT_FOUND"
find /var/www -name "requirements.txt" -maxdepth 3 2>/dev/null | head -10 || echo "NOT_FOUND"
find /var/www -name "pom.xml" -maxdepth 3 2>/dev/null | head -10 || echo "NOT_FOUND"

# Services systemd actifs
systemctl list-units --type=service --state=running --no-legend 2>/dev/null | head -30
```

### 2.2 — Tables DB à ajouter

Respecte exactement le même pattern multi-tenant que les tables existantes (`user_id` partout) :

```sql
CREATE TABLE IF NOT EXISTS vps_detected_tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  vps_id INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  tool_version TEXT,
  is_active INTEGER DEFAULT 0,
  detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  raw_output TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (vps_id) REFERENCES vps(id) ON DELETE CASCADE,
  UNIQUE(user_id, vps_id, tool_name)
);

CREATE TABLE IF NOT EXISTS vps_detected_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  vps_id INTEGER NOT NULL,
  project_name TEXT NOT NULL,
  project_path TEXT NOT NULL,
  project_type TEXT,
  tech_stack TEXT,
  is_running INTEGER DEFAULT 0,
  detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (vps_id) REFERENCES vps(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_detected_tools_vps ON vps_detected_tools(user_id, vps_id);
CREATE INDEX IF NOT EXISTS idx_detected_projects_vps ON vps_detected_projects(user_id, vps_id);
```

### 2.3 — Endpoints de détection (dans `monitoring-backend/index.js`)

```
GET  /api/vps/:id/detected-tools     → retourne tous les outils détectés
GET  /api/vps/:id/detected-projects  → retourne tous les projets détectés
POST /api/vps/:id/detect             → déclenche un scan complet (outils + projets)
```

---

## PHASE 3 — INTÉGRATIONS DES 6 OUTILS (dans `monitoring-backend/index.js`)

**Règle absolue** : chaque intégration est activée UNIQUEMENT si l'outil a été détecté sur ce VPS. Si non détecté → skip silencieux, jamais d'erreur, jamais d'impact sur les fonctionnalités existantes (Docker, Nginx, GitHub Actions doivent fonctionner parfaitement après chaque ajout).

---

### OUTIL 1 — GitLab CI/CD

**Connexion** : API GitLab + token chiffré avec `encrypt()` / `decrypt()` existant.

**Tables à ajouter** :
```sql
CREATE TABLE IF NOT EXISTS gitlab_integrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  vps_id INTEGER NOT NULL,
  gitlab_url TEXT NOT NULL,
  project_id TEXT NOT NULL,
  token_encrypted TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (vps_id) REFERENCES vps(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gitlab_pipeline_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  vps_id INTEGER NOT NULL,
  pipeline_id TEXT NOT NULL,
  status TEXT,
  ref TEXT,
  sha TEXT,
  duration INTEGER,
  started_at DATETIME,
  finished_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (vps_id) REFERENCES vps(id) ON DELETE CASCADE
);
```

**Endpoints** :
```
POST /api/vps/:id/gitlab/connect
GET  /api/vps/:id/gitlab/pipelines
GET  /api/vps/:id/gitlab/pipelines/:pid
POST /api/vps/:id/gitlab/pipelines/:pid/retry
GET  /api/vps/:id/gitlab/runner-status
```

---

### OUTIL 2 — Kubernetes (kubectl / k3s / microk8s)

**Connexion** : SSH uniquement, commandes `kubectl` en remote. READ-ONLY absolu — jamais de `apply`, `delete`, `patch`.

**Coexistence Docker** : si Docker ET Kubernetes sont détectés sur le même VPS, les deux s'affichent dans des sections séparées et indépendantes. Aucun conflit possible.

**Tables à ajouter** :
```sql
CREATE TABLE IF NOT EXISTS k8s_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  vps_id INTEGER NOT NULL,
  nodes_json TEXT,
  pods_json TEXT,
  deployments_json TEXT,
  services_json TEXT,
  namespaces_json TEXT,
  collected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (vps_id) REFERENCES vps(id) ON DELETE CASCADE
);
```

**Endpoints** :
```
GET /api/vps/:id/k8s/overview
GET /api/vps/:id/k8s/pods
GET /api/vps/:id/k8s/deployments
GET /api/vps/:id/k8s/services
GET /api/vps/:id/k8s/logs/:namespace/:pod
```

---

### OUTIL 3 — Ansible

**Connexion** : SSH. Scan des chemins `~/playbooks`, `/etc/ansible`, `/opt/ansible`.

**Sécurité** : ne jamais exécuter un playbook automatiquement. Seulement lister et afficher les logs existants. L'exécution manuelle requiert une confirmation explicite dans l'UI.

**Tables à ajouter** :
```sql
CREATE TABLE IF NOT EXISTS ansible_playbooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  vps_id INTEGER NOT NULL,
  playbook_path TEXT NOT NULL,
  playbook_name TEXT NOT NULL,
  last_run_at DATETIME,
  last_run_status TEXT,
  discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (vps_id) REFERENCES vps(id) ON DELETE CASCADE
);
```

**Endpoints** :
```
GET  /api/vps/:id/ansible/playbooks
POST /api/vps/:id/ansible/playbooks/scan
GET  /api/vps/:id/ansible/logs
```

---

### OUTIL 4 — Terraform

**Connexion** : SSH. Scan des workspaces, lecture `terraform show -json` et `terraform state list`. READ-ONLY absolu — jamais de `apply`, `destroy`, `plan`.

**Tables à ajouter** :
```sql
CREATE TABLE IF NOT EXISTS terraform_workspaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  vps_id INTEGER NOT NULL,
  workspace_path TEXT NOT NULL,
  workspace_name TEXT,
  resource_count INTEGER DEFAULT 0,
  last_apply_at DATETIME,
  state_json TEXT,
  scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (vps_id) REFERENCES vps(id) ON DELETE CASCADE
);
```

**Endpoints** :
```
GET  /api/vps/:id/terraform/workspaces
POST /api/vps/:id/terraform/workspaces/scan
GET  /api/vps/:id/terraform/state/:wsid
```

---

### OUTIL 5 — Prometheus

**Connexion** : HTTP vers `VPS_IP:9090` (port configurable). Si injoignable → `{ available: false }`, jamais d'erreur.

**Tables à ajouter** :
```sql
CREATE TABLE IF NOT EXISTS prometheus_integrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  vps_id INTEGER NOT NULL,
  prometheus_url TEXT NOT NULL DEFAULT 'http://localhost:9090',
  enabled INTEGER DEFAULT 1,
  last_checked_at DATETIME,
  is_reachable INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (vps_id) REFERENCES vps(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS prometheus_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  vps_id INTEGER NOT NULL,
  alert_name TEXT,
  severity TEXT,
  state TEXT,
  summary TEXT,
  fired_at DATETIME,
  resolved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (vps_id) REFERENCES vps(id) ON DELETE CASCADE
);
```

**Endpoints** :
```
POST /api/vps/:id/prometheus/connect
GET  /api/vps/:id/prometheus/targets
GET  /api/vps/:id/prometheus/alerts
GET  /api/vps/:id/prometheus/query
```

---

### OUTIL 6 — Jenkins

**Connexion** : API REST Jenkins `http://VPS_IP:8080/api/json`. Username + token chiffré.

**Tables à ajouter** :
```sql
CREATE TABLE IF NOT EXISTS jenkins_integrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  vps_id INTEGER NOT NULL,
  jenkins_url TEXT NOT NULL,
  username TEXT NOT NULL,
  token_encrypted TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (vps_id) REFERENCES vps(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS jenkins_builds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  vps_id INTEGER NOT NULL,
  job_name TEXT NOT NULL,
  build_number INTEGER,
  status TEXT,
  duration INTEGER,
  timestamp DATETIME,
  url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (vps_id) REFERENCES vps(id) ON DELETE CASCADE
);
```

**Endpoints** :
```
POST /api/vps/:id/jenkins/connect
GET  /api/vps/:id/jenkins/jobs
GET  /api/vps/:id/jenkins/jobs/:name
POST /api/vps/:id/jenkins/jobs/:name/build
```

---

## PHASE 4 — RAG DEVOPS ASSISTANT (ENTITÉ SÉPARÉE)

Le RAG est une entité totalement indépendante du backend principal. Il vit dans son propre dossier, tourne sur son propre port, et communique avec le backend via HTTP pour récupérer les données des VPS et des utilisateurs.

### 4.1 — Structure du dossier RAG

Crée le dossier `rag/` à la racine du projet avec cette structure exacte :

```
rag/
├── server.js                  ← serveur Express du RAG (port 3002)
├── package.json               ← dépendances indépendantes
├── .env.example               ← variables propres au RAG
├── Dockerfile                 ← conteneur Docker indépendant
│
├── knowledge-base/            ← fichiers Markdown de connaissance DevOps
│   ├── docker.md
│   ├── docker-compose.md
│   ├── kubernetes.md
│   ├── nginx.md
│   ├── ssl-certbot.md
│   ├── gitlab-ci.md
│   ├── github-actions.md
│   ├── jenkins.md
│   ├── ansible.md
│   ├── terraform.md
│   ├── prometheus.md
│   ├── linux-server.md
│   ├── ssh-security.md
│   ├── nodejs-deployment.md
│   ├── python-deployment.md
│   └── database-ops.md
│
├── lib/
│   ├── chunker.js             ← découpe les .md en chunks
│   ├── embeddings.js          ← calcul similarité cosinus (sans dépendance externe)
│   ├── retriever.js           ← cherche les chunks pertinents
│   ├── context-builder.js     ← construit le contexte VPS + projets
│   ├── guardrail.js           ← filtre les questions hors-sujet
│   └── llm.js                 ← appel API Claude Sonnet
│
└── index/
    └── knowledge-index.json   ← index vectoriel généré au démarrage (gitignored)
```

### 4.2 — Contenu des fichiers de knowledge-base

Chaque fichier Markdown DOIT contenir pour chaque sujet :
- Description courte du problème / usage
- Commandes exactes copiables avec explication de chaque argument
- Cas d'erreurs fréquentes et leurs solutions avec commandes
- Notes de prudence pour les commandes dangereuses

Exemples de contenu à couvrir par fichier :

**docker.md** : `docker ps`, `docker logs`, `docker exec`, `docker inspect`, `docker stats`, crashloop diagnosis, OOM killer, volume permissions, network debug, image cleanup, `docker system prune`

**kubernetes.md** : `kubectl get pods`, `kubectl describe`, `kubectl logs`, `kubectl top`, CrashLoopBackOff diagnosis, Pending pod reasons, service not reachable, resource limits, namespace management

**nginx.md** : test config `nginx -t`, reload `systemctl reload nginx`, 502 bad gateway causes and fixes, SSL config, reverse proxy patterns, log analysis, rate limiting

**linux-server.md** : CPU/RAM analysis (`top`, `htop`, `free`, `vmstat`), disk full diagnosis (`df`, `du`, `ncdu`), process management, `journalctl`, `systemctl`, cron jobs, file permissions

**ssl-certbot.md** : `certbot renew`, certificate expiry check, Let's Encrypt rate limits, Nginx SSL config, `openssl` verification commands

*(Remplis chaque fichier avec un contenu réel, complet, et opérationnel — pas de placeholders)*

### 4.3 — Logic du RAG (`rag/server.js`)

Le serveur RAG expose un seul endpoint principal :

```
POST /rag/ask
Headers: Authorization: Bearer <same JWT token as main backend>
Body: {
  question: string,
  vps_id?: number,
  session_id?: string
}
```

**Pipeline de traitement complet** :

```
1. GUARDRAIL
   ↓ Appel rapide à Claude Sonnet avec prompt de classification
   ↓ Si hors-sujet → retourner { off_topic: true, message: "..." }
   ↓ Si DevOps → continuer

2. CONTEXT BUILDER
   ↓ Si vps_id fourni :
     - GET http://backend:3001/api/vps/:id/detected-tools (avec JWT)
     - GET http://backend:3001/api/vps/:id/detected-projects (avec JWT)
     - GET http://backend:3001/api/vps/:id/metrics/latest (avec JWT)
     - GET http://backend:3001/api/vps/:id/alerts (avec JWT)
   ↓ Construire le bloc de contexte VPS structuré

3. RETRIEVER
   ↓ Calculer similarité cosinus entre la question et tous les chunks
   ↓ Sélectionner les 5 chunks les plus pertinents
   ↓ Filtrer les chunks selon les outils détectés sur le VPS

4. PROJECT ANALYZER (si vps_id fourni)
   ↓ Analyser les projets détectés sur le VPS
   ↓ Identifier la tech stack de chaque projet
   ↓ Préparer des suggestions de travail sur ces projets

5. LLM CALL
   ↓ Construire le prompt final avec tout le contexte
   ↓ Appel Claude Sonnet (claude-sonnet-4-20250514)
   ↓ Parser la réponse structurée

6. RESPONSE
   ↓ Retourner : { answer, commands[], steps[], sources[], vps_context_used, suggested_projects[] }
```

### 4.4 — Prompt système du RAG LLM

```
Tu es un assistant DevOps expert intégré à MyPresc Deploy.

PÉRIMÈTRE STRICT : Tu réponds UNIQUEMENT aux questions concernant :
Docker, Docker Compose, Kubernetes, k3s, microk8s, Linux, Nginx, SSL/TLS, 
Let's Encrypt, Certbot, CI/CD, GitHub Actions, GitLab CI, Jenkins, 
Ansible, Terraform, Prometheus, SSH, systemd, cron, sécurité serveur, 
déploiement d'applications, bases de données (MySQL, PostgreSQL, Redis, SQLite, MongoDB), 
Node.js, Python, PHP, Java, monitoring, logs, performance serveur.

Si la question est hors de ce périmètre, réponds avec : HORS_SUJET

RÈGLES DE RÉPONSE :
1. Toujours proposer des commandes exactes et copiables
2. Structurer la réponse en : Diagnostic → Commandes → Explication → Avertissements
3. Si un contexte VPS est fourni, personnalise ta réponse selon les outils détectés
4. Si des projets sont détectés sur le VPS, propose de les analyser ou d'y travailler
5. Signale clairement les commandes dangereuses avec ⚠️
6. Pour chaque commande, explique ce qu'elle fait et quand l'utiliser
7. Réponds en français si la question est en français, en anglais sinon

FORMAT DE RÉPONSE (respecte ce JSON strict) :
{
  "answer": "explication complète en prose",
  "commands": [
    { "cmd": "commande exacte", "description": "ce que fait cette commande", "dangerous": false }
  ],
  "steps": ["étape 1", "étape 2", "..."],
  "warnings": ["avertissement si applicable"],
  "suggested_projects": ["projet détecté sur le VPS à analyser"],
  "sources": ["docker.md", "linux-server.md"]
}
```

### 4.5 — Guardrail (`rag/lib/guardrail.js`)

```javascript
// Appel Claude Sonnet pour classifier la question
const CLASSIFICATION_PROMPT = `
Analyse cette question et réponds uniquement par "DEVOPS" ou "OFF_TOPIC".
Est-ce une question liée à : Docker, Kubernetes, Linux, Nginx, CI/CD, 
GitLab, Jenkins, Ansible, Terraform, Prometheus, SSH, SSL, déploiement, 
monitoring serveur, bases de données, sécurité serveur ?

Question : {question}

Réponds uniquement : DEVOPS ou OFF_TOPIC
`;

// Si OFF_TOPIC → ne pas appeler le RAG complet, retourner immédiatement :
{
  off_topic: true,
  message: "Je suis spécialisé en DevOps et infrastructure. Je ne peux pas répondre à cette question. Essaie de me demander quelque chose lié à Docker, Kubernetes, Nginx, CI/CD, Linux, ou la gestion de tes serveurs."
}
```

### 4.6 — Chunker et index vectoriel (`rag/lib/chunker.js` + `embeddings.js`)

Implémente un système d'embedding simple sans dépendance externe :

```javascript
// chunker.js : découpe chaque .md en chunks de ~500 tokens avec overlap de 50 tokens
// Chaque chunk contient : { id, source_file, content, keywords[] }

// embeddings.js : représentation TF-IDF simple pour la similarité cosinus
// Au démarrage du serveur RAG :
//   1. Lire tous les .md dans knowledge-base/
//   2. Les découper en chunks
//   3. Calculer les vecteurs TF-IDF
//   4. Sauvegarder dans rag/index/knowledge-index.json
// À chaque question :
//   1. Calculer le vecteur TF-IDF de la question
//   2. Comparer avec tous les chunks par similarité cosinus
//   3. Retourner les 5 chunks avec le score le plus élevé
```

### 4.7 — Context Builder (`rag/lib/context-builder.js`)

```javascript
// Construit ce bloc texte injecté dans le prompt LLM si vps_id fourni :

`
=== CONTEXTE DU VPS SÉLECTIONNÉ ===
Hostname : ${vps.hostname}
IP : ${vps.ip}
OS : ${vps.os || 'Linux'}

--- Métriques actuelles ---
CPU : ${metrics.cpu_percent}%
RAM : ${metrics.ram_used_mb}MB / ${metrics.ram_total_mb}MB (${ramPercent}%)
Disque : ${metrics.disk_percent}%
Uptime : ${metrics.uptime}

--- Outils détectés sur ce VPS ---
${detectedTools.map(t => `✓ ${t.tool_name} ${t.tool_version || ''}`).join('\n')}

--- Projets détectés sur ce VPS ---
${detectedProjects.map(p => `• ${p.project_name} (${p.tech_stack}) — ${p.is_running ? 'En cours' : 'Arrêté'} — ${p.project_path}`).join('\n')}

--- Alertes actives ---
${alerts.length > 0 ? alerts.map(a => `⚠️ ${a.type} : ${a.message}`).join('\n') : 'Aucune alerte active'}

--- Containers Docker actifs ---
${dockerContainers.map(c => `• ${c.name} (${c.status}) — image: ${c.image}`).join('\n')}
=================================
`
```

### 4.8 — `rag/package.json`

```json
{
  "name": "mypresc-rag",
  "version": "1.0.0",
  "type": "module",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "dotenv": "^16.0.0",
    "node-fetch": "^3.0.0",
    "jsonwebtoken": "^9.0.0"
  }
}
```

### 4.9 — `rag/Dockerfile`

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3002
CMD ["node", "server.js"]
```

### 4.10 — Variables d'environnement du RAG (`rag/.env.example`)

```env
# Port du serveur RAG
RAG_PORT=3002

# Clé API Anthropic pour le LLM
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# URL du backend principal (pour récupérer les données VPS)
BACKEND_URL=http://backend:3001

# Secret JWT partagé avec le backend (DOIT être identique à JWT_SECRET du backend)
JWT_SECRET=your_jwt_secret_here

# Chemin vers la knowledge base
KNOWLEDGE_BASE_PATH=./knowledge-base

# Chemin vers l'index vectoriel généré
INDEX_PATH=./index/knowledge-index.json

# Modèle Claude à utiliser
CLAUDE_MODEL=claude-sonnet-4-20250514

# Nombre de chunks à récupérer par question
RAG_TOP_K=5
```

---

## PHASE 5 — INTÉGRATION DANS LE PROJET PRINCIPAL

### 5.1 — Ajouter le service RAG dans `docker-compose.yml`

```yaml
  rag:
    build: ./rag
    container_name: mypresc-rag
    restart: unless-stopped
    ports:
      - "3002:3002"
    environment:
      - RAG_PORT=3002
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - BACKEND_URL=http://backend:3001
      - JWT_SECRET=${JWT_SECRET}
      - CLAUDE_MODEL=claude-sonnet-4-20250514
      - RAG_TOP_K=5
    depends_on:
      - backend
    networks:
      - mypresc-network
    volumes:
      - ./rag/index:/app/index
```

### 5.2 — Ajouter dans Nginx (`infra/nginx.conf`)

```nginx
location /rag/ {
    proxy_pass http://rag:3002/rag/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header Authorization $http_authorization;
}
```

### 5.3 — Ajouter dans `infra/.env.example` (variables manquantes)

Ajoute ces variables à la fin du fichier `.env.example` existant sans supprimer ce qui existe déjà :

```env
# ============================================
# RAG DEVOPS ASSISTANT
# ============================================
ANTHROPIC_API_KEY=your_anthropic_api_key_here
RAG_PORT=3002
CLAUDE_MODEL=claude-sonnet-4-20250514

# ============================================
# INTÉGRATIONS OUTILS (optionnelles par VPS)
# ============================================
# GitLab (configuré par user via UI, stocké chiffré en DB)
# Jenkins (configuré par user via UI, stocké chiffré en DB)
# Prometheus (configuré par user via UI, stocké chiffré en DB)
```

### 5.4 — Proxy dans le backend (`monitoring-backend/index.js`)

Ajoute un endpoint proxy pour que le frontend n'ait qu'un seul point d'entrée :

```javascript
// Proxy RAG — transmet la requête au service RAG avec le JWT de l'utilisateur
app.post('/api/rag/ask', requireAuth, async (req, res) => {
  try {
    const response = await fetch(`${process.env.RAG_URL || 'http://rag:3002'}/rag/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.authorization
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.json({
      answer: "L'assistant DevOps est temporairement indisponible. Vérifie ta connexion.",
      commands: [],
      steps: [],
      off_topic: false,
      error: true
    });
  }
});
```

Ajoute aussi dans `.env.example` du backend :
```env
RAG_URL=http://rag:3002
```

---

## PHASE 6 — INTERFACE FRONTEND : PAGE CHATBOT DEVOPS

### 6.1 — Page `src/pages/DevOpsAssistant.tsx`

Crée une page complète de chat qui ressemble à un vrai LLM chat avec ces éléments :

**En-tête de page** :
- Titre "Assistant DevOps" avec icône robot
- Sélecteur de VPS (dropdown avec tous les VPS de l'utilisateur)
- Quand un VPS est sélectionné : badge vert "Analyse de prod-server-01" + badges des outils détectés (Docker ✓, Nginx ✓, etc.)

**Zone de chat** :
- Messages utilisateur alignés à droite (bulle bleue)
- Messages assistant alignés à gauche (bulle grise/sombre)
- Les commandes dans la réponse sont rendues dans des blocs `<code>` avec bouton "Copier" sur chaque commande
- Les étapes sont numérotées automatiquement
- Les avertissements (⚠️) sont affichés avec un fond orange/rouge
- Indicateur de frappe animé pendant que le RAG réfléchit

**Suggestions de projets** :
- Si le RAG retourne `suggested_projects[]`, afficher des chips cliquables sous la réponse
- Cliquer sur un projet envoie automatiquement la question "Analyse le projet {nom} sur ce VPS"

**Questions rapides** :
- Afficher des boutons de questions fréquentes au démarrage du chat :
  - "Analyse mon VPS sélectionné"
  - "Quels projets tournent sur mon VPS ?"
  - "Mon container redémarre en boucle, comment diagnostiquer ?"
  - "Vérifie la santé de mes services"
  - "Optimise les performances de mon serveur"

**Sources** :
- Chaque réponse affiche en bas les sources utilisées (noms des fichiers .md)

**Intégration terminal** :
- Si l'utilisateur est sur la page d'un VPS avec terminal SSH intégré, bouton "Exécuter dans le terminal" sous chaque commande

**Historique de session** :
- Conserver l'historique de la conversation en mémoire pendant la session (pas de persistance nécessaire en DB pour l'instant)
- Bouton "Nouvelle conversation" pour réinitialiser

### 6.2 — Ajouter dans la sidebar

Repère le composant sidebar exact dans le projet (à identifier en Phase 1). Ajoute :

```tsx
// Dans la liste des liens de navigation, ajouter :
{
  path: '/assistant',
  label: 'Assistant DevOps',
  icon: <BotIcon />,  // ou l'icône disponible dans le projet
}
```

### 6.3 — Ajouter la route dans le router principal

Dans `src/App.tsx` ou le fichier de routing identifié en Phase 1 :

```tsx
import DevOpsAssistant from './pages/DevOpsAssistant';
// Dans les routes :
<Route path="/assistant" element={<DevOpsAssistant />} />
```

### 6.4 — Ajouter dans `src/lib/api.ts`

```typescript
export const askRAG = async (question: string, vps_id?: number) => {
  return apiFetch('/api/rag/ask', {
    method: 'POST',
    body: JSON.stringify({ question, vps_id })
  });
};

export const detectVpsTools = async (vpsId: number) => {
  return apiFetch(`/api/vps/${vpsId}/detect`, { method: 'POST' });
};

export const getDetectedTools = async (vpsId: number) => {
  return apiFetch(`/api/vps/${vpsId}/detected-tools`);
};

export const getDetectedProjects = async (vpsId: number) => {
  return apiFetch(`/api/vps/${vpsId}/detected-projects`);
};
```

---

## PHASE 7 — VÉRIFICATION FINALE COMPLÈTE

Après avoir tout implémenté, effectue ces vérifications dans l'ordre :

### 7.1 — Vérification des variables d'environnement
- [ ] Toutes les nouvelles variables sont dans `infra/.env.example` avec commentaires
- [ ] Toutes les nouvelles variables sont dans `rag/.env.example`
- [ ] Toutes les nouvelles variables sont référencées dans `docker-compose.yml`
- [ ] Aucune variable n'est hardcodée dans le code

### 7.2 — Vérification des chemins et imports
- [ ] Tous les imports dans le frontend pointent vers des fichiers qui existent
- [ ] Tous les `apiFetch` du frontend correspondent à des endpoints backend réels
- [ ] Le proxy `/api/rag/ask` dans le backend pointe vers la bonne URL du service RAG
- [ ] L'URL Nginx pour `/rag/` pointe vers le bon service et port

### 7.3 — Vérification multi-tenant
- [ ] Chaque nouvelle table a `user_id` avec FK CASCADE
- [ ] Chaque nouvel endpoint utilise `requireAuth`
- [ ] Chaque query SQL filtre par `user_id = req.user.id`

### 7.4 — Vérification des fonctionnalités existantes
- [ ] La collecte de métriques SSH fonctionne toujours
- [ ] Le terminal WebSocket fonctionne toujours
- [ ] GitHub Actions s'affiche toujours
- [ ] Login / logout / session fonctionnent toujours
- [ ] Toutes les pages existantes se chargent sans erreur

### 7.5 — Test du RAG complet
- [ ] Une question DevOps reçoit une réponse avec commandes
- [ ] Une question hors-sujet (météo, cuisine) reçoit le message de refus
- [ ] Avec un VPS sélectionné, la réponse mentionne les outils détectés sur ce VPS
- [ ] Les projets détectés sur le VPS apparaissent dans les suggestions
- [ ] Le bouton "Copier" sur les commandes fonctionne
- [ ] La page `/assistant` est accessible depuis la sidebar

### 7.6 — Test Docker
- [ ] `docker compose build` passe sans erreur
- [ ] `docker compose up` démarre les 3 services (backend, frontend, rag)
- [ ] Les 3 services communiquent correctement

---

## RÈGLES GLOBALES NON-NÉGOCIABLES

1. **Ne jamais casser l'existant** : chaque changement est testé avant de passer au suivant
2. **Multi-tenant sacré** : `user_id` partout, `requireAuth` partout
3. **Dégradation gracieuse** : si un service externe est down → réponse `{ available: false }`, jamais de crash
4. **Chiffrement obligatoire** : tous les tokens et credentials via `encrypt()` / `decrypt()` existants
5. **Docker-compatible** : pas de dépendances natives incompatibles avec Alpine Linux
6. **Zéro variable manquante** : tout est dans `.env.example`, tout est dans `docker-compose.yml`
7. **Zéro chemin mort** : chaque import, chaque fetch, chaque proxy pointe vers quelque chose qui existe réellement
8. **RAG indépendant** : le dossier `rag/` est autonome, il parle au backend via HTTP uniquement, jamais via accès direct à la DB SQLite

---

## ORDRE D'EXÉCUTION

```
Phase 1  → Lire tout → Rapport de diagnostic → Attendre confirmation
Phase 2  → Système de détection outils + projets → Tester sur connexion SSH
Phase 3  → GitLab → vérif existant OK → Kubernetes → vérif → Ansible → vérif
         → Terraform → vérif → Prometheus → vérif → Jenkins → vérif final
Phase 4  → Créer dossier rag/ complet avec tous les fichiers
         → Remplir knowledge-base/ avec contenu réel et complet
         → Implémenter server.js, chunker, embeddings, retriever, guardrail, llm, context-builder
Phase 5  → Intégrer dans docker-compose.yml, nginx.conf, .env.example, proxy backend
Phase 6  → Créer DevOpsAssistant.tsx, ajouter sidebar, router, api.ts
Phase 7  → Checklist de vérification complète point par point
```

**Commence par la Phase 1. Lis tout. Produis le rapport. Attends ma confirmation.**
