#!/usr/bin/env bash
# 자리후(seat) 위성 배포 — 빌드 → gh-pages `seat/` 갱신 → ★**«됐다»까지 확인**.
#
# 왜 스크립트인가: 이 도메인의 배포 함정 둘이 **사람 기억에만** 있었다.
#   ⑴ `gh-pages -d dist` 를 위성 옵션 없이 쓰면 **다른 위성 폴더가 통째로 날아간다**(Phase2·3 재발).
#      → `-e seat --add` 가 그 방어인데, 옵션 하나 빠뜨리면 조용히 사고가 난다.
#   ⑵ 「배포했다」와 「라이브가 바뀌었다」는 다른 명제다. 자산 해시가 안 바뀌거나 CDN 이 늦으면
#      «했다»는 참인데 «됐다»는 거짓이다. 그래서 **대조군 리터럴로 라이브를 직접 캐묻는다**(SEAT-SPEC §16.2).
#
# 쓰기: scripts/deploy-seat.sh          계획 보여주고 확인 → 배포 → 검증
#       scripts/deploy-seat.sh --verify 배포 없이 **지금 라이브만 검증**(배포 후 재확인·롤백 후 확인용)
#
# ★배포 게이트: 이 스크립트는 게이트를 대신하지 않는다. 자리후는 **영업 중 현장 화면**이라
#   지휘부의 배포 창 승인(마감 후 등) 없이 돌리지 마라. 되돌리기는 `scripts/rollback-seat.sh`.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# ★«어느 주소의 산출물인가»를 못 박는다(2026-08-17 규율 — membership 은 구 gh-pages 를 봐서
#   「라이브에 없다」로 오판했다). 「라이브에 있다/없다」는 주소를 안 적으면 절반짜리 문장이다.
#
# ★**「자리후의 표면은 이 하나뿐」이라는 «부재 판정»의 근거 세 줄**(2026-08-18 규율: 없다도 있다만큼 증거가 필요하다):
#   ⑴어느 표면을 봤나 — Supabase Edge **함수 등록부 전수 19개**(프로젝트 sqisntxippjzcekyhqyo) + **gh-pages 트리 전수**
#     (최상위 12 폴더: assets canvas crmboard expense icons inventory kiosk members membership payroll seat smoke).
#   ⑵그 도구가 셀 수 있나 — 등록부는 **배포된 함수**를 직접 나열한다(repo 파일이 아니다). 트리는 실제 서빙 파일이다.
#     ⚠**처음엔 repo grep(`cf-pages|pages.dev`)으로 «없음»이라 적었는데 그건 무근거였다** — 아래 ⑶ 참조.
#   ⑶대조군에서 «있음»이 나오나 — 나온다: 등록부에 membership 의 `kiosk` 함수가, 트리에 `kiosk/index.html` 이 **실제로 뜬다.**
#     ★그리고 **처음 쓰던 repo grep 은 그 kiosk 를 membership 에 대고 돌려도 0건**이었다(거짓 음성 실증).
#     ⇒ 도구를 바꾼 뒤에야 이 «없음»이 증거를 갖췄다.
BASE="https://jaehwan-lee-benja.github.io/thinkmap/seat"
cd "$REPO"

# ── 대조군 리터럴 — ★아무 문자열이나 고르면 안 된다(SEAT-SPEC §16.2: 실제로 세 번 틀렸다).
#   조건: ⑴이번 판에만 있고 ⑵**번들에 리터럴로 남는다**(템플릿 보간·계산값은 안 남는다).
#   실측으로 하나 걸렀다: 「60초마다 새로고침」은 `${Math.round(POLL_MS/1000)}` 보간이라 번들에 **없다.**
#   그래서 보간이 끼지 않는 앞부분만 쓴다.
LITERALS=(
  '불러오지 못했습니다 — 「없음」이 아닙니다'   # ② 읽기 실패가 「없음」과 갈린다
  '실시간 끊김 · 재연결 중'                     # ① 세 겹 동기화 경고
)

