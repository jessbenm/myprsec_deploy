# Prometheus — Guide complet

## Installation et démarrage

```bash
# Via apt
apt install prometheus

# Statut
systemctl status prometheus
systemctl start prometheus
journalctl -u prometheus -f

# Port par défaut
curl http://localhost:9090/-/healthy          # health check
curl http://localhost:9090/api/v1/status/config
```

## API Prometheus

```bash
BASE=http://localhost:9090/api/v1

# Health check
curl $BASE/../-/healthy

# Lister les targets
curl $BASE/targets

# Voir les alertes actives
curl $BASE/alerts

# Requête instantanée
curl "$BASE/query?query=up"
curl "$BASE/query?query=node_cpu_seconds_total"
curl "$BASE/query?query=rate(http_requests_total[5m])"

# Requête sur une plage de temps
curl "$BASE/query_range?query=up&start=2024-01-01T00:00:00Z&end=2024-01-01T01:00:00Z&step=60s"

# Lister toutes les métriques
curl $BASE/label/__name__/values
```

## PromQL — Requêtes essentielles

```promql
# CPU utilisé (tous les cores)
100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# RAM utilisée
(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100

# Disque utilisé
(1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100

# Requêtes HTTP par seconde
rate(http_requests_total[5m])

# Taux d'erreur HTTP 5xx
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])

# Targets down
up == 0

# Latence P95
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

## Configuration prometheus.yml

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alerts.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']

  - job_name: 'myapp'
    static_configs:
      - targets: ['app:3000']
    metrics_path: /metrics
```

## Alertes (alerts.yml)

```yaml
groups:
  - name: system
    rules:
      - alert: HighCPU
        expr: 100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "CPU > 80% depuis 5 minutes"

      - alert: LowDiskSpace
        expr: (node_filesystem_avail_bytes / node_filesystem_size_bytes) * 100 < 10
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "Disque < 10% d'espace disponible"

      - alert: InstanceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Instance {{ $labels.instance }} est down"
```

## Node Exporter

```bash
# Installer Node Exporter (métriques système)
apt install prometheus-node-exporter
systemctl start prometheus-node-exporter

# Port : 9100
curl http://localhost:9100/metrics | grep node_cpu
```

## Grafana (visualisation)

```bash
# Installer
apt install grafana
systemctl start grafana-server

# Port : 3000 (défaut)
# Ajouter Prometheus comme datasource :
# Configuration → Data Sources → Add → Prometheus → URL: http://localhost:9090

# Dashboards prêts à l'emploi (importer l'ID depuis grafana.com/dashboards)
# Node Exporter: 1860
# Docker: 893
```

## Diagnostics courants

### Target en état "down"
```bash
curl http://localhost:9090/api/v1/targets | python3 -m json.tool | grep -A5 '"health":"down"'
# Vérifier que le service à scraper est démarré et expose /metrics
curl http://<target>:<port>/metrics
```

### "TSDB out of order samples"
```bash
# Corruption des données — arrêter et nettoyer
systemctl stop prometheus
rm -rf /var/lib/prometheus/wal
systemctl start prometheus
```

### Utilisation disque excessive
```bash
du -sh /var/lib/prometheus/
# Ajuster la rétention dans prometheus.yml ou au démarrage :
# --storage.tsdb.retention.time=15d
# --storage.tsdb.retention.size=10GB
```
