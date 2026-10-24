# Deploy di Scryboard

Scryboard è un solo processo Node con stato su disco (database SQLite e immagini): va eseguito
su **una sola istanza** con un volume persistente. Il container serve API, WebSocket e web app
sulla porta 3000.

## Variabili d'ambiente

| Variabile            | Default              | Note                                                        |
| -------------------- | -------------------- | ----------------------------------------------------------- |
| `PORT`               | `3000`               |                                                             |
| `DATABASE_PATH`      | `/data/scryboard.db` | Nel container; in sviluppo `./data/scryboard.db`            |
| `ASSETS_DIR`         | `/data/assets`       | Immagini caricate                                           |
| `TRUST_PROXY`        | `false`              | `true` dietro un proxy: l'IP del client arriva negli header |
| `ROOMS_PER_10_MIN`   | `20`                 | Stanze create per IP ogni 10 minuti                         |
| `UPLOADS_PER_10_MIN` | `200`                | Immagini caricate per IP ogni 10 minuti                     |

## Fly.io

Serve un account Fly.io e la CLI `flyctl`. La configurazione è in [`fly.toml`](../fly.toml).

```bash
fly auth login
# Scegli un nome libero e aggiornalo in fly.toml (campo `app`), poi:
fly apps create <nome-app>
fly volumes create scryboard_data --region fra --size 1
fly deploy
```

L'app sarà su `https://<nome-app>.fly.dev`. Con `auto_stop_machines` la macchina si spegne
quando nessuno è connesso e si riaccende alla prima visita in pochi secondi: con una macchina
`shared-cpu-1x` da 512 MB e un volume da 1 GB il costo resta di pochi euro al mese.

Backup del database:

```bash
fly ssh sftp get /data/scryboard.db ./backup-scryboard.db
```

## VPS con Docker

```bash
docker compose up -d --build
```

Il [`docker-compose.yml`](../docker-compose.yml) espone la porta solo su `127.0.0.1`: davanti
serve un reverse proxy con HTTPS che inoltri anche i WebSocket su `/collab`. Con Caddy basta:

```
scryboard.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

## Pulizia delle stanze inattive

Le stanze non si cancellano da sole. Per eliminare definitivamente quelle inattive da più di 90
giorni (documenti, immagini e metadati):

```bash
# prova: conta soltanto
docker compose exec scryboard node dist/prune.js --days 90 --dry-run
# elimina
docker compose exec scryboard node dist/prune.js --days 90
```

Su Fly.io: `fly ssh console -C "node dist/prune.js --days 90"`. Si può mettere in un cron
settimanale; l'attività di una stanza si aggiorna a ogni connessione e salvataggio.
