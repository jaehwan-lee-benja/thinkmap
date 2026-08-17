#!/usr/bin/env bash
# 변이 시험 재현기 — ★「가드가 실제로 막는가」를 **누구나 다시 돌려 볼 수 있게** 한다.
#
# 왜(2026-08-17, orch 술어 ⑹ 확장): 나는 커밋 메시지와 보고에 「변이 6종 실증, 전부 red」라고 적었다.
#   그런데 그 실증은 **내 세션 안에서만** 일어났다 — 다음 사람은 재현할 수 없고, 회원님은 확인할 방법이 없다.
#   교본이 이미 금한 형태다(「반증 시험이 커밋 메시지 서술로만 남는 것」). 서술을 **파일로** 옮긴다.
#
# 무엇을 증명하나: `utils/seatLoadState.js` 의 각 판정을 **일부러 틀리게 바꾸면 시험이 빨개진다.**
#   초록불이 «시험이 눈을 감고 있어서»가 아니라 «코드가 맞아서»임을 보이는 유일한 방법이다.
#   ★변이가 살아남으면(초록 유지) 그건 **시험이 그 주장을 안 보고 있다는 뜻**이고, 여기서 실패로 잡는다.
#
# 쓰기: apps/seat/scripts/verify-mutations.sh     (레포 어디서 실행해도 됨. ~10초)
# 성공 = 「변이 N/N 적중 · 원본 green」. 하나라도 살아남으면 exit 1.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SRC="$REPO/apps/seat/src/components/Seat/utils/seatLoadState.js"
BAK="$(mktemp)"
cd "$REPO"

cp "$SRC" "$BAK"
# ★어떤 경로로 끝나도 원본을 되돌린다 — 시험기가 트리를 더럽히면 그게 더 큰 사고다.
trap 'cp "$BAK" "$SRC"; rm -f "$BAK"' EXIT INT TERM

run_tests() { npx vitest run apps/seat >/dev/null 2>&1; }   # 0=green, 그 외=red

# 변이 목록 — [설명]::[찾을 문자열]::[바꿀 문자열]
#   ★설명은 «무엇이 깨지는가»가 아니라 «어떤 사고가 되살아나는가»로 적는다(다음 사람이 값을 알게).
MUTANTS=(
"읽기 실패를 「없음」과 같은 문구로 착지시킴(단일점 ② 회귀)::  if (state === 'failed') return '불러오지 못했습니다 — 「없음」이 아닙니다. 재시도하세요.'::  if (state === 'failed') return readyText"
"한 번 성공했으면 이후 실패를 무시(낡은 화면을 「최신」으로)::  if (errors.some(Boolean)) return 'failed'\n  return loadedAt ? 'ready' : 'loading'::  if (loadedAt) return 'ready'\n  if (errors.some(Boolean)) return 'failed'\n  return 'loading'"
"재연결 직후 재조회 안 함(연결은 초록, 내용은 굳음 — 단일점 ① 급소)::      return { status: 'live', attempt: 0, refetch: attempt > 0, reconnect: false }::      return { status: 'live', attempt: 0, refetch: false, reconnect: false }"
"재시도를 「첫 연결 중」으로 표기(끊긴 채 경고가 꺼진다)::      return { status: status === 'live' || status === 'retrying' ? 'retrying' : 'connecting', attempt, refetch: false, reconnect: false }::      return { status: 'connecting', attempt, refetch: false, reconnect: false }"
"백오프 상한 제거(영영 안 돌아오는 태블릿)::export const backoffMs = (attempt) => BACKOFF_MS[Math.min(Math.max(attempt, 0), BACKOFF_MS.length - 1)]::export const backoffMs = (attempt) => 2000 * Math.pow(2, attempt)"
"깨어남 재조회 안 함(잠든 사이 변경을 영영 못 받음)::      return { status, attempt, refetch: true, reconnect: status !== 'live' }::      return { status, attempt, refetch: false, reconnect: status !== 'live' }"
)

# ★--self-test — 「이 시험기가 조용한 것」과 「코드가 깨끗한 것」은 다르다(design 자기고지, 2026-08-17).
#   시험이 **안 보는** 변이를 일부러 하나 끼워, 시험기가 그걸 «살아남음»으로 **보고하는지**를 본다.
#   이게 통과한 뒤의 조용함만 초록이다. (이 갈래가 없으면 「변이 6/6 적중」은 자기 자랑일 뿐이다.)
if [ "${1:-}" = "--self-test" ]; then
  MUTANTS+=("★자체시험용 — 시험이 보지 않는 변경(살아남아야 정상)::export const POLL_MS = 60000::export const POLL_MS = 61000")
  echo "── 자체시험 모드: 마지막 변이는 **살아남아야** 이 시험기가 눈을 뜬 것이다 ──"
fi

echo "── seatLoadState 변이 시험 ──────────────────────────────"
if ! run_tests; then
  echo "✗ 변이를 넣기 전부터 red 다 — 먼저 시험을 통과시켜라." >&2
  exit 1
fi
echo "  기준: 원본 green ✓"

killed=0; survived=0
for i in "${!MUTANTS[@]}"; do
  desc="$(python3 -c "import sys;print(sys.argv[1].split('::')[0])" "${MUTANTS[$i]}")"
  cp "$BAK" "$SRC"
  applied="$(python3 - "$SRC" "${MUTANTS[$i]}" <<'PY'
import sys
path, spec = sys.argv[1], sys.argv[2]
_, find, repl = spec.split('::')
find = find.replace('\\n', '\n'); repl = repl.replace('\\n', '\n')
s = open(path, encoding='utf-8').read()
if find not in s:
    print('NOTFOUND'); sys.exit(0)
open(path, 'w', encoding='utf-8').write(s.replace(find, repl, 1))
print('OK')
PY
)"
  if [ "$applied" != "OK" ]; then
    # ★변이를 못 넣는 것도 실패다 — 코드가 바뀌어 이 시험기가 **낡았다**는 신호다(조용히 넘기면 초록 거짓말).
    echo "  ✗ 변이 $((i+1)) 주입 실패(대상 코드가 바뀌었다): $desc"
    survived=$((survived+1)); continue
  fi
  if run_tests; then
    echo "  ✗ 변이 $((i+1)) **살아남음** — 시험이 이걸 안 보고 있다: $desc"
    survived=$((survived+1))
  else
    echo "  ✓ 변이 $((i+1)) 적중: $desc"
    killed=$((killed+1))
  fi
done

cp "$BAK" "$SRC"
if ! run_tests; then
  echo "✗ 원본 복원 후에도 red — 시험기가 트리를 망가뜨렸다." >&2
  exit 1
fi

echo "────────────────────────────────────────────────────────"
echo "변이 $killed/$((killed+survived)) 적중 · 원본 green ✓"

if [ "${1:-}" = "--self-test" ]; then
  # 자체시험: 마지막 하나가 살아남아야 «이 시험기가 살아남음을 실제로 감지한다»가 증명된다.
  if [ "$survived" -eq 1 ]; then
    echo "✓ 자체시험 통과 — 살아남은 변이를 **감지했다**(이 시험기는 눈을 뜨고 있다)."
    exit 0
  fi
  echo "✗ 자체시험 실패 — 살아남아야 할 변이를 «적중»이라 보고했다(살아남음 $survived). 시험기를 못 믿는다." >&2
  exit 1
fi

[ "$survived" -eq 0 ] || { echo "★ 살아남은 변이 $survived 건 — 그 주장은 아직 시험이 지키지 않는다." >&2; exit 1; }
