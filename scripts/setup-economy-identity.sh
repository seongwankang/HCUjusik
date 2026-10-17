#!/usr/bin/env bash
# Run only after the project owner approves this exact trust/permission setup.
set -euo pipefail
PROJECT_ID=hcujusik
SERVICE_ACCOUNT=hcu-economy-job
POOL=hcu-github
PROVIDER=hcu-economy
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
SERVICE_EMAIL="$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com"
if gcloud iam service-accounts describe "$SERVICE_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo 'Service account already exists. Inspect existing setup instead of repurposing it.' >&2
  exit 1
fi
if gcloud iam workload-identity-pools describe "$POOL" --location=global --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo 'Identity pool already exists. Inspect existing setup instead of changing its trust.' >&2
  exit 1
fi
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com --project="$PROJECT_ID"
gcloud iam service-accounts create "$SERVICE_ACCOUNT" --display-name='HCU daily settlement and rankings' --project="$PROJECT_ID"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SERVICE_EMAIL" --role=roles/datastore.user --condition=None >/dev/null
gcloud iam workload-identity-pools create "$POOL" --location=global --display-name='HCU GitHub Actions' --project="$PROJECT_ID"
CONDITION="assertion.repository_id=='1411053406' && assertion.repository_owner_id=='257706646' && assertion.ref=='refs/heads/main' && assertion.workflow_ref=='seongwankang/HCUjusik/.github/workflows/daily-economy.yml@refs/heads/main'"
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --workload-identity-pool="$POOL" --location=global --issuer-uri='https://token.actions.githubusercontent.com' --attribute-mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id' --attribute-condition="$CONDITION" --project="$PROJECT_ID"
gcloud iam service-accounts add-iam-policy-binding "$SERVICE_EMAIL" --role=roles/iam.workloadIdentityUser --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository_id/1411053406" --project="$PROJECT_ID" >/dev/null
printf 'ECONOMY_WIF_PROVIDER=projects/%s/locations/global/workloadIdentityPools/%s/providers/%s\n' "$PROJECT_NUMBER" "$POOL" "$PROVIDER"
printf 'ECONOMY_SERVICE_ACCOUNT=%s\n' "$SERVICE_EMAIL"
echo 'After checking the two GitHub repository variables above, set ECONOMY_AUTOMATION_ENABLED=true.'
