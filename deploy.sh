#!/usr/bin/env bash
# deploy.sh — Cloud Run に「招待した人だけが使える」形でデプロイする
#
#   ./deploy.sh --plan            実行されるコマンドを表示するだけ（課金なし）
#   ./deploy.sh --run             実際にデプロイする（★課金が発生する）
#   ./deploy.sh --run --invite you@example.com   アクセスを許可する人を追加
#
# 公開しない。--no-allow-unauthenticated で立て、
# roles/run.invoker を付けた Google アカウントだけがアクセスできる。
set -euo pipefail

# gcloud に一切プロンプトを出させない（未有効 API の「有効化しますか」で止まるため）
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
[ -f .env ] && { set -a; . ./.env; set +a; }

PROJECT="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${RUN_REGION:-us-central1}"
SERVICE="${RUN_SERVICE:-medicare-partd-text-to-sql}"
REPO="${AR_REPO:-partd}"
DATASET="${BQ_DATASET:-partd}"
SA_NAME="${RUNTIME_SA_NAME:-partd-app}"
RUNTIME_SA="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
SECRET="ANTHROPIC_API_KEY"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/${SERVICE}"

mode="plan"
invites=()
while [ $# -gt 0 ]; do
  case "$1" in
    --plan)  mode="plan" ;;
    --run)   mode="run" ;;
    --smoke) mode="smoke" ;;
    --check-traffic) mode="check-traffic" ;;
    --invite) shift; invites+=("$1") ;;
    *) echo "不明な引数: $1" >&2; exit 2 ;;
  esac
  shift
done

run() {
  if [ "$mode" = "run" ]; then echo "+ $*"; "$@"; else echo "  $*"; fi
}

# デプロイしたリビジョンが本当に配信されているか確かめる。
#
# update-traffic --to-revisions=X=100 を一度でも使うとトラフィックがそのリビジョンに
# 固定され、以降 gcloud run deploy をしても新しいリビジョンが作られるだけで
# 配信されない。デプロイは成功し、ログにも成功と出るのに、利用者には古いものが
# 見え続ける。2026-09-08 に実際に踏んで、year の表示修正が届いていなかった。
check_traffic() {
  local latest serving to_latest
  latest="$(gcloud run revisions list --service="$SERVICE" --region="$REGION" \
            --project="$PROJECT" --format='value(metadata.name)' --quiet </dev/null \
            2>/dev/null | head -1)"
  serving="$(gcloud run services describe "$SERVICE" --region="$REGION" \
             --project="$PROJECT" --format='value(status.traffic[0].revisionName)' \
             --quiet </dev/null 2>/dev/null)"
  to_latest="$(gcloud run services describe "$SERVICE" --region="$REGION" \
               --project="$PROJECT" --format='value(status.traffic[0].latestRevision)' \
               --quiet </dev/null 2>/dev/null)"

  echo "  最新リビジョン: $latest"
  # 変数の直後に全角文字を置くと bash が変数名に取り込む。必ず ${} で囲む
  echo "  配信中        : ${serving}（latestRevision=${to_latest}）"

  if [ "$latest" = "$serving" ]; then
    echo "  ✓ 最新が配信されています"
    return 0
  fi

  echo "  ⚠ 最新が配信されていません。トラフィックが固定されています。" >&2
  echo "    最新へ切り替えます: gcloud run services update-traffic $SERVICE --to-latest" >&2
  gcloud run services update-traffic "$SERVICE" --region="$REGION" \
    --project="$PROJECT" --to-latest --quiet </dev/null >/dev/null 2>&1 || {
      echo "    切り替えに失敗しました。手動で実行してください。" >&2; return 1; }
  serving="$(gcloud run services describe "$SERVICE" --region="$REGION" \
             --project="$PROJECT" --format='value(status.traffic[0].revisionName)' \
             --quiet </dev/null 2>/dev/null)"
  echo "  ✓ 切り替えました: $serving"
  [ "$latest" = "$serving" ]
}

# デプロイ後に実際に1問投げて、答えが返るところまで確かめる。
# ビルド・デプロイ・ヘルスチェックが全部通ったうえで壊れていることがある
# （app/prompts/system.md が .gcloudignore で除外された件、docs/DECISIONS.md 参照）。
smoke_test() {
  local url
  url="$(gcloud run services describe "$SERVICE" --region="$REGION" \
         --project="$PROJECT" --format='value(status.url)' --quiet </dev/null 2>/dev/null)"
  if [ -z "$url" ]; then
    echo "  サービスが見つかりません" >&2
    return 1
  fi
  local token=""
  # --no-allow-unauthenticated なので ID トークンが要る
  token="$(gcloud auth print-identity-token 2>/dev/null || true)"
  python3 "$ROOT/smoke_test.py" "$url" "$token"
}

