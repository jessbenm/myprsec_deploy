# Docker — Guide complet

## Lister les conteneurs

```bash
docker ps                          # conteneurs actifs
docker ps -a                       # tous les conteneurs (y compris arrêtés)
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}"
```

## Voir les logs d'un conteneur

```bash
docker logs <container>            # tous les logs
docker logs -f <container>         # suivre en temps réel
docker logs --tail 100 <container> # 100 dernières lignes
docker logs --since 1h <container> # depuis 1 heure
docker logs --timestamps <container>
```

## Entrer dans un conteneur

```bash
docker exec -it <container> sh     # shell Alpine/minimal
docker exec -it <container> bash   # bash (si disponible)
docker exec -it <container> /bin/sh
docker exec <container> <commande> # exécuter une commande
```

## Inspecter et déboguer

```bash
docker inspect <container>                  # toutes les infos JSON
docker inspect <container> | grep -i ip     # trouver l'IP
docker stats                                # CPU/RAM en temps réel (tous)
docker stats <container>                    # CPU/RAM d'un seul
docker stats --no-stream                    # snapshot instantané
docker top <container>                      # processus dans le conteneur
docker diff <container>                     # fichiers modifiés
```

## Diagnostiquer un CrashLoop / redémarrage en boucle

```bash
# 1. Voir pourquoi il s'est arrêté
docker logs --tail 50 <container>

# 2. Voir l'état exact
docker inspect <container> | grep -A5 '"State"'

# 3. Démarrer en override pour déboguer
docker run -it --entrypoint sh <image>

# 4. Vérifier les ressources (OOM)
docker inspect <container> | grep -i oom
dmesg | grep -i oom
```

## Erreur OOM Killer (Out of Memory)

```bash
# Vérifier si le conteneur a été tué par OOM
docker inspect <container> | grep OOMKilled
# Si "OOMKilled": true → augmenter la mémoire ou trouver la fuite
docker stats --no-stream <container>  # voir utilisation mémoire

# Limiter la mémoire pour éviter l'OOM système
docker run -m 512m <image>
# Dans docker-compose.yml :
# deploy:
#   resources:
#     limits:
#       memory: 512M
```

## Permissions de volumes

```bash
# Voir l'owner des fichiers dans le volume
docker exec <container> ls -la /path/to/volume

# Corriger les permissions
docker exec -u root <container> chown -R <user>:<group> /path
# Ou dans le Dockerfile : RUN chown -R node:node /app/data
```

## Réseau Docker

```bash
docker network ls                          # lister les réseaux
docker network inspect <network>           # détails
docker network inspect bridge              # réseau par défaut

# Tester la connectivité entre conteneurs
docker exec <container1> ping <container2>
docker exec <container1> curl http://<container2>:<port>

# Inspecter les ports exposés
docker port <container>
```

## Nettoyage

```bash
docker system prune                        # tout nettoyer (images, conteneurs, réseaux inutilisés)
docker system prune -a                     # aussi les images non utilisées
docker system prune -a --volumes           # ⚠️ inclut les volumes
docker image prune                         # images orphelines
docker container prune                     # conteneurs arrêtés
docker volume prune                        # volumes inutilisés

# Voir l'espace utilisé
docker system df
```

## Commandes utiles supplémentaires

```bash
# Redémarrer un conteneur
docker restart <container>

# Arrêter proprement
docker stop <container>           # SIGTERM puis SIGKILL après 10s
docker kill <container>           # SIGKILL immédiat

# Copier des fichiers
docker cp <container>:/path/file ./local
docker cp ./local <container>:/path/file

# Créer une image depuis un conteneur modifié
docker commit <container> <new-image>

# Voir l'historique d'une image
docker history <image>
```

## Cas d'erreurs fréquentes

### "port is already allocated"
```bash
# Trouver quel processus utilise le port
lsof -i :<port>
netstat -tulnp | grep :<port>
# Changer le port dans docker-compose.yml ou tuer le processus
```

### "no space left on device"
```bash
df -h                    # voir l'espace disque
docker system df         # espace utilisé par Docker
docker system prune -a   # nettoyer ⚠️
```

### "cannot connect to Docker daemon"
```bash
systemctl start docker
systemctl enable docker
sudo usermod -aG docker $USER  # puis se déconnecter/reconnecter
```

### Image non trouvée
```bash
docker pull <image>:<tag>
docker images              # lister les images locales
```
