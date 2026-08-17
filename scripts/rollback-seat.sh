#!/usr/bin/env bash
# 자리후(seat) 위성 롤백 — ★**seat/ 폴더만** 되돌린다.
#
# 왜 스크립트인가(2026-08-17): 이 절차를 처음엔 **문서로만** 적어 뒀다. 그런데 그 문서의 «주 명령»이
#   `git push origin <옛커밋>:gh-pages --force-with-lease` 였고, 실측해 보니 **그게 위험한 손동작이었다** —
#   되돌아갈 지점 `74bdb42` 이후 gh-pages 에 **다른 도메인 배포가 23건** 쌓여 있었다(membership·expense).
#   브랜치를 통째로 되감으면 **남의 라이브가 같이 죽는다.** `--force-with-lease` 도 못 막는다 —
#   lease 는 «내가 아는 원격과 같은가»만 보므로, 방금 fetch 했으면 **성공한다.**
#   ⇒ 규율을 사람 기억에 두지 않고 **여기에 하드 스톱으로 박는다**(「하지 마세요」는 코드에 있어야 규율이다).
#
# 쓰기: scripts/rollback-seat.sh [되돌아갈-커밋]   (기본값 = 아래 LAST_GOOD)
#   · 인자 없이 실행하면 무엇을 할지 보여주고 **확인을 묻는다**(-y 로 건너뜀).
#   · 되돌린 뒤 **실제로 그 자산이 서빙되는지**까지는 이 스크립트가 못 본다 — 마지막에 안내하는 확인을 반드시 해라
#     («했다»가 아니라 «됐다»를 봐야 끝이다).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="gh-pages"
DIR="seat"
# 마지막으로 «재감사 통과 + 배포»가 확인된 지점. 새 배포가 안정 확인되면 이 값을 올린다.
LAST_GOOD="74bdb42"   # deploy(seat): 감사 후속 B~F + 정렬 구조교정 + 하이진 (d540d61) — 재감사 통과

# ★리허설 목적지 — 기본값은 진짜 브랜치다. 시험 브랜치를 넣어 **한 번 돌려보고 나서** 실전에 쓴다.
#   「한 번도 안 돌려본 롤백 경로」는 경로가 아니다(가드는 «막는 것»이 증거이듯, 복구는 «됐다»가 증거다).
DEST_BRANCH="${SEAT_ROLLBACK_DEST:-$BRANCH}"

TARGET="${1:-$LAST_GOOD}"
[[ "${1:-}" == "-y" ]] && { TARGET="$LAST_GOOD"; ASSUME_YES=1; }
ASSUME_YES="${ASSUME_YES:-0}"
[[ "${2:-}" == "-y" ]] && ASSUME_YES=1

cd "$REPO"
git fetch -q origin "$BRANCH"

# ── 하드 스톱 ① — 이 스크립트는 브랜치를 되감지 않는다.
#    (실수로 `git push origin $TARGET:gh-pages` 를 타이핑하는 경로 자체를 없앤다.)
if [[ "${SEAT_ROLLBACK_WHOLE_BRANCH:-}" == "1" ]]; then
  echo "✗ 브랜치 통째 되감기는 이 스크립트가 하지 않는다." >&2
  echo "  $BRANCH 에는 다른 도메인(membership·expense)의 라이브가 같이 올라가 있다 — 되감으면 남의 라이브가 죽는다." >&2
  exit 1
fi

# ── 하드 스톱 ② — 되돌아갈 지점에 seat/ 가 실제로 있는가(빈 폴더로 덮어써 라이브를 지우는 사고 방지).
if ! git cat-file -e "$TARGET:$DIR" 2>/dev/null; then
  echo "✗ $TARGET 에 '$DIR/' 이 없다 — 이 커밋으로는 되돌릴 수 없다." >&2
  exit 1
fi

CUR="$(git rev-parse --short origin/$BRANCH)"
NEW_ASSETS="$(git ls-tree --name-only "$TARGET" "$DIR/assets/" | tr '\n' ' ')"
CUR_ASSETS="$(git ls-tree --name-only "origin/$BRANCH" "$DIR/assets/" | tr '\n' ' ')"
AHEAD="$(git rev-list --count "$TARGET..origin/$BRANCH")"

cat <<INFO
── 자리후 롤백 계획 ─────────────────────────────────────────
  브랜치      : $BRANCH (현재 $CUR)$([[ "$DEST_BRANCH" != "$BRANCH" ]] && echo "   ※리허설: $DEST_BRANCH 로 푸시")
  되돌릴 폴더 : $DIR/   ← ★이것만. 다른 도메인은 손대지 않는다.
  되돌아갈 곳 : $TARGET
  현재 자산   : $CUR_ASSETS
  복구할 자산 : $NEW_ASSETS
  참고        : $TARGET 이후 $BRANCH 에 커밋 $AHEAD 건(다른 도메인 포함) — **전부 보존된다**
────────────────────────────────────────────────────────────
INFO

if [[ "$ASSUME_YES" != "1" ]]; then
  read -r -p "진행할까? (yes 입력) " ans
  [[ "$ans" == "yes" ]] || { echo "중단."; exit 1; }
fi

WT="$(mktemp -d)/gh-pages"
git worktree add -q "$WT" "origin/$BRANCH" --detach
trap 'git worktree remove --force "$WT" >/dev/null 2>&1 || true' EXIT

git -C "$WT" rm -rq --ignore-unmatch "$DIR"          # 구 자산 잔재까지 정리(폴더 통째 교체)
git -C "$WT" checkout "$TARGET" -- "$DIR"

# ★«되돌릴 것이 없음»은 실패가 아니라 성공이다 — 이미 그 판이 라이브다.
#   (리허설에서 잡힌 실제 버그: 여기서 그냥 commit 하면 `nothing to commit` 로 죽어
#    「롤백이 안 됐다」로 보인다. 급할 때 이 메시지를 보면 사람은 더 위험한 손을 쓴다.)
if git -C "$WT" diff --cached --quiet && git -C "$WT" diff --quiet; then
  echo "= 이미 $TARGET 판이 라이브다 — 되돌릴 것이 없다(정상)."
  exit 0
fi

git -C "$WT" commit -qm "rollback(seat): $TARGET 로 되돌림 (다른 도메인 무접촉)"
# refs/heads/ 를 명시한다 — 생략하면 «없는 브랜치»로 밀 때 git 이 거부한다(리허설에서 잡힘).
git -C "$WT" push -q origin "HEAD:refs/heads/$DEST_BRANCH"

# ★확인 명령은 **그대로 붙여 쓸 수 있어야 한다** — `<배포주소>` 같은 빈칸을 남기면 급할 때 못 쓴다.
#   (경로 조립을 처음에 틀렸었다: `${a#seat/}` 로 seat/ 를 떼고 /thinkmap/ 을 붙여 실제 URL 과 어긋났다.
#    리허설 출력에서 눈으로 잡혔다 — «확인 명령» 자체도 확인 대상이다.)
BASE="https://jaehwan-lee-benja.github.io/thinkmap"
echo "✓ 푸시 완료. ★아직 끝이 아니다 — 아래로 «됐다»를 확인해라(200 이어야 한다, 반영까지 최대 1~2분):"
for a in $NEW_ASSETS; do echo "  curl -s -o /dev/null -w '%{http_code}  $a\\n' $BASE/$a"; done
echo "  브라우저에서 $BASE/$DIR/ 우상단 버전 스탬프가 되돌린 판으로 보이는지도 함께 본다."
