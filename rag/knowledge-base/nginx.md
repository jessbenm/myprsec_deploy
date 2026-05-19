# Nginx — Guide complet

## Commandes essentielles

```bash
nginx -t                            # tester la configuration (TOUJOURS avant reload)
nginx -T                            # afficher la config complète résolue
nginx -s reload                     # recharger sans coupure
nginx -s quit                       # arrêt propre
nginx -s stop                       # arrêt immédiat

systemctl reload nginx              # recharger via systemd
systemctl restart nginx             # redémarrer
systemctl status nginx              # état
systemctl enable nginx              # démarrer au boot
journalctl -u nginx -f              # logs systemd en temps réel
```

## Logs

```bash
tail -f /var/log/nginx/access.log   # logs d'accès
tail -f /var/log/nginx/error.log    # logs d'erreur
grep "error" /var/log/nginx/error.log | tail -50
grep " 502 " /var/log/nginx/access.log | tail -20
grep " 500 " /var/log/nginx/access.log | tail -20
```

## Diagnostiquer une erreur 502 Bad Gateway

```bash
# 1. Tester la config nginx
nginx -t

# 2. Vérifier que le backend répond
curl -v http://localhost:3001/api/health   # adapter le port

# 3. Voir les logs d'erreur nginx
tail -50 /var/log/nginx/error.log

# 4. Vérifier que le backend tourne
systemctl status <backend-service>
docker ps | grep <backend>

# Cause commune : backend arrêté ou sur le mauvais port
```

## Configuration reverse proxy standard

```nginx
server {
    listen 80;
    server_name monapp.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 30s;
    }
}
```

## Configuration SSL

```nginx
server {
    listen 443 ssl http2;
    server_name monapp.example.com;

    ssl_certificate     /etc/letsencrypt/live/monapp.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/monapp.example.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    # Rediriger HTTP vers HTTPS
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
    }
}

server {
    listen 80;
    server_name monapp.example.com;
    return 301 https://$host$request_uri;
}
```

## WebSocket avec Nginx

```nginx
location /ws/ {
    proxy_pass http://localhost:3000/ws/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;   # timeout long pour WebSocket
    proxy_send_timeout 3600s;
}
```

## Rate limiting

```nginx
# Dans le bloc http {}
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=auth:10m rate=2r/s;

# Dans le bloc location {}
location /api/ {
    limit_req zone=api burst=20 nodelay;
    proxy_pass http://localhost:3000;
}
location /api/auth/ {
    limit_req zone=auth burst=5 nodelay;
    proxy_pass http://localhost:3000;
}
```

## Analyse des logs

```bash
# Top des IPs en erreur
awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -20

# Top des URLs les plus appelées
awk '{print $7}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -20

# Erreurs 5xx par heure
awk '$9~/5[0-9]{2}/ {print $4}' /var/log/nginx/access.log | cut -d: -f2 | sort | uniq -c
```

## Cas d'erreurs fréquentes

### "nginx: configuration file ... test failed"
```bash
nginx -t                      # voir la ligne exacte de l'erreur
nginx -T | grep -n "error"    # trouver dans la config complète
```

### 413 Request Entity Too Large
```nginx
# Augmenter la taille max
client_max_body_size 50M;    # dans server {} ou http {}
```

### 504 Gateway Timeout
```nginx
# Augmenter le timeout (si le backend est lent)
proxy_read_timeout 120s;
proxy_connect_timeout 30s;
```

### Permissions sur les fichiers statiques
```bash
ls -la /var/www/html/         # vérifier les permissions
chown -R www-data:www-data /var/www/html/
chmod -R 755 /var/www/html/
```