live_check() {
  local fail=0
  echo "── 라이브 검증 ($BASE)"
  local html; html="$(curl -fsS "$BASE/" 2>/dev/null)" || { echo "  ✗ index.html 을 못 받았다"; return 1; }
  # index.html 이 가리키는 **실제 자산**을 꺼내 그것으로 검증한다(내 dist 이름을 믿지 않는다).
  # ★`|| true` 가 붙는 이유 — 이게 없으면 **안내 문구가 영영 안 나온다**(2026-08-17 실증).
  #   `grep` 은 «못 찾음»을 exit 1 로 알린다. `set -e` + `pipefail` 아래서 이 대입이 실패하면
  #   스크립트가 **바로 죽어** 바로 아래 친절한 안내에 **도달하지 못한다.**
  #   ★함정은 이게 «조용하다»는 것이다: `||` 문맥(배포 경로)에서는 안내가 뜨고,
  #     직접 호출(`--verify` 경로)에서는 **아무 말 없이 exit 1** 이라 두 경로가 다르게 동작한다.
  #     「틀린 값을 보는 것」보다 나쁘다 — **틀린 줄도 모른 채 조용해진다.**
  local js css
  js="$(printf '%s' "$html" | grep -oE '/thinkmap/seat/assets/[^"]+\.js' | head -1 || true)"
  css="$(printf '%s' "$html" | grep -oE '/thinkmap/seat/assets/[^"]+\.css' | head -1 || true)"
  [ -n "$js" ] || { echo "  ✗ index.html 에서 js 자산을 못 찾았다(페이지가 바뀌었거나 배포가 안 나갔다)"; return 1; }
  for a in "$js" "$css"; do
    local code; code="$(curl -s -o /dev/null -w '%{http_code}' "https://jaehwan-lee-benja.github.io$a")"
    if [ "$code" = "200" ]; then echo "  ✓ $code  $a"; else echo "  ✗ $code  $a"; fail=1; fi
  done
  local body; body="$(curl -fsS "https://jaehwan-lee-benja.github.io$js")" || { echo "  ✗ js 본문을 못 받았다"; return 1; }
  echo "  · 라이브 버전 스탬프: $(printf '%s' "$body" | grep -oE 'v[0-9]+\.[0-9]+(-[0-9]+)?' | head -1 || echo '(못 읽음)')"
  for lit in "${LITERALS[@]}"; do
    if printf '%s' "$body" | grep -qF "$lit"; then echo "  ✓ 대조군: $lit"
    else echo "  ✗ 대조군 없음(새 코드가 안 나갔다): $lit"; fail=1; fi
  done
  return $fail
}

if [ "${1:-}" = "--verify" ]; then live_check; exit $?; fi

# ── 배포 계획
STAMP_SRC="$(git rev-parse --short HEAD)"
cat <<INFO
── 자리후 배포 계획 ─────────────────────────────────────────
  소스        : $(git rev-parse --abbrev-ref HEAD) @ $STAMP_SRC
  대상        : gh-pages 의 seat/ **폴더만**(-e seat --add — 다른 위성 보존)
  검증        : 자산 200 + 대조군 리터럴 ${#LITERALS[@]}종 + 버전 스탬프
  되돌리기    : scripts/rollback-seat.sh
  ⚠자정 주의  : 버전 스탬프는 «월.일 + 그날 커밋 수»다. **자정을 넘겨 빌드하면** 그날 커밋이 0이라
                 v<월.일> <시:분> 형태로 떨어진다(단조 증가는 유지). 카드에 번호를 적어 뒀다면 어긋난다.
────────────────────────────────────────────────────────────
INFO
read -r -p "배포 창 승인을 받았고, 진행할까? (yes 입력) " ans
[ "$ans" = "yes" ] || { echo "중단."; exit 1; }

npm run build --workspace=apps/seat
echo "── 로컬 빌드 자산: $(ls apps/seat/dist/assets | tr '\n' ' ')"
npm run deploy --workspace=apps/seat

echo "── 배포 직후 검증(반영까지 최대 1~2분 — 실패하면 잠시 뒤 --verify 로 다시 본다)"
sleep 20
live_check || {
  echo ""
  echo "★ 검증 실패. 잠시 뒤 'scripts/deploy-seat.sh --verify' 로 재확인하고," >&2
  echo "  그래도 실패하면 'scripts/rollback-seat.sh' 로 되돌려라." >&2
  exit 1
}
echo "✓ 배포·검증 완료. ★남은 것: 시각QA(4역할 × 2뷰포트 스크린샷 + 콘솔)."
