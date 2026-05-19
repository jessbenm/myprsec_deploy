# GitHub Actions — Guide complet

## Structure d'un workflow

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:              # déclenchement manuel

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/myapp
            git pull
            docker compose build --no-cache
            docker compose up -d
```

## Secrets et variables

```bash
# Accéder aux secrets dans un workflow
${{ secrets.MY_SECRET }}

# Variables d'environnement (non sensibles)
${{ vars.MY_VAR }}

# Variables d'environnement dans un step
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
  NODE_ENV: production
```

## Déclencher un workflow manuellement (API)

```bash
# Via curl
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/<owner>/<repo>/actions/workflows/<workflow.yml>/dispatches \
  -d '{"ref":"main","inputs":{}}'
```

## Voir les runs récents (API)

```bash
curl -H "Authorization: Bearer <token>" \
  https://api.github.com/repos/<owner>/<repo>/actions/runs?per_page=10
```

## Relancer un run échoué

```bash
# Via UI : bouton "Re-run jobs"
# Via API :
curl -X POST \
  -H "Authorization: Bearer <token>" \
  https://api.github.com/repos/<owner>/<repo>/actions/runs/<run_id>/rerun-failed-jobs
```

## Patterns utiles

### Cache des dépendances

```yaml
- uses: actions/cache@v3
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-
```

### Déploiement conditionnel (seulement sur main)

```yaml
- name: Deploy
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  run: ./deploy.sh
```

### Matrix (tester sur plusieurs versions)

```yaml
strategy:
  matrix:
    node-version: [18, 20, 22]
steps:
  - uses: actions/setup-node@v4
    with:
      node-version: ${{ matrix.node-version }}
```

### Notification Slack/Discord sur échec

```yaml
- name: Notify on failure
  if: failure()
  uses: rtCamp/action-slack-notify@v2
  env:
    SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
    SLACK_COLOR: danger
    SLACK_MESSAGE: 'Deploy failed on ${{ github.ref }}'
```

## Diagnostics courants

### Workflow qui ne se déclenche pas
- Vérifier la syntaxe YAML (indentation, guillemets)
- Vérifier que `on:` correspond à l'événement (push vs pull_request)
- Le workflow doit être sur la branche par défaut pour être actif

### Erreur "Permission denied" sur SSH
```bash
# Vérifier le secret VPS_SSH_KEY
# La clé doit être au format PEM complet (avec -----BEGIN----- et -----END-----)
cat ~/.ssh/id_rsa   # copier le contenu ENTIER dans le secret
```

### "Resource not accessible by integration"
- Le token `GITHUB_TOKEN` manque de permissions
- Ajouter dans le workflow :
```yaml
permissions:
  contents: read
  packages: write
```

### Step qui prend trop de temps
```yaml
- name: Deploy
  timeout-minutes: 10          # timeout du step
  run: ./deploy.sh
```
