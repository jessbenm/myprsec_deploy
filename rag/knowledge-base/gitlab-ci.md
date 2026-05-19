# GitLab CI/CD — Guide complet

## Structure .gitlab-ci.yml

```yaml
stages:
  - build
  - test
  - deploy

variables:
  NODE_ENV: production
  IMAGE_NAME: $CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA

build:
  stage: build
  image: node:20-alpine
  script:
    - npm ci
    - npm run build
  artifacts:
    paths:
      - dist/
    expire_in: 1 hour

test:
  stage: test
  image: node:20-alpine
  script:
    - npm ci
    - npm test

deploy:
  stage: deploy
  image: alpine:latest
  only:
    - main
  before_script:
    - apk add --no-cache openssh-client
    - eval $(ssh-agent -s)
    - echo "$SSH_PRIVATE_KEY" | tr -d '\r' | ssh-add -
    - mkdir -p ~/.ssh && chmod 700 ~/.ssh
    - ssh-keyscan $VPS_HOST >> ~/.ssh/known_hosts
  script:
    - ssh $VPS_USER@$VPS_HOST "cd /opt/myapp && git pull && docker compose up -d --build"
```

## GitLab Runner

```bash
# Installer le runner
curl -L --output /usr/local/bin/gitlab-runner https://gitlab-runner-downloads.s3.amazonaws.com/latest/binaries/gitlab-runner-linux-amd64
chmod +x /usr/local/bin/gitlab-runner

# Enregistrer le runner
gitlab-runner register \
  --url https://gitlab.com \
  --registration-token <token> \
  --executor docker \
  --docker-image alpine:latest \
  --description "mon-serveur"

# Statut
systemctl status gitlab-runner
gitlab-runner status
gitlab-runner list                  # lister les runners configurés

# Vérifier les jobs en cours
gitlab-runner jobs
```

## API GitLab

```bash
# Headers communs
GITLAB_URL=https://gitlab.com
PROJECT_ID=<id>
TOKEN=<personal-access-token>

# Lister les pipelines
curl -H "PRIVATE-TOKEN: $TOKEN" \
  "$GITLAB_URL/api/v4/projects/$PROJECT_ID/pipelines?per_page=10"

# Détails d'un pipeline
curl -H "PRIVATE-TOKEN: $TOKEN" \
  "$GITLAB_URL/api/v4/projects/$PROJECT_ID/pipelines/<pipeline_id>"

# Retry un pipeline échoué
curl -X POST -H "PRIVATE-TOKEN: $TOKEN" \
  "$GITLAB_URL/api/v4/projects/$PROJECT_ID/pipelines/<pipeline_id>/retry"

# Déclencher un pipeline manuellement
curl -X POST -H "PRIVATE-TOKEN: $TOKEN" \
  "$GITLAB_URL/api/v4/projects/$PROJECT_ID/trigger/pipeline" \
  -d "ref=main&token=<trigger_token>"
```

## Variables CI/CD

```yaml
# Utiliser une variable
script:
  - echo $MY_VARIABLE
  - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY

# Variables prédéfinies utiles
# $CI_COMMIT_SHA          — SHA complet du commit
# $CI_COMMIT_SHORT_SHA    — SHA court (8 chars)
# $CI_COMMIT_BRANCH       — nom de la branche
# $CI_REGISTRY_IMAGE      — image du registry GitLab
# $CI_PROJECT_NAME        — nom du projet
# $CI_PIPELINE_ID         — ID du pipeline
```

## Cas d'erreurs fréquentes

### Job "pending" sans démarrer
```bash
# Vérifier que le runner est actif
gitlab-runner status
systemctl start gitlab-runner

# Vérifier les tags du runner vs le job
# Dans .gitlab-ci.yml : retirer "tags:" ou ajouter le tag correspondant
```

### "This job is stuck, there are no runners online"
```bash
# Aucun runner disponible
gitlab-runner register    # enregistrer un nouveau runner
gitlab-runner restart
```

### Erreur "permission denied" sur le registry
```bash
# Vérifier les credentials du registry
docker login registry.gitlab.com -u <username> -p <token>
# Dans le CI : utiliser CI_REGISTRY_USER et CI_REGISTRY_PASSWORD
```

### SSH: Host key verification failed
```yaml
# Ajouter ssh-keyscan dans le job
before_script:
  - ssh-keyscan -H $VPS_HOST >> ~/.ssh/known_hosts
```
