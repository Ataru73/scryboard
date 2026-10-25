#!/usr/bin/env bash
# Deploy di Scryboard su Google Cloud Run (vedi docs/DEPLOY.md).
#
#   scripts/deploy-cloud-run.sh               # deploy standard
#   scripts/deploy-cloud-run.sh --memory 2Gi  # flag extra passati a gcloud run deploy
#
# Con DATA_BUCKET=<nome-bucket> il database viene replicato di continuo sul bucket
# (Litestream) e le immagini vi vengono salvate: sopravvivono a riavvii, redeploy e
# spegnimenti. Lo script crea il service account del servizio (se manca) e gli dà
# roles/storage.objectAdmin sul bucket. Senza DATA_BUCKET database e immagini vivono nel
# filesystem effimero del container e a ogni riavvio si riparte da zero: va bene
# solo per demo e test.
#
# `--max-instances 1` è obbligatorio: lo stato vive nel processo e due istanze
# avrebbero due database separati.

set -euo pipefail

# Configurazione del deploy originale; sovrascrivibile da environment:
#   PROJECT=altro-progetto REGION=europe-west3 scripts/deploy-cloud-run.sh
PROJECT="${PROJECT:-gen-lang-client-0514761082}"
REGION="${REGION:-europe-west8}"
SERVICE="${SERVICE:-scryboard}"
BUILD_SA="${BUILD_SA:-scryboard-builder@${PROJECT}.iam.gserviceaccount.com}"
DATA_BUCKET="${DATA_BUCKET:-}"
# Service account con cui gira il servizio: con DATA_BUCKET ne serve uno dedicato, perché quello
# predefinito di Compute è disattivato su questo progetto.
RUN_SA="${RUN_SA:-scryboard-runtime@${PROJECT}.iam.gserviceaccount.com}"

ENV_VARS="DATABASE_PATH=/data/scryboard.db,ASSETS_DIR=/data/assets,TRUST_PROXY=true"
EXTRA_FLAGS=()
if [ -n "$DATA_BUCKET" ]; then
  ENV_VARS="$ENV_VARS,ASSET_STORAGE=gcs,GCS_BUCKET=$DATA_BUCKET,LITESTREAM_REPLICA_URL=gcs://$DATA_BUCKET/scryboard.db"
  EXTRA_FLAGS+=(--service-account "$RUN_SA")
fi

cd "$(dirname "$0")/.."

# Controlli rapidi, prima di caricare il sorgente.
command -v gcloud >/dev/null || { echo "gcloud non trovato nel PATH" >&2; exit 1; }
ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format='value(account)')
[ -n "$ACTIVE_ACCOUNT" ] || {
  echo "Nessun account gcloud attivo: prima esegui 'gcloud auth login'" >&2
  exit 1
}
gcloud iam service-accounts describe "$BUILD_SA" --project="$PROJECT" >/dev/null 2>&1 || {
  echo "Manca il service account di build $BUILD_SA (ruolo roles/run.builder)." >&2
  echo "Serve perché su questo progetto il service account predefinito è disattivato." >&2
  exit 1
}

if [ -n "$DATA_BUCKET" ]; then
  gcloud storage buckets describe "gs://$DATA_BUCKET" --project="$PROJECT" >/dev/null 2>&1 || {
    echo "Il bucket gs://$DATA_BUCKET non esiste: crealo con" >&2
    echo "  gcloud storage buckets create gs://$DATA_BUCKET --project $PROJECT --location $REGION" >&2
    exit 1
  }
  if ! gcloud iam service-accounts describe "$RUN_SA" --project="$PROJECT" >/dev/null 2>&1; then
    echo "Creo il service account $RUN_SA..."
    gcloud iam service-accounts create "${RUN_SA%%@*}" --project="$PROJECT" \
      --display-name="Scryboard (Cloud Run)"
  fi
  # Idempotente: se il ruolo c'è già non cambia nulla.
  gcloud storage buckets add-iam-policy-binding "gs://$DATA_BUCKET" --project="$PROJECT" \
    --member="serviceAccount:$RUN_SA" --role=roles/storage.objectAdmin >/dev/null
  echo "Dati su gs://$DATA_BUCKET (database replicato con Litestream, immagini nel bucket)."
else
  echo "ATTENZIONE: DATA_BUCKET non impostato, i dati andranno persi a ogni riavvio." >&2
fi

echo "Deploy di $SERVICE in $REGION (progetto $PROJECT)..."
gcloud run deploy "$SERVICE" \
  --source . \
  --project "$PROJECT" \
  --region "$REGION" \
  --build-service-account "projects/${PROJECT}/serviceAccounts/${BUILD_SA}" \
  --allow-unauthenticated \
  --port 3000 \
  --cpu 1 \
  --memory 1Gi \
  --min-instances 0 \
  --max-instances 1 \
  --set-env-vars "$ENV_VARS" \
  ${EXTRA_FLAGS[@]+"${EXTRA_FLAGS[@]}"} \
  "$@"

URL=$(gcloud run services describe "$SERVICE" \
  --project "$PROJECT" --region "$REGION" --format='value(status.url)')
echo "Servizio: $URL"

echo -n "Health check: "
if curl -fsS --retry 10 --retry-delay 3 --retry-connrefused --retry-all-errors "$URL/api/health"; then
  echo
  echo "Deploy completato."
else
  echo
  echo "Il deploy è riuscito ma /api/health non risponde: controlla i log con" >&2
  echo "  gcloud run services logs read $SERVICE --region $REGION --limit 50" >&2
  exit 1
fi
