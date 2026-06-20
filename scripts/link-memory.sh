#!/usr/bin/env bash
# ThinkMap 공유 기억 저장소 연결 스크립트.
#
# Claude Code 의 기억은 ~/.claude/projects/<encoded>/memory/ 에 저장되는데
# 이 경로는 PC·worktree 마다 따로이고 git 밖이라 공유가 안 된다.
# private repo(thinkmap-memory)를 단일 원본으로 두고, 현재 worktree 의
# memory 경로를 거기로 symlink 해서 PC 간·worktree 간 기억을 동기한다.
#
# 새 PC 또는 새 worktree 에서 한 번 실행:  bash scripts/link-memory.sh
set -euo pipefail

MEM_REPO="${THINKMAP_MEMORY_DIR:-$HOME/claude-project/thinkmap-memory}"
MEM_URL="https://github.com/jaehwan-lee-benja/thinkmap-memory.git"

# 1) 공유 repo 가 없으면 클론, 있으면 최신화
if [ -d "$MEM_REPO/.git" ]; then
  echo "기존 기억 repo 최신화: $MEM_REPO"
  git -C "$MEM_REPO" pull --ff-only || echo "  (pull 실패 — 수동 확인 필요)"
else
  echo "기억 repo 클론: $MEM_REPO"
  git clone "$MEM_URL" "$MEM_REPO"
fi

# 2) 현재 worktree 의 Claude memory 경로 계산 (절대경로의 / 를 - 로 인코딩)
PROJ="$(pwd)"
ENC="$(printf '%s' "$PROJ" | sed 's#/#-#g')"
LINK="$HOME/.claude/projects/$ENC/memory"
mkdir -p "$(dirname "$LINK")"

# 3) 실제 폴더가 이미 있으면(로컬 기억) 백업 후 교체, 그 외엔 symlink 갱신
if [ -e "$LINK" ] && [ ! -L "$LINK" ]; then
  BK="$LINK.bak.$(date +%s)"
  echo "기존 로컬 memory 백업: $BK"
  mv "$LINK" "$BK"
fi
ln -sfn "$MEM_REPO" "$LINK"
echo "연결 완료: $LINK -> $MEM_REPO"
