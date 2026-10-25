#!/bin/sh
# Con LITESTREAM_REPLICA_URL (es. gcs://bucket/scryboard.db) il database viene ripristinato dal
# bucket all'avvio e replicato di continuo; senza, vive soltanto nel container (in /data).
set -e

if [ -n "$LITESTREAM_REPLICA_URL" ]; then
  litestream restore -config /etc/litestream.yml -if-db-not-exists -if-replica-exists "$DATABASE_PATH"
  exec litestream replicate -config /etc/litestream.yml -exec "node dist/index.js"
fi

exec node dist/index.js
