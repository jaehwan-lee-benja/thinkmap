#!/usr/bin/env bash
# SessionStart 훅 — 읽기 전용 점검.
# 공유 기억 저장소(thinkmap-memory)가 이 worktree 에 symlink 로 연결돼 있는지만 확인하고,
# 미연결이면 안내 문구를 출력한다. 파일 변경·네트워크·git 호출 일절 없음(부수효과 0).
# 연결을 실제로 하는 것은 사용자가 직접 실행하는 scripts/link-memory.sh 다.
set -u

PROJ="${CLAUDE_PROJECT_DIR:-$(pwd)}"
ENC="$(printf '%s' "$PROJ" | sed 's#/#-#g')"
LINK="$HOME/.claude/projects/$ENC/memory"
MEM_REPO="${THINKMAP_MEMORY_DIR:-$HOME/claude-project/thinkmap-memory}"

# 이미 공유 repo 로 연결됐으면 조용히 통과
if [ -L "$LINK" ] && [ "$(readlink "$LINK")" = "$MEM_REPO" ]; then
  exit 0
fi

echo "[공유기억] 이 환경은 공유 기억 저장소에 연결돼 있지 않습니다. 사용자에게 다음을 1회 실행하도록 안내하세요: bash scripts/link-memory.sh"
exit 0
