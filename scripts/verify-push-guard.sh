#!/bin/bash
# pre-push 잠금 «검증» — 함대 표준 4축 + 이 도메인에서 값을 한 축들.
#
# ★왜 파일인가: 처음엔 이 축들을 «채팅에서 셸로» 돌리고 「검증했다」고 적었다. 그건 회원님도
#   다음 사람도 다시 돌려 볼 수 없다(술어 ⑹ 확장). 이제 한 줄로 재현된다:
#     bash scripts/verify-push-guard.sh
#
# 표준 4축: ⑴막을 것을 막는가 ⑵정상 경로가 안 죽는가 ⑶명시 우회가 되는가 ⑷우회가 기록에 남는가
#   ★⑵가 제일 중요하다 — 잠금이 배포·백업을 죽이면 그게 더 큰 사고다(실제로 한 번 냈다).
# 더한 축: ⑸막은 사실도 기록 · ⑹남의 정상 경로 · ⑺되감기 · ⑻잡는가 · ⑼**오탐 안 내는가**
#   · ⑽새 보안문서 차단 · ⑾**이미 공개된 것은 안 막는가**
# ★⑼⑾ 은 «오탐 방지» 방향이다 — **잡는 것만 시험하면 시험 자체가 한쪽 눈이다.**
#
# ★전부 `--dry-run`, 프로브는 임시 인덱스만 쓴다 — **작업 트리를 한 글자도 안 건드린다**
#   (검증 도구 자체가 안전해야 한다 — 술어 ⑸를 도구에도 적용).
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

HOOK=.git/hooks/pre-push
LOG="${TM_PUSH_GUARD_LOG:-$HOME/claude-project/msg/attachments/push-guard-bypass.log}"
PROBE_REF=refs/heads/_pushguard_probe
EXPECTED=12
pass=0; fail=0
ok()  { echo "  ✅ $1"; pass=$((pass+1)); }
bad() { echo "  ★ $1"; fail=$((fail+1)); }

echo "── pre-push 잠금 검증"
if [ ! -x "$HOOK" ]; then
  echo "  ★ 훅이 없거나 실행 권한이 없다: $HOOK — 규율만 있고 구현 0 인 상태다"
  exit 1
fi

# ── 프로브 헬퍼(작업 트리 무접촉) ─────────────────────────────────────────────
# ★`git mktree` 를 쓰다 «조용히» 실패했었다 — 경로에 `/` 가 있으면 거부한다(하위 트리를 요구).
#   임시 인덱스 + write-tree 로 바꿨다. 경로가 깊어도 된다.
mk_probe() {   # $1=경로 $2=내용 → ref 출력
  local blob base cmt tree idx
  idx=$(mktemp) || return 1; rm -f "$idx"
  blob=$(printf '%s\n' "$2" | git hash-object -w --stdin 2>/dev/null) || return 1
  GIT_INDEX_FILE="$idx" git update-index --add --cacheinfo "100644,$blob,$1" 2>/dev/null || { rm -f "$idx"; return 1; }
  tree=$(GIT_INDEX_FILE="$idx" git write-tree 2>/dev/null); rm -f "$idx"
  [ -n "$tree" ] || return 1
  base=$(git rev-parse -q --verify origin/main 2>/dev/null)
  cmt=$(git -c user.name=probe -c user.email=probe@local commit-tree "$tree" ${base:+-p "$base"} -m "pushguard probe" 2>/dev/null) || return 1
  git update-ref "$PROBE_REF" "$cmt" && echo "$PROBE_REF"
}
probe_push() {  # $1=경로 $2=내용 $3=block|pass $4=축 이름
  local r rc
  if ! r=$(mk_probe "$1" "$2"); then bad "$4 — ★프로브 생성 실패(«측정 불가»를 통과로 안 센다)"; return; fi
  git push --dry-run origin "$r:$PROBE_REF" >/dev/null 2>&1; rc=$?
  git update-ref -d "$PROBE_REF" 2>/dev/null
  if [ "$3" = block ]; then
    [ $rc -ne 0 ] && ok "$4" || bad "$4 — 막아야 하는데 통과했다"
  else
    [ $rc -eq 0 ] && ok "$4" || bad "$4 — 통과해야 하는데 막혔다(정상 경로 파괴)"
  fi
}

# ⑴ 막을 것을 막는가
git push --dry-run origin main:main >/dev/null 2>&1
[ $? -ne 0 ] && ok "⑴ origin←main 차단" || bad "⑴ origin←main 이 통과했다"

# ⑵ ★정상 경로가 안 죽는가 — 배포와 백업. 여기서 깨지면 잠금이 사고를 «만든» 것이다.
git push --dry-run origin origin/gh-pages:gh-pages >/dev/null 2>&1
[ $? -eq 0 ] && ok "⑵-a origin←gh-pages 통과(배포 살아 있음)" || bad "⑵-a 배포 경로가 죽었다"
git push --dry-run backup main:main >/dev/null 2>&1
[ $? -eq 0 ] && ok "⑵-b backup←main 통과(백업 살아 있음)" || bad "⑵-b 백업 경로가 죽었다"

