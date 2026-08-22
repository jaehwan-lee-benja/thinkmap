#!/bin/bash
# 키오스크 «지금 라이브가 무엇인가» 읽기 전용 진단 — 2026-08-17 자산화.
#
# ★왜 파일인가: 이 대조를 오늘 손으로 두 번 했다(efe1e54 검수·배포 술어 패치). 손으로 하는 대조는
#   ⑴매번 술어가 조금씩 달라지고 ⑵바쁠 때 생략되고 ⑶«어느 URL 을 봤는지»가 기록에 안 남는다.
#   ⇒ 술어를 파일에 박는다. 배포 가드(`~/claude-project/scripts/deploy-kiosk.sh`)와 역할이 다르다:
#     가드 = **배포를 막는다**(쓰기 있음·사전) · 이 스크립트 = **현재 상태를 말한다**(쓰기 0·사후·언제든).
#
# 쓰기를 하지 않는다 — 생성기를 돌리지 않고 `index.ts` 에 박힌 자산명을 직접 읽어 비교한다.
#   (진단이 대상을 바꾸면, 무엇을 진단했는지 알 수 없게 된다.)
#
# 사용: bash scripts/verify-kiosk-live.sh          # 로컬 빌드본 기준 대조 + 라이브 3경로
#       bash scripts/verify-kiosk-live.sh --live   # 라이브만(로컬 빌드본 없어도 됨)
set -uo pipefail
cd "$(dirname "$0")/.."
STORAGE=https://sqisntxippjzcekyhqyo.supabase.co/storage/v1/object/public/kiosk
EDGE=https://sqisntxippjzcekyhqyo.supabase.co/functions/v1/kiosk
CFP=https://thinkmap.pages.dev/thinkmap/membership/kiosk
GHP=https://jaehwan-lee-benja.github.io/thinkmap/membership/
BUILD=apps/membership/dist-storage/index.html
FN=supabase/functions/kiosk/index.ts
rc=0
assets() { grep -o 'index-[A-Za-z0-9_-]*\.\(js\|css\)\|index-legacy-[A-Za-z0-9_-]*\.js' "$1" 2>/dev/null | sort -u; }

if [ "${1:-}" != "--live" ]; then
  echo "▮ 로컬 빌드본 ↔ Edge 함수 «짝»"
  if [ ! -f "$BUILD" ]; then
    echo "  · 빌드본 없음($BUILD) — 대조 생략(판정 없음, 통과 아님). 필요하면 npm run build:storage"
  else
    B=$(assets "$BUILD"); F=$(assets "$FN")
    if [ "$B" = "$F" ]; then
      echo "  ✓ 일치 — $(printf '%s' "$B" | tr '\n' ' ')"
    else
      echo "  ✗ 어긋남(이 상태로 자산만 올리면 화면이 통째로 404)"
      diff <(printf '%s\n' "$B") <(printf '%s\n' "$F") | sed 's/^/    /'
      echo "    → node scripts/gen-kiosk-edge.mjs 후 커밋 + supabase functions deploy kiosk"
      rc=1
    fi
  fi
fi

echo "▮ 라이브 경로가 서빙하는 번들"
LIVE_EDGE=""
for pair in "Edge(현행 진입점)|$EDGE" "cf-pages|$CFP" "gh-pages(구 주소)|$GHP"; do
  name=${pair%%|*}; url=${pair#*|}
  body=$(curl -s --max-time 20 "$url"); code=$(printf '%s' "$body" | wc -c | tr -d ' ')
  js=$(printf '%s' "$body" | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -1)
  printf '  %-22s %s\n' "$name" "${js:-번들 없음(응답 ${code}B)}"
  [ "$name" = "Edge(현행 진입점)" ] && LIVE_EDGE="$js"
done
echo "  ※ 세 경로의 번들이 서로 다를 수 있다 — «배포했다»가 URL 마다 다른 뜻이 된다."
echo "     기기 북마크가 어느 주소인지 모르면 이 표만으로는 판정이 안 된다(현장 확인 항목)."

echo "▮ 라이브 진입점이 가리키는 자산이 실제로 받아지는가"
if [ -z "$LIVE_EDGE" ]; then
  echo "  ✗ 진입점에서 번들명을 못 뽑았다 — 판정 없음(통과 아님)"; rc=1
else
  for f in $(curl -s --max-time 20 "$EDGE" | grep -o 'index-[A-Za-z0-9_-]*\.\(js\|css\)\|index-legacy-[A-Za-z0-9_-]*\.js' | sort -u); do
    c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$STORAGE/assets/$f")
    printf '  %-34s HTTP %s\n' "$f" "$c"
    [ "$c" = "200" ] || rc=1
  done
fi

[ $rc -eq 0 ] && echo "✓ 진단 통과" || echo "✗ 진단 실패 — 위 ✗ 항목 참조"
exit $rc
