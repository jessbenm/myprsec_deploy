# Node.js — Déploiement et production

## Installation Node.js

```bash
# Via nvm (recommandé)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20
nvm alias default 20

# Via nodesource (système)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version && npm --version
```

## Process Manager (PM2)

```bash
npm install -g pm2

# Démarrer une application
pm2 start app.js --name myapp
pm2 start npm --name myapp -- start       # npm start
pm2 start ecosystem.config.js             # config fichier

# Gérer les processus
pm2 list                                  # lister tous les processus
pm2 status                                # état
pm2 logs myapp                            # logs
pm2 logs myapp --lines 50                 # dernières 50 lignes
pm2 logs --follow myapp                   # suivre
pm2 restart myapp                         # redémarrer
pm2 reload myapp                          # reload sans coupure
pm2 stop myapp                            # arrêter
pm2 delete myapp                          # supprimer

# Démarrer au boot
pm2 startup
pm2 save                                  # sauvegarder la liste des processus

# Monitoring
pm2 monit                                 # dashboard interactif
```

## Ecosystem.config.js (PM2)

```javascript
module.exports = {
  apps: [{
    name: 'myapp',
    script: './src/index.js',
    instances: 'max',            // nombre de CPUs
    exec_mode: 'cluster',        // mode cluster pour load balancing
    max_memory_restart: '500M',  // redémarrer si > 500MB RAM
    env: {
      NODE_ENV: 'development',
      PORT: 3000,
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/var/log/myapp/error.log',
    out_file: '/var/log/myapp/out.log',
  }]
};
```

## Variables d'environnement

```bash
# .env (ne jamais committer)
DATABASE_URL=postgres://user:pass@localhost/mydb
API_KEY=secret
PORT=3000

# Charger avec dotenv
# npm install dotenv
require('dotenv').config()
process.env.DATABASE_URL

# Vérifier que les variables sont chargées
node -e "require('dotenv').config(); console.log(process.env.DATABASE_URL)"
```

## Diagnostics courants

### Application qui crash sans logs
```bash
# Voir les logs PM2
pm2 logs myapp --lines 100

# Lancer manuellement pour voir l'erreur
node app.js

# Vérifier les uncaughtException
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
```

### Port déjà utilisé
```bash
lsof -i :3000                     # trouver quel processus utilise le port
kill -9 <pid>                     # tuer le processus
pm2 restart myapp                 # redémarrer
```

### Fuite mémoire
```bash
# Voir la mémoire utilisée
pm2 list                          # colonne memory
pm2 monit                         # temps réel

# Profiler avec Node.js built-in
node --inspect app.js             # ouvrir chrome://inspect dans Chrome
# Ou avec clinic.js
npm install -g clinic
clinic doctor -- node app.js
```

### "EACCES: permission denied"
```bash
# Ne jamais utiliser sudo avec npm
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH

# Ou corriger les permissions npm
sudo chown -R $(whoami) $(npm config get prefix)/{lib/node_modules,bin,share}
```

### Module not found
```bash
npm install                       # réinstaller les dépendances
npm ci                            # installation propre depuis package-lock.json
rm -rf node_modules && npm install
```

## Docker + Node.js

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
USER node                          # ne pas tourner en root
CMD ["node", "src/index.js"]
```

```bash
# Construire et lancer
docker build -t myapp .
docker run -p 3000:3000 -e NODE_ENV=production myapp
```
