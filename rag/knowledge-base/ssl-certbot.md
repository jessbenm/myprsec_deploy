# SSL / TLS / Certbot — Guide complet

## Installer Certbot

```bash
# Ubuntu/Debian
sudo apt update && sudo apt install certbot python3-certbot-nginx

# Via snap (recommandé pour les dernières versions)
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
```

## Obtenir un certificat (HTTP-01, port 80 requis)

```bash
# Avec Nginx (arrête nginx temporairement)
sudo certbot --nginx -d monapp.example.com

# Standalone (sans nginx)
sudo certbot certonly --standalone -d monapp.example.com

# Webroot (nginx reste actif, chemin webroot configuré)
sudo certbot certonly --webroot -w /var/www/certbot -d monapp.example.com
```

## Renouvellement

```bash
# Tester le renouvellement (--dry-run ne consomme pas de quota)
sudo certbot renew --dry-run

# Forcer le renouvellement (même si pas encore expiré)
sudo certbot renew --force-renewal

# Renouvellement automatique (cron ou systemd timer — souvent déjà configuré)
sudo certbot renew                    # exécuter manuellement

# Vérifier le timer systemd
systemctl status certbot.timer
systemctl list-timers | grep certbot
```

## Vérifier un certificat

```bash
# Date d'expiration
openssl x509 -noout -dates -in /etc/letsencrypt/live/<domain>/fullchain.pem

# Vérifier depuis l'extérieur
openssl s_client -connect monapp.example.com:443 -servername monapp.example.com < /dev/null 2>/dev/null | openssl x509 -noout -dates

# Avec curl
curl -vI https://monapp.example.com 2>&1 | grep -i "expire\|subject\|issuer"

# Jours restants
echo | openssl s_client -servername monapp.example.com -connect monapp.example.com:443 2>/dev/null | openssl x509 -noout -enddate
```

## Fichiers Let's Encrypt

```bash
/etc/letsencrypt/live/<domain>/fullchain.pem   # cert + chain (utiliser ce fichier)
/etc/letsencrypt/live/<domain>/privkey.pem     # clé privée
/etc/letsencrypt/live/<domain>/cert.pem        # cert seul
/etc/letsencrypt/live/<domain>/chain.pem       # chain seul

# Lister tous les certificats
sudo certbot certificates
```

## Rate limits Let's Encrypt

- 5 certificats/semaine par domaine enregistré
- 50 certificats/semaine par compte
- 5 tentatives échouées/heure (toujours utiliser `--dry-run` d'abord)

```bash
# Tester AVANT de faire une vraie demande
sudo certbot certonly --dry-run --standalone -d monapp.example.com
```

## Configuration Nginx SSL recommandée

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 1d;
ssl_session_tickets off;
ssl_stapling on;
ssl_stapling_verify on;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

## Cas d'erreurs fréquentes

### "too many certificates already issued"
- Attendre jusqu'à 7 jours OU utiliser un sous-domaine différent
- Toujours utiliser `--dry-run` pour tester

### Certificat non trouvé / nginx 502
```bash
ls /etc/letsencrypt/live/           # vérifier que le dossier existe
sudo certbot certificates           # lister les certs valides
# Si inexistant : relancer certbot
```

### "Connection refused" lors du renouvellement
```bash
# Port 80 doit être ouvert
sudo ufw allow 80
sudo ufw allow 443
# Vérifier que nginx écoute sur 80 pour le challenge
```

### Certificat auto-signé malgré certbot
```bash
nginx -t                                   # vérifier la config nginx
grep -r "ssl_certificate" /etc/nginx/      # trouver quel cert est utilisé
nginx -s reload                            # recharger après correction
```

## Générer un certificat auto-signé (dev uniquement)

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/selfsigned.key \
  -out /etc/ssl/certs/selfsigned.crt \
  -subj "/CN=localhost"
```