# データセット単位の READER を付ける。
# bq add-iam-policy-binding --dataset は allowlist が要る機能で一般には使えないため
# （"This feature requires allowlisting."）、データセットの access 配列を直接更新する。
grant_dataset_reader() {
  local member="$RUNTIME_SA"
  if [ "$mode" != "run" ]; then
    echo "  bq show --format=prettyjson $PROJECT:$DATASET > ds.json"
    echo "  （access に {\"role\":\"READER\",\"userByEmail\":\"$member\"} を追加）"
    echo "  bq update --source ds.json $PROJECT:$DATASET"
    return 0
  fi
  local tmp; tmp="$(mktemp)"
  echo "+ bq show --format=prettyjson $PROJECT:$DATASET  →  access に READER を追加 → bq update"
  bq show --format=prettyjson "$PROJECT:$DATASET" > "$tmp"
  python3 - "$tmp" "$member" <<'PYEOF'
import json, sys
path, member = sys.argv[1], sys.argv[2]
ds = json.load(open(path))
access = ds.setdefault("access", [])
if any(a.get("userByEmail") == member and a.get("role") == "READER" for a in access):
    print("  （既に READER が付いています）")
else:
    access.append({"role": "READER", "userByEmail": member})
    json.dump(ds, open(path, "w"))
    print("  READER を追加しました")
PYEOF
  bq update --source "$tmp" "$PROJECT:$DATASET"
  rm -f "$tmp"
}

# 存在確認。API が未有効だと gcloud が「有効化しますか (y/N)」と聞いて止まるので、
# --quiet と </dev/null を必ず付ける。失敗＝「無い」として扱う。
exists() {
  "$@" --quiet >/dev/null 2>&1 </dev/null
}

# パイプに流しても進行が見えるように、標準出力を行バッファにする
exec > >(cat) 2>&1

if [ "$mode" = "smoke" ]; then
  smoke_test
  exit $?
fi

if [ "$mode" = "check-traffic" ]; then
  check_traffic
  exit $?
fi

echo "project=$PROJECT  region=$REGION  service=$SERVICE"
echo "image=$IMAGE"
echo "runtime SA=$RUNTIME_SA"
echo "公開範囲: --no-allow-unauthenticated（招待した Google アカウントのみ）"
echo
[ -n "$PROJECT" ] || { echo "GCP_PROJECT が未設定です" >&2; exit 1; }

echo "--- 1. API の有効化 ---"
run gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
    artifactregistry.googleapis.com secretmanager.googleapis.com \
    --project="$PROJECT"

# services enable は成功を返すが、直後の API 呼び出しにはまだ反映されていない
# （SERVICE_DISABLED で落ちる）。実際に有効と見えるまで待つ。
wait_for_api() {
  local api="$1" i=0
  while [ $i -lt 40 ]; do
    if gcloud services list --enabled --project="$PROJECT" --quiet </dev/null 2>/dev/null \
       | grep -q "^${api}"; then
      return 0
    fi
    i=$((i + 1)); sleep 5
  done
  echo "  警告: ${api} の有効化が確認できませんでした" >&2
}
if [ "$mode" = "run" ]; then
  echo "  API の反映を待っています..."
  for api in artifactregistry.googleapis.com secretmanager.googleapis.com \
             run.googleapis.com cloudbuild.googleapis.com; do
    wait_for_api "$api"
  done
  echo "  反映を確認しました"
fi

echo
echo "--- 2. Artifact Registry ---"
if ! exists gcloud artifacts repositories describe "$REPO" --location="$REGION" \
     --project="$PROJECT"; then
  run gcloud artifacts repositories create "$REPO" --repository-format=docker \
      --location="$REGION" --description="Medicare Part D × Text-to-SQL" --project="$PROJECT"
else
  echo "  （$REPO は作成済み）"
fi

echo
echo "--- 3. 実行用サービスアカウント（最小権限）---"
if ! exists gcloud iam service-accounts describe "$RUNTIME_SA" --project="$PROJECT"; then
  run gcloud iam service-accounts create "$SA_NAME" \
      --display-name="Medicare Part D × Text-to-SQL runtime" --project="$PROJECT"
else
  echo "  （$RUNTIME_SA は作成済み）"
fi
# BigQuery のジョブ実行はプロジェクト単位、データ閲覧は partd データセットだけ。
# プロジェクト全体の Viewer や Editor は付けない。
run gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:${RUNTIME_SA}" --role="roles/bigquery.jobUser" --condition=None
grant_dataset_reader

echo
echo "--- 4. Secret Manager に API キー ---"
if ! exists gcloud secrets describe "$SECRET" --project="$PROJECT"; then
  if [ "$mode" = "run" ]; then
    key="$(grep -E "^${SECRET}=" .env | cut -d= -f2-)"
    [ -n "$key" ] && [ "$key" != "sk-ant-..." ] || { echo ".env の $SECRET が未設定です" >&2; exit 1; }
    echo "+ gcloud secrets create $SECRET --data-file=-  （.env から読む。画面には出さない）"
    printf '%s' "$key" | gcloud secrets create "$SECRET" --data-file=- --project="$PROJECT"
  else
    echo "  gcloud secrets create $SECRET --data-file=-   （.env の値を標準入力で渡す）"
  fi
