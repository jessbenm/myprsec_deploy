# Python — Déploiement et production

## Installation et environnements virtuels

```bash
python3 --version
pip3 --version

# Environnement virtuel
python3 -m venv venv
source venv/bin/activate           # Linux/Mac
venv\Scripts\activate              # Windows

pip install -r requirements.txt
pip freeze > requirements.txt     # sauvegarder les dépendances

# Désactiver le venv
deactivate
```

## Gunicorn (serveur WSGI pour Flask/Django)

```bash
pip install gunicorn

# Démarrer
gunicorn app:app --bind 0.0.0.0:8000 --workers 4
gunicorn wsgi:application --bind 0.0.0.0:8000   # Django

# Options utiles
--workers 4                        # nombre de processus (2 * CPUs + 1)
--threads 2                        # threads par worker
--timeout 120                      # timeout des requêtes
--access-logfile -                 # logs d'accès sur stdout
--error-logfile -                  # logs d'erreur sur stdout
--log-level info

# Avec recharge auto (dev)
gunicorn app:app --reload
```

## Uvicorn (ASGI pour FastAPI)

```bash
pip install uvicorn

# Démarrer FastAPI
uvicorn main:app --host 0.0.0.0 --port 8000
uvicorn main:app --workers 4 --host 0.0.0.0 --port 8000

# Avec recharge auto (dev)
uvicorn main:app --reload
```

## Systemd service pour Python

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Python App
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/opt/myapp
Environment="PATH=/opt/myapp/venv/bin"
EnvironmentFile=/opt/myapp/.env
ExecStart=/opt/myapp/venv/bin/gunicorn app:app --bind 0.0.0.0:8000 --workers 4
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl start myapp
systemctl enable myapp
journalctl -u myapp -f
```

## Django — commandes essentielles

```bash
# Migrations
python manage.py makemigrations
python manage.py migrate

# Collecte des fichiers statiques
python manage.py collectstatic --noinput

# Créer un superuser
python manage.py createsuperuser

# Vérifier la configuration
python manage.py check --deploy

# Shell Django
python manage.py shell
```

## Docker + Python

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:8000", "--workers", "4"]
```

## Diagnostics courants

### ModuleNotFoundError
```bash
pip list | grep <module>          # vérifier si installé
pip install <module>
# Vérifier que le bon venv est actif
which python                      # doit pointer vers le venv
```

### Erreur de permissions sur les fichiers
```bash
chown -R www-data:www-data /opt/myapp
chmod -R 755 /opt/myapp
# Fichiers sensibles
chmod 600 /opt/myapp/.env
```

### Gunicorn "worker timeout"
```bash
# Augmenter le timeout
gunicorn app:app --timeout 300

# Ou utiliser des workers asynchrones
pip install gevent
gunicorn app:app --worker-class gevent --workers 4
```

### "Address already in use"
```bash
lsof -i :8000
kill -9 <pid>
# Ou laisser gunicorn trouver un port libre
gunicorn app:app --bind 0.0.0.0:0
```

### Performance lente
```bash
# Profiler
pip install cProfile
python -m cProfile -o output.prof app.py
python -m pstats output.prof

# Utiliser un cache (Redis)
pip install redis
import redis
r = redis.Redis(host='localhost', port=6379, db=0)
```
