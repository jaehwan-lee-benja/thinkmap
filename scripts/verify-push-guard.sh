#!/bin/bash
# pre-push 잠금 «검증 4축» — 함대 표준(orch 2026-08-17)을 실행 가능한 파일로 굳힌 것.
#
# ★왜 파일인가: 어제 나는 이 4축을 «채팅에서 셸로» 돌리고 「검증했다」고 적었다. 그건 회원님도
#   다음 사람도 다시 돌려 볼 수 없다 — 술어 ⑹ 확장(«검증했다»에도 경로 동반)이 겨냥하는 그 형태다.
#   이제 `bash scripts/verify-push-guard.sh` 한 줄로 누구나 재현한다.
#
# 4축: ⑴막을 것을 막는가 ⑵정상 경로가 안 죽는가 ⑶명시 우회가 되는가 ⑷우회가 기록에 남는가
# ★⑵가 제일 중요하다 — 잠금이 배포·백업을 죽이면 그게 더 큰 사고다.
#
# 전부 `--dry-run` 이라 **아무것도 실제로 밀지 않는다**(이 스크립트 자체가 안전해야 한다 — 술어 ⑸).
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

HOOK=.git/hooks/pre-push
LOG="${TM_PUSH_GUARD_LOG:-$HOME/claude-project/msg/attachments/push-guard-bypass.log}"
pass=0; fail=0
ok()  { echo "  ✅ $1"; pass=$((pass+1)); }
bad() { echo "  ★ $1"; fail=$((fail+1)); }

echo "── pre-push 잠금 검증 4축"

if [ ! -x "$HOOK" ]; then
  echo "  ★ 훅이 없거나 실행 권한이 없다: $HOOK"
  echo "     (규율만 있고 구현 0 인 상태 — 이 스크립트의 나머지는 의미가 없다)"
  exit 1
fi

# ⑴ 막을 것을 막는가 — PUBLIC origin 으로 소스 브랜치
git push --dry-run origin main:main >/dev/null 2>&1
[ $? -ne 0 ] && ok "⑴ origin←main 차단" || bad "⑴ origin←main 이 통과했다 — 잠금이 안 걸렸다"

# ⑵ 정상 경로가 안 죽는가 — ★배포와 백업. 여기서 깨지면 잠금이 사고를 «만든» 것이다.
git push --dry-run origin origin/gh-pages:gh-pages >/dev/null 2>&1
[ $? -eq 0 ] && ok "⑵-a origin←gh-pages 통과(배포 살아 있음)" || bad "⑵-a 배포 경로가 죽었다"
git push --dry-run backup main:main >/dev/null 2>&1
[ $? -eq 0 ] && ok "⑵-b backup←main 통과(백업 살아 있음)" || bad "⑵-b 백업 경로가 죽었다"

# ⑶ 명시 우회가 되는가 — 막기만 하고 길이 없으면 사람들이 --no-verify 로 도망간다
TM_ALLOW_ORIGIN_PUSH=1 git push --dry-run origin main:main >/dev/null 2>&1
[ $? -eq 0 ] && ok "⑶ 명시 우회(TM_ALLOW_ORIGIN_PUSH=1) 통과" || bad "⑶ 명시 우회가 막혔다"

# ⑷ 우회가 «기록»에 남는가 — 화면에만 뜨는 경고는 기록이 아니다(푸시가 끝나면 사라진다)
before=$( [ -f "$LOG" ] && wc -l < "$LOG" || echo 0 )
TM_ALLOW_ORIGIN_PUSH=1 git push --dry-run origin main:main >/dev/null 2>&1
after=$( [ -f "$LOG" ] && wc -l < "$LOG" || echo 0 )
[ "$after" -gt "$before" ] && ok "⑷ 우회가 로그에 남는다($LOG)" || bad "⑷ 우회가 기록에 안 남는다"

# ⑸ ★«막았다»도 사건이다 — 차단이 기록에 남는가(함대 잠금 규율)
before_b=$( [ -f "$LOG" ] && grep -c 'blocked' "$LOG" 2>/dev/null || echo 0 )
git push --dry-run origin main:main >/dev/null 2>&1
after_b=$( [ -f "$LOG" ] && grep -c 'blocked' "$LOG" 2>/dev/null || echo 0 )
[ "$after_b" -gt "$before_b" ] && ok "⑸ 차단이 로그에 남는다(«안 밀린 사실»이 남는다)" || bad "⑸ 차단이 기록에 안 남는다"

