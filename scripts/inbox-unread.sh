#!/bin/bash
# 인박스 «미처리» 계수 — ★내 옛 계수기가 3건을 못 봤다(2026-08-17).
#
# 옛 방식: `grep -c '^## \['` — 이건 «## [» 로 시작하는 것만 센다. 그런데 실제 함에는
#   `## ⏳(진행중) [FROM …]` 처럼 **표식이 붙은 헤더**가 있었고, 그건 미처리인데도 **안 세어졌다.**
#   「형식 이탈은 보기 나쁨이 아니라 집계 누락이다」가 내 계수기에 그대로 걸린 실물이다.
#
# 새 방식: **«## ✅» 로 시작하지 않는 모든 «## » 헤더**를 미처리로 센다.
#   ★«무엇을 세는가»가 아니라 «무엇이 처리된 표식인가»를 기준으로 뒤집었다 —
#   앞으로 어떤 새 표식이 생겨도(⏳·🔴·⚠) 자동으로 «미처리»에 들어온다. 열거는 반드시 뒤처진다.
set -uo pipefail
F="${1:-$HOME/claude-project/msg/to-thinkmap.md}"
[ -f "$F" ] || { echo "★없는 파일: $F"; exit 2; }
python3 - "$F" <<'PY'
import sys
p=sys.argv[1]
b=open(p,'rb').read().decode('utf-8',errors='replace')
# ★코드블록(```) 안의 «예시 헤더»는 세지 않는다 — 2026-08-17 실측: 규칙 문서의 예시 2줄을
#   미처리로 세서 «미처리 3» 이라고 말했다(진짜는 1). «시끄럽다 ≠ 더럽다» 를 내 계수기가 냈다.
heads=[]; fenced=False
for l in b.split('\n'):
    if l.lstrip().startswith('```'): fenced = not fenced; continue
    if not fenced and l.startswith('## '): heads.append(l)
un=[l for l in heads if not l.startswith('## ✅')]
print(f"  총 {len(heads)}블록 · 미처리 {len(un)}")
for l in un: print("   ○ "+l[:120])
PY
