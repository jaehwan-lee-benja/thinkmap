#!/bin/bash
# 수신자 쪽 «전달 누락» 술어 — 발신자 의존 규범의 침묵을 가른다.
#
# ★왜 만들었나(실물): 2026-08-16, 유저 확정 사양 「응원화면 좌우 2단」이 **내 인박스에 안 왔다.**
#   나는 세로 1단으로 만들어 배포했고, 하루 뒤 유저가 적발했다.
#   ★문제의 구조: **발신자 의존 규범에서 «침묵»은 «사양 없음»과 «통지 없음» 둘 다와 양립한다.**
#   수신자가 스스로 재는 술어가 없으면 그 둘을 **원리적으로** 구별할 수 없다. 그래서 이걸 만든다.
#
# 무엇을 하나: 공용 채널(to-orch·to-conductor)에서 **내 도메인 주제어**를 담은 블록을 찾고,
#   그 블록의 «주제»가 내 인박스(to-thinkmap)에 **한 번도 안 나타났으면** 후보로 올린다.
#
# ★한계를 먼저 적는다(이게 없으면 이 도구가 또 «조용하다 = 깨끗하다»가 된다):
#   · 키워드 휴리스틱이다. **증명이 아니라 «볼 곳» 목록**이다.
#   · 반대로 «시끄럽다 ≠ 더럽다» — 여기 뜬 것이 전부 누락은 아니다(내가 다른 경로로 이미 알 수 있다).
#   · 결론은 사람이 낸다. 도구의 빨간불도 판정이 아니라 재료다.
#
# 쓰기: bash scripts/check-spec-delivery.sh [days]     (기본 3일)
set -uo pipefail
DAYS="${1:-3}"
MSG="$HOME/claude-project/msg"

python3 - "$MSG" "$DAYS" <<'PY'
import re, sys, os, datetime

msg, days = sys.argv[1], int(sys.argv[2])

# 내 도메인 주제어 — 여기 없는 주제는 이 술어가 못 본다(한계를 이름으로 남긴다)
TOPICS = ['응원화면','응원 화면','display','키오스크','멤버십','지출','expense','자리후','seat',
          '데일리','daily','캘린더','spend','taxonomy','위성','배포']
# «확정 사양»의 냄새 — 그냥 언급이 아니라 «이렇게 하라»는 말
DECIDE = ['확정','유저 지시','사양','발주','정본','결정','바꿔','교체','고정']

def blocks(path):
    if not os.path.exists(path): return []
    raw = open(path,'rb').read().decode('utf-8', errors='replace')
    out = []
    for b in re.split(r'(?m)^## ', raw)[1:]:
        head = b.split('\n')[0]
        m = re.search(r'(\d{4}-\d{2}-\d{2})', head)
        out.append({'head': head, 'body': b, 'date': m.group(1) if m else ''})
    return out

inbox = blocks(f'{msg}/to-thinkmap.md')
inbox_text = '\n'.join(b['body'] for b in inbox)

cutoff = (datetime.date.today() - datetime.timedelta(days=days)).isoformat()

cands = []
for ch in ('to-orch.md','to-conductor.md'):
    for b in blocks(f'{msg}/{ch}'):
        if b['date'] and b['date'] < cutoff: continue
        if re.match(r'(✅ )?\[FROM thinkmap', b['head']): continue      # 내가 쓴 건 제외
        h = b['head']
        if not any(t in h for t in TOPICS): continue
        if not any(d in h for d in DECIDE): continue
        # 주제의 «특징 낱말»이 내 인박스에 한 번이라도 나타났나
        subj = re.sub(r'.*주제[:·]\s*', '', h).split('·')[0]
        keys = [w for w in re.findall(r'[가-힣A-Za-z]{3,}', subj) if w not in ('주제','발주','확정')][:4]
        if keys and not any(k in inbox_text for k in keys):
            cands.append((ch, b['date'], h[:110], keys))

print(f"  대상 기간: 최근 {days}일(>= {cutoff})")
if not cands:
    print("  ✅ 공용 채널에만 있고 내 인박스엔 없는 «확정 사양» 후보 0건")
    print("     ※ 0건은 «누락 없음»의 증명이 아니다 — 주제어 목록 밖은 이 술어가 못 본다.")
else:
    print(f"  ★후보 {len(cands)}건 — «내 인박스에 안 온» 확정 사양일 수 있다(판정은 사람이):")
    for ch, d, h, keys in cands:
        print(f"    · [{ch} {d}] {h}")
        print(f"        찾은 낱말: {', '.join(keys)} → 인박스에 0회")
PY
