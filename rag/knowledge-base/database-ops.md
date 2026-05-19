# Bases de données — Opérations et maintenance

## PostgreSQL

```bash
# Connexion
psql -U postgres -d mydb
psql -h localhost -U user -d mydb
psql "postgresql://user:pass@localhost:5432/mydb"

# Commandes psql
\l                                 # lister les bases
\c mydb                            # changer de base
\dt                                # lister les tables
\d tablename                       # structure d'une table
\du                                # lister les utilisateurs
\q                                 # quitter

# Backup
pg_dump mydb > backup.sql
pg_dump -Fc mydb > backup.dump     # format compressé
pg_dump -Fc -h host -U user mydb > backup.dump

# Restore
psql mydb < backup.sql
pg_restore -d mydb backup.dump
pg_restore -Fc -d mydb -h host -U user backup.dump

# Maintenance
VACUUM ANALYZE;                    # nettoyer et analyser
REINDEX TABLE mytable;             # réindexer
SELECT pg_size_pretty(pg_database_size('mydb'));  -- taille DB

# Voir les connexions actives
SELECT pid, usename, application_name, state, query FROM pg_stat_activity;

# Tuer une connexion
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid = <pid>;
```

## MySQL / MariaDB

```bash
# Connexion
mysql -u root -p
mysql -h localhost -u user -p mydb

# Commandes mysql
SHOW DATABASES;
USE mydb;
SHOW TABLES;
DESCRIBE tablename;

# Backup
mysqldump mydb > backup.sql
mysqldump -u root -p mydb > backup.sql
mysqldump --all-databases > all_backup.sql

# Restore
mysql mydb < backup.sql
mysql -u root -p mydb < backup.sql

# Voir les processus
SHOW PROCESSLIST;
# Tuer un processus
KILL <process_id>;

# Performance
SHOW STATUS LIKE 'Queries';
SHOW VARIABLES LIKE 'max_connections';
```

## Redis

```bash
# CLI
redis-cli
redis-cli -h localhost -p 6379 -a <password>

# Commandes
PING                               # tester la connexion
INFO                               # informations complètes
INFO memory                        # utilisation mémoire
INFO clients                       # connexions

# Voir toutes les clés (⚠️ ne pas faire en prod avec beaucoup de données)
KEYS *
SCAN 0 MATCH "prefix:*" COUNT 100 # version sûre

# Données
GET key
SET key value
DEL key
TTL key                            # temps restant
EXPIRE key 3600                    # expiration en secondes

# Monitoring
redis-cli MONITOR                  # voir toutes les commandes en temps réel
redis-cli INFO stats

# Mémoire
redis-cli MEMORY USAGE key         # mémoire d'une clé
redis-cli CONFIG GET maxmemory

# Flush (⚠️ DANGEREUX)
FLUSHDB                            # vider la DB courante
FLUSHALL                           # vider TOUTES les DBs
```

## SQLite

```bash
# CLI
sqlite3 mydb.db

# Commandes SQLite
.tables                            # lister les tables
.schema tablename                  # structure
.mode column                       # mode affichage
.headers on

# Backup
sqlite3 mydb.db ".backup backup.db"
cp mydb.db mydb.backup.db

# Vérifier l'intégrité
sqlite3 mydb.db "PRAGMA integrity_check;"

# Voir la taille
ls -lh mydb.db
sqlite3 mydb.db "SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size();"

# Optimiser
sqlite3 mydb.db "VACUUM;"
sqlite3 mydb.db "ANALYZE;"
```

## MongoDB

```bash
# Connexion
mongosh
mongosh "mongodb://user:pass@localhost:27017/mydb"

# Commandes
show dbs
use mydb
show collections
db.mycoll.find().limit(10)
db.mycoll.countDocuments()

# Backup
mongodump --db mydb --out /backup/
mongodump --uri "mongodb://user:pass@localhost/mydb"

# Restore
mongorestore --db mydb /backup/mydb/
mongorestore --uri "mongodb://user:pass@localhost/mydb" /backup/mydb/

# Monitoring
db.serverStatus()
db.stats()
db.currentOp()                    # opérations en cours
db.killOp(<opid>)                 # tuer une opération
```

## Diagnostics communs

### PostgreSQL "too many connections"
```sql
-- Voir les connexions
SELECT count(*) FROM pg_stat_activity;
-- Augmenter le max (postgresql.conf)
max_connections = 200
-- Utiliser pgBouncer pour le pooling
```

### MySQL "Table is locked"
```sql
SHOW OPEN TABLES WHERE in_use > 0;
SHOW PROCESSLIST;
KILL <process_id>;
```

### Redis "MISCONF Redis is configured to save RDB snapshots"
```bash
redis-cli CONFIG SET stop-writes-on-bgsave-error no
# Ou corriger les permissions du répertoire de données
chown redis:redis /var/lib/redis/
```

### SQLite "database is locked"
```bash
# Un autre processus a un verrou
lsof | grep mydb.db
# Utiliser WAL mode pour réduire les locks
sqlite3 mydb.db "PRAGMA journal_mode=WAL;"
```
