# Deploy di Scryboard

Scryboard è un solo processo Node con stato su disco (database SQLite e immagini): va eseguito
su **una sola istanza** con un volume persistente. Il container serve API, WebSocket e web app
sulla porta 3000.

## Variabili d'ambiente

| Variabile             | Default              | Note                                                        |
| --------------------- | -------------------- | ----------------------------------------------------------- |
| `PORT`                | `3000`               |                                                             |
| `DATABASE_PATH`       | `/data/scryboard.db` | Nel container; in sviluppo `./data/scryboard.db`            |
| `ASSETS_DIR`          | `/data/assets`       | Immagini caricate                                           |
| `TRUST_PROXY`         | `false`              | `true` dietro un proxy: l'IP del client arriva negli header |
| `ROOMS_PER_10_MIN`    | `20`                 | Stanze create per IP ogni 10 minuti                         |
| `UPLOADS_PER_10_MIN`  | `200`                | Immagini caricate per IP ogni 10 minuti                     |
| `MESSAGES_PER_10_MIN` | `300`                | Messaggi privati inviati per IP ogni 10 minuti              |

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

## Google Cloud Run

```bash
scripts/deploy-cloud-run.sh
```

Lo script costruisce l'immagine con Cloud Build e aggiorna il servizio `scryboard` su
`europe-west8`. Progetto, regione e nome si cambiano con le variabili `PROJECT`, `REGION` e
`SERVICE`; eventuali flag extra passati allo script finiscono a `gcloud run deploy`.

Il servizio è pubblico, su una sola istanza (`--max-instances 1`: lo stato vive nel processo) e
si spegne quando non serve. Due differenze rispetto a Fly.io:
- Niente volume: database e immagini stanno nel filesystem effimero del container, quindi a
  ogni riavvio o redeploy si riparte da un database vuoto. Va bene per demo e test; per i
  dati veri servono Fly.io o una VPS. Un bucket GCS montato con gcsfuse non è un'alternativa
  per SQLite: manca il file locking che richiede.
- Il progetto in uso è stato creato da AI Studio con il service account predefinito di Compute
  disattivato: le build usano quindi il service account `scryboard-builder` con il ruolo
  `roles/run.builder` (creato una volta con `gcloud iam service-accounts create`).

I WebSocket funzionano, ma Cloud Run li chiude dopo 60 minuti: il client si riconnette da solo.

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