else
  echo "  （シークレット $SECRET は作成済み。更新は gcloud secrets versions add）"
fi
run gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor" --project="$PROJECT"

echo
echo "--- 5. Cloud Build のサービスアカウントに権限 ---"
# Cloud Build は Compute のデフォルト SA で動く。新しいプロジェクトでは
# ソースを置くバケットも読めず、次のエラーで落ちる:
#   403: ...-compute@developer.gserviceaccount.com does not have
#        storage.objects.get access to .../objects/source/....tgz
# roles/cloudbuild.builds.builder がビルドに必要な権限（ストレージ読み書き、
# ログ書き込み、Artifact Registry への push）をまとめて持つ。
# ※これはビルド用であって、アプリの実行用 SA（$RUNTIME_SA）とは別。実行用は最小のまま。
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)' --quiet </dev/null)"
BUILD_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
echo "  build SA=$BUILD_SA"
run gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:${BUILD_SA}" \
    --role="roles/cloudbuild.builds.builder" --condition=None

echo
echo "--- 6. イメージのビルド（Cloud Build）---"
run gcloud builds submit --tag "${IMAGE}:latest" --project="$PROJECT" --region="$REGION" .

echo
echo "--- 7. Cloud Run へデプロイ ---"
run gcloud run deploy "$SERVICE" \
    --image="${IMAGE}:latest" \
    --region="$REGION" \
    --project="$PROJECT" \
    --service-account="$RUNTIME_SA" \
    --no-allow-unauthenticated \
    --min-instances=0 --max-instances=2 --concurrency=10 \
    --memory=1Gi --cpu=1 --timeout=300 \
    --set-env-vars="GCP_PROJECT=${PROJECT},BQ_DATASET=${DATASET},BQ_LOCATION=US,MAX_BYTES_BILLED=${MAX_BYTES_BILLED:-2147483648},MAX_QUESTIONS_PER_SESSION=${MAX_QUESTIONS_PER_SESSION:-20},ANTHROPIC_MODEL=${ANTHROPIC_MODEL:-claude-sonnet-5}" \
    --set-secrets="ANTHROPIC_API_KEY=${SECRET}:latest"

echo
echo "--- 8. アクセスを許可する人 ---"
if [ ${#invites[@]} -eq 0 ]; then
  echo "  （--invite を付けると roles/run.invoker を付与します）"
else
  for who in "${invites[@]}"; do
    member="user:${who}"
    case "$who" in *gserviceaccount.com) member="serviceAccount:${who}" ;; esac
    run gcloud run services add-iam-policy-binding "$SERVICE" \
        --region="$REGION" --project="$PROJECT" \
        --member="$member" --role="roles/run.invoker"
  done
fi

if [ "$mode" = "run" ]; then
  echo
  echo "--- 9. 配信リビジョンの確認 ---"
  check_traffic || exit 1

  echo
  echo "--- 10. スモークテスト ---"
  if ! smoke_test; then
    echo
    echo "★ デプロイは完了しましたが、動作確認に失敗しました。" >&2
    echo "  直前のリビジョンに戻すには:" >&2
    prev="$(gcloud run revisions list --service="$SERVICE" --region="$REGION" \
            --project="$PROJECT" --format='value(metadata.name)' --quiet </dev/null \
            2>/dev/null | sed -n 2p)"
    echo "    gcloud run services update-traffic $SERVICE --region=$REGION \\" >&2
    echo "      --project=$PROJECT --to-revisions=${prev:-<前のリビジョン>}=100" >&2
    echo "  ログ:" >&2
    echo "    gcloud logging read 'resource.labels.service_name=\"$SERVICE\" AND severity>=WARNING' \\" >&2
    echo "      --project=$PROJECT --limit=10 --freshness=10m" >&2
    exit 1
  fi

  url="$(gcloud run services describe "$SERVICE" --region="$REGION" \
        --project="$PROJECT" --format='value(status.url)')"
  echo
  echo "デプロイ先: $url"
  echo
  echo "このURLはブラウザで直接開いても 403 になります（意図どおり）。"
  echo "見る側は次のどちらかで開きます。"
  echo
  echo "  A. 自分の手元から（gcloud があれば一番早い）"
  echo "     gcloud run services proxy $SERVICE --region=$REGION --project=$PROJECT"
  echo "     → http://localhost:8080 が開く"
  echo
  echo "  B. 相手に見せる：招待してから A を案内する"
  echo "     ./deploy.sh --run --invite 相手@gmail.com"
else
  echo
  echo "※ これは --plan（表示のみ）です。実行するには ./deploy.sh --run"
fi