# ⑶ 명시 우회가 되는가 — 길이 없으면 사람은 --no-verify 로 도망가고 그건 흔적이 0이다
TM_ALLOW_ORIGIN_PUSH=1 git push --dry-run origin main:main >/dev/null 2>&1
[ $? -eq 0 ] && ok "⑶ 명시 우회(TM_ALLOW_ORIGIN_PUSH=1) 통과" || bad "⑶ 명시 우회가 막혔다"

# ⑷ 우회가 «기록»에 남는가 — 화면 경고는 기록이 아니다(푸시가 끝나면 사라진다)
b=$( [ -f "$LOG" ] && grep -c 'bypass' "$LOG" 2>/dev/null || echo 0 )
TM_ALLOW_ORIGIN_PUSH=1 git push --dry-run origin main:main >/dev/null 2>&1
a=$( [ -f "$LOG" ] && grep -c 'bypass' "$LOG" 2>/dev/null || echo 0 )
[ "$a" -gt "$b" ] && ok "⑷ 우회가 로그에 남는다($LOG)" || bad "⑷ 우회가 기록에 안 남는다"

# ⑸ ★«막았다»도 사건이다 — 차단이 기록에 남는가
b=$( [ -f "$LOG" ] && grep -c 'blocked' "$LOG" 2>/dev/null || echo 0 )
git push --dry-run origin main:main >/dev/null 2>&1
a=$( [ -f "$LOG" ] && grep -c 'blocked' "$LOG" 2>/dev/null || echo 0 )
[ "$a" -gt "$b" ] && ok "⑸ 차단이 로그에 남는다(«안 밀린 사실»이 남는다)" || bad "⑸ 차단이 기록에 안 남는다"

# ⑹ ★남의 정상 경로 — v1 이 tmseat 의 feat/seat 를 죽였다. 재발을 상시로 잰다.
if git rev-parse --verify -q feat/seat >/dev/null 2>&1; then
  git push --dry-run origin feat/seat >/dev/null 2>&1
  [ $? -eq 0 ] && ok "⑹ origin←feat/seat 통과(tmseat 정상 경로 살아 있음)" || bad "⑹ feat/seat 가 막힌다 — 또 남의 경로를 죽이고 있다"
else
  bad "⑹ feat/seat 가 없어 «측정 불가» — 통과로 세지 않는다"
fi

# ⑺ ★gh-pages 되감기 거부 — 브랜치 통째 되감기는 다른 도메인 배포까지 죽인다
old=$(git rev-parse -q --verify origin/gh-pages~3 2>/dev/null || git rev-parse -q --verify origin/gh-pages~1 2>/dev/null)
if [ -n "$old" ]; then
  git push --dry-run --force origin "$old:gh-pages" >/dev/null 2>&1
  [ $? -ne 0 ] && ok "⑺ gh-pages 되감기 거부" || bad "⑺ 되감기가 통과했다 — 구멍이 열려 있다"
else
  bad "⑺ 되감기 시험용 옛 커밋 없음 — «측정 불가»"
fi

# ⑻ 잡는가 / ⑼ ★오탐 안 내는가 — 반드시 짝으로
probe_push "probe.txt" "token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwcm9iZSJ9" block "⑻ 비밀값 섞인 브랜치 차단(내용 검사가 실제로 돈다)"
probe_push "notes.md"  "평범한 메모 — 비밀값 없음"                          pass  "⑼ 깨끗한 브랜치 통과(오탐 없음)"

# ⑽ 새 보안 관찰 문서는 막는가 / ⑾ ★이미 공개된 동종 파일 수정은 통과하는가
probe_push "docs/SECURITY-NEW-PROBE.md"  "취약 관찰 노트(가짜)"   block "⑽ 새 보안 관찰 문서 차단"
probe_push "docs/SECURITY-NEXT-STEPS.md" "이미 공개된 파일 수정"  pass  "⑾ 이미 공개된 보안 문서 수정은 통과(예방 아닌 파괴를 피한다)"

# ── 잠금 «깊이» — 래퍼인가 실행기 안쪽인가(숨기지 않고 매번 찍는다)
echo "── 잠금 깊이"
git push --dry-run --no-verify origin main:main >/dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "  ⚠ --no-verify 로 우회된다 = «래퍼» 깊이다(git hook 은 원래 그렇다)."
  echo "     더 깊은 형태 = origin push URL 자체를 없애 «그 동사를 구현하지 않는 것»."
  echo "     지금 안 한 이유: gh-pages 배포가 같은 origin 을 쓰고 워크트리의 다른 세션도 그 경로로 민다 — 축 ⑵가 깨진다."
else
  echo "  ✅ --no-verify 로도 안 뚫린다(실행기 안쪽)"
fi

# ★«안 돈 검사»는 실패로 센다 — 실제로 ⑻ 이 헬퍼 정의 앞에 있어 «실행조차» 안 됐는데
#   집계는 「실패 0」이었다. **검사가 사라지는 것과 통과하는 것은 다르다.**
ran=$((pass+fail))
if [ "$ran" -ne "$EXPECTED" ]; then
  echo "  ★축 $EXPECTED 개를 기대했는데 $ran 개만 돌았다 — 어떤 검사가 «실행조차» 안 됐다"
  fail=$((fail+1))
fi
echo "── 결과: 통과 $pass · 실패 $fail · 실행 $ran/$EXPECTED"
[ "$fail" -eq 0 ] || exit 1
