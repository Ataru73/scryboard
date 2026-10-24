#!/usr/bin/env bash
# Deploy di Scryboard su Google Cloud Run (vedi docs/DEPLOY.md).
#
#   scripts/deploy-cloud-run.sh               # deploy standard
#   scripts/deploy-cloud-run.sh --memory 2Gi  # flag extra passati a gcloud run deploy
#
# Senza un volume montato, database e immagini caricate vivono nel filesystem del
# container, che su Cloud Run è effimero: a ogni riavvio, redeploy o spegnimento
# (scale to zero) si riparte da un database vuoto. Va bene per demo e test; per
# i dati veri servono Fly.io o una VPS.
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
  --set-env-vars DATABASE_PATH=/data/scryboard.db,ASSETS_DIR=/data/assets,TRUST_PROXY=true \
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
