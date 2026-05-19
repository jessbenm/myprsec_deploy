# Docker Compose — Guide complet

## Commandes essentielles

```bash
docker compose up -d               # démarrer en arrière-plan
docker compose up -d --build       # rebuild avant démarrer
docker compose down                # arrêter et supprimer les conteneurs
docker compose down -v             # ⚠️ aussi supprimer les volumes
docker compose ps                  # état des services
docker compose logs -f             # suivre tous les logs
docker compose logs -f <service>   # logs d'un service
docker compose restart <service>   # redémarrer un service
docker compose exec <service> sh   # shell dans un service
docker compose build <service>     # rebuilder un service
docker compose pull                # mettre à jour les images
```

## Rebuild et redéploiement

```bash
# Rebuild et redémarrer un seul service
docker compose build backend && docker compose up -d backend

# Forcer le rebuild sans cache
docker compose build --no-cache backend

# Pull les nouvelles images et redémarrer
docker compose pull && docker compose up -d
```

## Structure d'un docker-compose.yml

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
    volumes:
      - ./data:/app/data
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - internal

  db:
    image: postgres:15-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - internal

volumes:
  postgres_data:

networks:
  internal:
    internal: true
```

## Variables d'environnement

```bash
# Fichier .env à la racine (automatiquement lu par docker compose)
POSTGRES_PASSWORD=secret
API_KEY=abc123

# Dans docker-compose.yml
environment:
  - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
  - API_KEY=${API_KEY}

# Vérifier que les variables sont bien résolues
docker compose config
```

## Healthchecks

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

```bash
# Voir l'état des healthchecks
docker compose ps
docker inspect <container> | grep -A10 Health
```

## Diagnostics courants

### Service qui ne démarre pas
```bash
docker compose logs <service>               # voir l'erreur
docker compose logs --tail=50 <service>
docker compose up <service>                 # démarrer en premier plan pour voir
```

### Service dépendant qui échoue
```bash
# Vérifier l'ordre de démarrage avec depends_on + condition: service_healthy
docker compose ps  # voir quels services sont "healthy"
docker inspect <container> | grep -A5 Health
```

### Conflit de ports
```bash
ss -tulnp | grep <port>
# Modifier le mapping ports dans docker-compose.yml : "8080:3000"
```

### Volume non monté / données perdues
```bash
docker volume ls
docker volume inspect <volume>
docker compose down  # ne supprime PAS les volumes par défaut
```

## Commandes de débogage avancées

```bash
# Voir la configuration résolue (variables, etc.)
docker compose config

# Voir les images utilisées
docker compose images

# Forcer la récréation d'un conteneur
docker compose up -d --force-recreate <service>

# Scale un service
docker compose up -d --scale worker=3

# Exécuter une commande sans démarrer en arrière-plan
docker compose run --rm <service> <commande>
```