# ⑹ ★tmseat 정상 경로 부활 — v1 이 죽였던 그 경로다(축 ⑵ 실측 신고분)
git rev-parse --verify -q feat/seat >/dev/null 2>&1 && {
  git push --dry-run origin feat/seat >/dev/null 2>&1
  [ $? -eq 0 ] && ok "⑹ origin←feat/seat 통과(tmseat 정상 경로 살아 있음)" || bad "⑹ feat/seat 가 아직 막힌다 — 또 남의 경로를 죽이고 있다"
} || echo "  – ⑹ feat/seat 없음(건너뜀)"

# ⑺ ★gh-pages 되감기(비-FF) 거부 — 브랜치 통째 되감기가 나가면 «다른 도메인 배포»가 같이 죽는다
old=$(git rev-parse -q --verify origin/gh-pages~3 2>/dev/null || git rev-parse -q --verify origin/gh-pages~1 2>/dev/null)
if [ -n "$old" ]; then
  git push --dry-run --force origin "$old:gh-pages" >/dev/null 2>&1
  [ $? -ne 0 ] && ok "⑺ gh-pages 되감기 거부" || bad "⑺ gh-pages 되감기가 통과했다 — 되감기 구멍이 열려 있다"
else
  echo "  – ⑺ 되감기 시험용 옛 커밋 없음(건너뜀)"
fi

# ⑻ ★비밀값이 섞인 작업 브랜치는 막는가 — «내용 검사»가 실제로 도는지(대조축)
#    ★작업 트리를 한 글자도 안 건드린다: 배관 명령으로 «떠 있는» 커밋만 만들고 임시 ref 로 민다.
#    검증 도구 자체가 위험하면 안 된다(술어 ⑸ — 이 스크립트에도 적용).
probe_ref=refs/heads/_pushguard_probe
blob=$(printf 'token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwcm9iZSJ9\n' | git hash-object -w --stdin 2>/dev/null)
if [ -n "$blob" ]; then
  tree=$(printf '100644 blob %s\tprobe.txt\n' "$blob" | git mktree 2>/dev/null)
  base=$(git rev-parse -q --verify origin/main 2>/dev/null)
  cmt=$(git -c user.name=probe -c user.email=probe@local commit-tree "$tree" ${base:+-p "$base"} -m "pushguard probe" 2>/dev/null)
  if [ -n "$cmt" ]; then
    git update-ref "$probe_ref" "$cmt"
    git push --dry-run origin "$probe_ref:refs/heads/_pushguard_probe" >/dev/null 2>&1
    [ $? -ne 0 ] && ok "⑻ 비밀값 섞인 브랜치 차단(내용 검사가 실제로 돈다)" || bad "⑻ 비밀값이 그대로 통과했다 — 검사가 안 돈다"
    git update-ref -d "$probe_ref"
  else
    echo "  – ⑻ 프로브 커밋 생성 실패(건너뜀)"
  fi
else
  echo "  – ⑻ 프로브 blob 생성 실패(건너뜀)"
fi

# ── 잠금 «깊이» 실측 — 래퍼인가, 안쪽인가
echo "── 잠금 깊이(래퍼 vs 실행기 안쪽)"
git push --dry-run --no-verify origin main:main >/dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "  ⚠ --no-verify 로 우회된다 = 이 잠금은 «래퍼» 깊이다(git hook 은 원래 그렇다)."
  echo "     더 깊은 형태 = origin 의 push URL 자체를 없애 «그 동사를 구현하지 않는 것»."
  echo "     지금 안 한 이유: gh-pages 배포가 같은 origin 을 쓴다 — 잘못 건드리면 축 ⑵가 깨진다."
else
  echo "  ✅ --no-verify 로도 안 뚫린다(실행기 안쪽 잠금)"
fi

echo "── 결과: 통과 $pass · 실패 $fail"
[ "$fail" -eq 0 ] || exit 1
