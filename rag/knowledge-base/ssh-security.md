# SSH — Sécurité et usage

## Connexion et gestion des clés

```bash
# Connexion
ssh user@host
ssh -p 2222 user@host              # port personnalisé
ssh -i ~/.ssh/id_rsa user@host     # clé spécifique

# Générer une paire de clés
ssh-keygen -t ed25519 -C "email@example.com"
ssh-keygen -t rsa -b 4096 -C "email@example.com"

# Copier la clé publique sur le serveur
ssh-copy-id user@host
# Ou manuellement :
cat ~/.ssh/id_rsa.pub >> ~/.ssh/authorized_keys

# Test de connexion sans mot de passe
ssh -o BatchMode=yes user@host echo ok
```

## Configuration sshd (/etc/ssh/sshd_config)

```bash
# Sécuriser SSH — recommandations
Port 2222                           # changer le port par défaut
PermitRootLogin no                  # ne jamais autoriser root
PasswordAuthentication no           # clés uniquement
PubkeyAuthentication yes
AllowUsers deploy ubuntu            # whitelist des utilisateurs
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2

# Appliquer
systemctl reload sshd
# Vérifier la config avant de se déconnecter !
sshd -t                             # test de syntaxe
```

## Tunnels SSH

```bash
# Tunnel local (accéder à un service distant en local)
ssh -L 5432:localhost:5432 user@server   # PostgreSQL distant → local:5432
ssh -L 8080:localhost:3000 user@server  # App distante → local:8080

# Tunnel inverse (exposer un service local vers le serveur)
ssh -R 8080:localhost:3000 user@server

# SOCKS proxy
ssh -D 1080 user@server              # proxy SOCKS sur port 1080

# Tunnels persistants (sans terminal)
ssh -fN -L 5432:localhost:5432 user@server
```

## Exécuter des commandes à distance

```bash
# Exécuter une commande et récupérer la sortie
ssh user@host "docker ps"
ssh user@host "cd /opt/app && git pull && docker compose up -d"

# Passer un fichier en stdin
ssh user@host "cat > /remote/file" < local_file

# Copier des fichiers (scp/rsync)
scp file.txt user@host:/remote/path/
scp -r ./local_dir user@host:/remote/path/
rsync -avz ./local/ user@host:/remote/  # synchronisation incrémentale
rsync -avz --delete ./local/ user@host:/remote/   # miroir exact
```

## Problèmes courants

### "Connection refused"
```bash
# Vérifier que sshd tourne
systemctl status sshd
# Vérifier le port
ss -tulnp | grep sshd
# Vérifier le firewall
ufw status
ufw allow 22  # ou le port configuré
```

### "Permission denied (publickey)"
```bash
# Vérifier les permissions des fichiers SSH (CRITIQUES)
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
chmod 600 ~/.ssh/id_rsa
# Vérifier les logs SSH côté serveur
journalctl -u sshd | tail -20
tail -20 /var/log/auth.log
```

### "Host key verification failed"
```bash
# Supprimer l'ancienne clé du known_hosts
ssh-keygen -R <hostname>
# Ou ajouter manuellement
ssh-keyscan -H <hostname> >> ~/.ssh/known_hosts
```

### "Too many authentication failures"
```bash
# Spécifier la clé à utiliser
ssh -i ~/.ssh/id_rsa -o IdentitiesOnly=yes user@host
```

### Connexion lente
```bash
# Désactiver la résolution DNS inverse (côté serveur)
# sshd_config : UseDNS no
# Côté client : ajouter -o GSSAPIAuthentication=no
ssh -o GSSAPIAuthentication=no user@host
```

## Fail2ban (protection brute-force)

```bash
apt install fail2ban
systemctl start fail2ban
systemctl enable fail2ban

# Voir les IPs bannies
fail2ban-client status sshd
fail2ban-client status

# Débannir une IP
fail2ban-client set sshd unbanip <ip>

# Config /etc/fail2ban/jail.local
[sshd]
enabled = true
port = ssh
maxretry = 5
bantime = 3600
findtime = 600
```
