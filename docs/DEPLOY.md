# Deploy di Scryboard

Scryboard è un solo processo Node con stato su disco (database SQLite e immagini): va eseguito
su **una sola istanza** con un volume persistente. Il container serve API, WebSocket e web app
sulla porta 3000.

## Variabili d'ambiente

| Variabile                | Default              | Note                                                                           |
| ------------------------ | -------------------- | ------------------------------------------------------------------------------ |
| `PORT`                   | `3000`               |                                                                                |
| `DATABASE_PATH`          | `/data/scryboard.db` | Nel container; in sviluppo `./data/scryboard.db`                               |
| `ASSETS_DIR`             | `/data/assets`       | Immagini caricate (con `ASSET_STORAGE=local`)                                  |
| `ASSET_STORAGE`          | `local`              | `gcs` salva le immagini su un bucket Google Cloud Storage                      |
| `GCS_BUCKET`             |                      | Nome del bucket, obbligatorio con `ASSET_STORAGE=gcs`                          |
| `LITESTREAM_REPLICA_URL` |                      | Es. `gcs://bucket/scryboard.db`: replica e ripristina il database su un bucket |
| `TRUST_PROXY`            | `false`              | `true` dietro un proxy: l'IP del client arriva negli header                    |
| `ROOMS_PER_10_MIN`       | `20`                 | Stanze create per IP ogni 10 minuti                                            |
| `UPLOADS_PER_10_MIN`     | `200`                | Immagini caricate per IP ogni 10 minuti                                        |
| `MESSAGES_PER_10_MIN`    | `300`                | Messaggi privati inviati per IP ogni 10 minuti                                 |

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
si spegne quando non serve.

### Dati su un bucket

Senza configurazione database e immagini stanno nel filesystem effimero del container: a ogni
riavvio o redeploy si riparte da zero. Per i dati veri si usa un bucket (un bucket montato con
gcsfuse non va bene per SQLite: manca il file locking che richiede):
- il **database** resta un file locale nel container ed è replicato di continuo sul bucket con
  [Litestream](https://litestream.io); all'avvio, se il file non c'è, viene ripristinato dal
  bucket. Se l'istanza viene fermata di colpo si possono perdere al massimo gli ultimi secondi;
- le **immagini** vengono salvate direttamente nel bucket (`ASSET_STORAGE=gcs`).

```bash
gcloud storage buckets create gs://scryboard-storage --project $PROJECT --location europe-west8
DATA_BUCKET=scryboard-storage scripts/deploy-cloud-run.sh
```

Lo script crea il service account `scryboard-runtime` (cambiabile con `RUN_SA`), gli dà
`roles/storage.objectAdmin` sul bucket e lo usa per il servizio.

`DATA_BUCKET` imposta da solo `ASSET_STORAGE`, `GCS_BUCKET` e `LITESTREAM_REPLICA_URL`. In
locale, o su una VPS, non serve nulla di tutto questo: database e immagini restano in `/data`
nel container (monta un volume per non perderli).

La pulizia delle stanze inattive (`prune.js`) elimina anche le immagini dal bucket se lanciata
con le stesse variabili `ASSET_STORAGE` e `GCS_BUCKET`; su Cloud Run va eseguita come job con
le stesse variabili del servizio.

Il progetto in uso è stato creato da AI Studio con il service account predefinito di Compute
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
