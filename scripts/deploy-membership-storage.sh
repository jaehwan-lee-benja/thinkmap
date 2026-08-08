#!/usr/bin/env bash
# 멤버십 키오스크 → Supabase Storage 공개 버킷 서빙(2026-08-08 긴급).
#
# 왜: 매장 KT 회선(462Mbps)에서 **pages.dev·github.io 만 극단 저속**인데
#     `<project>.supabase.co` 는 1초 내 응답(현장 실측). 같은 도메인 계열에서 서빙해 원천 회피한다.
#
# 성질: **재실행 가능**(idempotent). 버킷이 있으면 만들지 않고, 파일은 upsert 로 덮어쓴다.
#
# 필요 환경변수(★값을 출력하지 않는다):
#   SUPABASE_URL          예) https://sqisntxippjzcekyhqyo.supabase.co
#   SUPABASE_SERVICE_KEY  service_role 키 — **tm(통합세션) 축**. 이 스크립트 밖으로 새지 않는다.
# 선택:
#   BUCKET(기본 kiosk) · DIST(기본 apps/membership/dist-storage)
#
# 사용:
#   cd apps/membership && APP_BASE=./ npx vite build --outDir dist-storage   # ★base 는 반드시 './'
#   SUPABASE_URL=… SUPABASE_SERVICE_KEY=… bash scripts/deploy-membership-storage.sh
set -euo pipefail

BUCKET="${BUCKET:-kiosk}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${DIST:-$ROOT/apps/membership/dist-storage}"

echo "pwd    = $(pwd)"          # ★tm 사고 교훈: 배포 스텝마다 어디서 도는지 찍는다
echo "root   = $ROOT"
echo "dist   = $DIST"
echo "bucket = $BUCKET"

: "${SUPABASE_URL:?SUPABASE_URL 이 필요합니다}"
: "${SUPABASE_SERVICE_KEY:?SUPABASE_SERVICE_KEY 가 필요합니다}"
[ -f "$DIST/index.html" ] || { echo "✗ $DIST/index.html 없음 — 먼저 APP_BASE=./ 로 빌드하세요"; exit 1; }

# ★base 가 './' 인 산출물인지 확인한다. gh-pages 용(`/thinkmap/membership/`)을 잘못 올리면
#   자산 경로가 전부 어긋나 하얀 화면이 된다 — 여기서 막는 게 현장에서 겪는 것보다 싸다.
if grep -q 'src="/thinkmap/membership/' "$DIST/index.html"; then
  echo "✗ 이 산출물은 gh-pages base 입니다(APP_BASE=./ 로 다시 빌드하세요)"; exit 1
fi

api() { curl -sS -w '\n%{http_code}' -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" -H "apikey: $SUPABASE_SERVICE_KEY" "$@"; }

echo "── 버킷 확인/생성"
resp="$(api -X POST "$SUPABASE_URL/storage/v1/bucket" -H 'Content-Type: application/json' \
  -d "{\"name\":\"$BUCKET\",\"id\":\"$BUCKET\",\"public\":true}" || true)"
code="$(printf '%s' "$resp" | tail -n1)"
case "$code" in
  200|201) echo "  버킷 생성됨: $BUCKET" ;;
  409)     echo "  이미 있음: $BUCKET (그대로 사용)" ;;
  *)       echo "  ⚠ 응답 $code — $(printf '%s' "$resp" | sed '$d')" ;;
esac
# 공개 여부는 재실행에서도 보장한다(누가 비공개로 바꿨을 수 있다).
api -X PUT "$SUPABASE_URL/storage/v1/bucket/$BUCKET" -H 'Content-Type: application/json' \
  -d '{"public":true}' >/dev/null || true

ctype() {
  case "$1" in
    *.html) echo "text/html; charset=utf-8" ;;
    *.js)   echo "text/javascript; charset=utf-8" ;;
    *.css)  echo "text/css; charset=utf-8" ;;
    *.json) echo "application/json; charset=utf-8" ;;
    *.svg)  echo "image/svg+xml" ;;
    *.png)  echo "image/png" ;;  *.jpg|*.jpeg) echo "image/jpeg" ;;
    *.ttf)  echo "font/ttf" ;;   *.woff2) echo "font/woff2" ;; *.woff) echo "font/woff" ;;
    *.ico)  echo "image/x-icon" ;;
    *)      echo "application/octet-stream" ;;
  esac
}
# 해시가 붙은 자산은 영구 캐시, 그렇지 않은 진입점은 **매번 재검증**(안 그러면 배포해도 옛 화면이 남는다).
cachectl() {
  case "$1" in
    assets/*) echo "public, max-age=31536000, immutable" ;;
    *)        echo "no-cache" ;;
  esac
}

echo "── 업로드"
ok=0; fail=0
cd "$DIST"
while IFS= read -r f; do
  rel="${f#./}"
  r="$(api -X POST "$SUPABASE_URL/storage/v1/object/$BUCKET/$rel" \
        -H "Content-Type: $(ctype "$rel")" -H "Cache-Control: $(cachectl "$rel")" \
        -H 'x-upsert: true' --data-binary "@$rel")"
  c="$(printf '%s' "$r" | tail -n1)"
  if [ "$c" = "200" ] || [ "$c" = "201" ]; then ok=$((ok+1)); else
    fail=$((fail+1)); echo "  ✗ $rel → $c $(printf '%s' "$r" | sed '$d')"
  fi
done < <(find . -type f | sort)
echo "  성공 $ok · 실패 $fail"
[ "$fail" -eq 0 ] || { echo "✗ 실패가 있어 중단합니다"; exit 1; }

BASE_URL="$SUPABASE_URL/storage/v1/object/public/$BUCKET"
echo "── 검증(공개 GET)"
for path in "index.html" "$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' index.html | head -1)"; do
  printf '  %-28s ' "$path"
  curl -sS -o /dev/null -w 'HTTP %{http_code} · %{size_download}B · %{content_type}\n' "$BASE_URL/$path"
done
echo
echo "★ 키오스크 주소"
echo "   고객   $BASE_URL/index.html"
echo "   직원   $BASE_URL/index.html?role=staff"
echo "   스캔   $BASE_URL/index.html?role=scan"
echo
echo "※ 남은 확인(자동화 못 함):"
echo "   · 쿼리스트링(?role=staff)이 Storage 에서 그대로 통과하는지 — 위 주소를 실제로 열어 확인"
echo "   · Supabase Auth 리디렉션 허용목록에 이 주소 추가(로그인 복귀 경로)"
echo "   · 옛 해시 자산은 지우지 않는다(누적) — 정리는 별건"
