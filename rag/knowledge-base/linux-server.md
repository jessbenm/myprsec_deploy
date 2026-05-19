# Linux Serveur — Guide complet

## CPU / RAM

```bash
# Vue globale (interactif)
top                          # classique
htop                         # amélioré (couleurs, interactif)
glances                      # vue globale avancée

# Snapshot rapide
top -bn1 | head -20          # une seule mesure
mpstat 1 5                   # CPU par seconde pendant 5s
uptime                       # load average (1, 5, 15 min)

# RAM
free -h                      # utilisation RAM/swap en lisible
vmstat -s                    # statistiques mémoire
cat /proc/meminfo            # détails mémoire

# Processus les plus gourmands
ps aux --sort=-%cpu | head -10   # top CPU
ps aux --sort=-%mem | head -10   # top mémoire
```

## Disque

```bash
df -h                        # espace disque par partition
df -h /                      # partition racine
du -sh /var/log/*            # taille des dossiers de log
du -sh /*  2>/dev/null | sort -rh | head -20   # plus gros dossiers

# Trouver les gros fichiers
find / -type f -size +100M 2>/dev/null | sort -k5 -rn
find /var/log -name "*.log" -size +50M 2>/dev/null

# ncdu — outil interactif (installer d'abord)
apt install ncdu && ncdu /
```

## Disque plein — diagnostic rapide

```bash
# 1. Identifier la partition pleine
df -h

# 2. Trouver ce qui prend de la place
du -sh /var/log
du -sh /tmp
du -sh /var/cache

# 3. Nettoyer les logs
journalctl --disk-usage
journalctl --vacuum-size=500M       # garder 500MB max
journalctl --vacuum-time=7d         # garder 7 jours max

# 4. Nettoyer les logs nginx/app
find /var/log -name "*.log.*" -mtime +30 -delete

# 5. Nettoyer apt cache
apt clean
apt autoremove

# 6. Docker (si installé)
docker system prune -a
```

## Processus et services

```bash
# Lister les services
systemctl list-units --type=service --state=running
systemctl list-units --type=service --state=failed

# Gérer un service
systemctl start <service>
systemctl stop <service>
systemctl restart <service>
systemctl reload <service>
systemctl enable <service>          # démarrer au boot
systemctl disable <service>
systemctl status <service>          # état + derniers logs

# Logs d'un service
journalctl -u <service>             # tous les logs
journalctl -u <service> -f          # suivre
journalctl -u <service> --since "1 hour ago"
journalctl -u <service> -n 50       # 50 dernières lignes
```

## Réseau

```bash
# Ports ouverts
ss -tulnp                           # tous les ports en écoute
netstat -tulnp                      # alternative
lsof -i :<port>                     # qui utilise ce port

# Connexions actives
ss -s                               # statistiques
ss -t state established             # connexions TCP établies

# Firewall
ufw status verbose
ufw allow 80
ufw allow 443
ufw allow 22
iptables -L -n -v                   # règles iptables
```

## Cron jobs

```bash
crontab -l                          # voir les crons de l'utilisateur
crontab -e                          # éditer
cat /etc/crontab                    # cron système
ls /etc/cron.d/                     # crons installés par paquets
ls /etc/cron.daily/ /etc/cron.weekly/

# Format cron : MIN HEURE JOUR MOIS SEMAINE commande
# Exemple : tous les jours à 3h
# 0 3 * * * /opt/backup.sh >> /var/log/backup.log 2>&1

# Voir les logs de cron
grep CRON /var/log/syslog | tail -20
journalctl -u cron -f
```

## Gestion des fichiers / permissions

```bash
# Permissions
ls -la /path/                       # voir les permissions
chmod 755 /path/file                # rwxr-xr-x
chmod +x script.sh                  # rendre exécutable
chown user:group /path/file
chown -R www-data:www-data /var/www/html

# Trouver des fichiers avec mauvaises permissions
find /var/www -not -user www-data -type f
find /etc -perm -o+w 2>/dev/null    # fichiers world-writable
```

## Performance — load average élevé

```bash
# Load average > nombre de CPUs = surcharge
nproc                               # nombre de CPUs
uptime                              # load average 1/5/15 min

# Trouver ce qui charge
top -bn1 | grep -v "  0.0"
iotop                               # I/O disque par processus
iostat -x 1 5                       # statistiques I/O

# Processus en état D (wait I/O)
ps aux | awk '$8 ~ /D/ {print}'
```

## Mémoire swap élevée

```bash
free -h                             # voir le swap
vmstat 1 5                          # voir swapping en temps réel

# Identifier ce qui swape
for pid in $(ls /proc | grep -E '^[0-9]+$'); do
  swap=$(grep VmSwap /proc/$pid/status 2>/dev/null | awk '{print $2}')
  [ "$swap" -gt 0 ] 2>/dev/null && echo "$pid $swap KB $(cat /proc/$pid/comm 2>/dev/null)"
done | sort -k2 -rn | head -10
```

## Cas d'erreurs fréquentes

### "bash: fork: Cannot allocate memory"
```bash
# Trop de processus ou RAM pleine
ps aux | wc -l
free -h
# Tuer les processus zombies
kill -9 $(ps aux | awk '$8 == "Z" {print $2}')
```

### "cannot execute binary file"
```bash
file <binary>                       # vérifier l'architecture (x86/arm)
uname -m                            # architecture du serveur
```
