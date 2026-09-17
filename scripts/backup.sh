#!/bin/sh
set -eu
umask 077
# Run on the deployment host. Immutable uploaded files are copied after the DB
# snapshot, so every reference in that snapshot can be restored.
backup_dir="${1:-backups/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$backup_dir"
docker compose --env-file .env.production -f compose.production.yaml exec -T db \
  pg_dump -U undangan -d undangan -Fc > "$backup_dir/database.dump"
docker compose --env-file .env.production -f compose.production.yaml exec -T web \
  tar -C /app/.data -czf - . > "$backup_dir/application-data.tar.gz"
printf '%s\n' "Backup saved: $backup_dir. Store an encrypted copy off this server."
