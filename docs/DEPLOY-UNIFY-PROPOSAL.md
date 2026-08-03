# 배포 스크립트 통일 제안 (thinkmap · 2026-08-04)

> 근거 = `docs/REFACTOR-AUDIT-20260804.md` §8·§10(통일 우선순위 1위 = 배포). 이 문서는 **설계 제안**이다.
> ★게이트 불변: 이 문서 자체가 산출물이며, 어떤 실행 파일도 새로 만들지 않는다. 적용은 승인 후 별도 작업.

## 0. 결론 먼저

배포 층은 **3중으로 어긋나 있다** — 문서(README류가 암시하는 것) ≠ package.json에 적힌 것 ≠ 실제로 손으로 하는 것.
이미 사고가 한 번 났다(`f289be2`, 2026-07-11 — CI push마다 위성 5개 하위폴더 wipe). 재발 조건은 **그대로 남아 있다**:
keep_files는 사고를 막았을 뿐, 위성 배포를 사람이 수동으로 하는 근본 구조는 안 바뀌었다.
아래 §3에 오케스트레이션 스크립트 설계안(의사코드)을 낸다 — 단 §4에서 "오케스트레이션이 오히려
한 번에 다 깨뜨리는 도구가 될 위험"을 먼저 다룬다. 이 위험 때문에 **완전 자동화가 아니라
"검증을 자동화하고 실행은 여전히 위성별로 쪼갠" 설계**를 권고한다.

---

## 1. 현행 실태 — 3열 대조

| 층 | 문서/설정이 말하는 것 | 실제로 하는 것 | 작동 여부 |
|---|---|---|---|
| **모선(hub) CI** | `.github/workflows/deploy.yml`: push→`npm run build`→`peaceiris/actions-gh-pages@v4`로 `dist/`를 `gh-pages` 브랜치에 배포 | **문서=실제 일치.** push할 때마다 자동 실행 | ✅ 작동. `keep_files: true`(§2 사고 이후 추가, `f289be2:38-42`)로 위성 하위폴더 보존 |
| **위성 7개 `package.json`** | `"deploy": "gh-pages -d dist -e <이름> --add"` (canvas/crmboard/inventory/members/membership/payroll/seat 7개 동일 템플릿, `-e` 값만 다름) | 실측: `npm run deploy`를 **직접 실행하지 않는다.** 대신 `~/.claude/…/memory/ghpages_http400_manual_deploy.md`에 기록된 **수동 worktree 델타 push** 절차를 씀 | ❌ **`npm run deploy` 자체가 실패한다** — `gh-pages` CLI가 `HTTP 400 (RPC failed; send-pack: unexpected disconnect)`로 죽음. 원인 = shallow-clone 후 사실상 full-tree push인데 `gh-pages` 브랜치가 위성 7개+모선+`--add` 누적 assets로 비대해져 GitHub이 거부. `http.postBuffer`↑·`http.version HTTP/1.1` 둘 다 무효 확인됨(memory 기록) |
| **루트 `package.json`** | `"deploy": "gh-pages -d dist"` (모선용, `-e` 없음) | CI가 대신 하므로 사람이 직접 쓸 일 자체가 없음 | 미검증(존재 자체가 CI와 중복 — 죽은 스크립트 후보) |
| **"위성 통일 배포" 절차** | `docs/SITE-SPLIT-PLAN.md`엔 "위성은 각자 gh-pages(각자 레포/폴더)"라고만 적혀 있고, 전 위성을 한 번에 배포하는 절차는 **문서 어디에도 없음** | `HANDOFF-thinkmap.md` §1에 적힌 수동 5단계(worktree add → rm -rf+cp → commit → push → cleanup)를 **위성마다 사람이 반복** | 이 수동 절차 자체는 작동(델타 push라 소량·성공). 단 **오케스트레이션 부재** — 7위성 전체 배포 시 사람이 7번 반복, 실수 여지 큼 |
| **실제 배포용 device: `gh-pages` npm 패키지** | 위성 7개 package.json에 각자 `gh-pages` devDependency가 있을 것으로 보이나 | 실측: 위성 7개 `package.json` 어디에도 `gh-pages` 항목 없음 — **루트의 `gh-pages@6.3.0` 하나를 npm workspaces가 hoist**해서 전 위성이 공유 | 버전은 단일(6.3.0)이라 드리프트는 없음. 단 **CLI 자체가 고장**이므로 버전 통일이 무의미 |

**측정법**: `.github/workflows/deploy.yml` 전문 열람 / 위성 7개 `package.json` `deploy` 스크립트 grep / `HANDOFF-thinkmap.md:20-25` §1 절차 확인 / memory `ghpages_http400_manual_deploy.md` 확인 / 위성 7개 `package.json`에서 `gh-pages` devDependency 부재 확인(루트에만 존재, workspaces hoist).

**확신도**: 확정(전 항목 실측 교차 확인).

---

## 2. 사고 이력과 재발 조건

### 2-a. 실제 사고 — `f289be2` (2026-07-11)

```
fix(ci): keep_files=true — push마다 CI 자동배포가 위성 하위폴더 wipe하던 것 차단
```

**원인 정확히**: `deploy.yml`은 push마다 **모선 `dist/`만** 빌드하고, `peaceiris/actions-gh-pages@v4`는
**기본값이 대상 브랜치(`gh-pages`)를 통째로 교체**한다. 위성 5개(당시 payroll·inventory·canvas·seat·members)는
이 브랜치의 **하위폴더**로 수동 배포돼 있었으므로, 모선이 push될 때마다(=거의 매번) 위성 폴더가
같이 사라졌다. 수정은 `keep_files: true` 한 줄 추가 — "기존 파일(=위성 하위폴더) 보존"으로 브랜치 교체를 막았다.

### 2-b. 재발 조건 — 지금도 그대로 열려 있다

`keep_files: true`는 **"CI가 위성을 안 건드리게" 막았을 뿐**, 아래 조건은 손대지 않았다:

1. **위성 배포가 여전히 100% 수동**이다. 사람이 worktree 절차 5단계를 위성마다 손으로 반복한다.
   → 어느 단계에서 `rm -rf`의 대상 경로를 잘못 짚으면(예: `<sat>` 대신 상위 디렉토리) **다른 위성이 지워진다**.
   `keep_files`는 "CI push"라는 트리거만 막지, "사람이 잘못된 경로로 delta push"라는 트리거는 못 막는다.
2. **`gh-pages -e --add` 템플릿이 7위성 모두에 그대로 남아 있다.** 누군가 "빠르게 하자"며
   `npm run deploy`를 되살리면(HTTP 400을 모르고, 혹은 브랜치가 다이어트되어 일시적으로 통과하는 경우)
   `--add` 옵션 자체는 안전하지만 **CLI가 내부적으로 하는 clone/push 방식이 다른 위성 폴더를 건드릴
   가능성은 검증된 적이 없다** — 지금은 "실패해서 안 씀"이라 잠재 위험이 노출된 적이 없을 뿐이다.
3. **배포 후 검증이 개인 기억(memory 파일 습관)에만 의존한다.** `git ls-tree origin/gh-pages`로
   "다른 위성 전부 존치" 확인이 절차에 있지만, 이건 **문서·기억에 적힌 습관이지 강제되는 게이트가 아니다.**
   깜빡하면 wipe가 나중에야(다음에 그 위성을 열어볼 때) 발견된다 — 사일런트 실패.
4. **CI와 수동 배포가 같은 브랜치(`gh-pages`)를 공유**한다. CI가 언젠가 `keep_files`를 잃거나
   (예: 워크플로 리팩터 중 실수로 그 줄이 빠짐) 다른 액션으로 교체되면 §2-a가 그대로 재발한다.
   **이 한 줄이 7위성의 유일한 안전장치**라는 게 구조적으로 불안하다.

⇒ **사고이력이 "닫힌 사건"이 아니라 "완화된 증상"이다.** 근본 원인(수동·오케스트레이션 부재)은 그대로.

---

## 3. 제안 — 오케스트레이션 스크립트 설계

### 3-a. 설계 원칙

- **CLI 신뢰 안 함.** `gh-pages` 패키지는 HTTP 400으로 이미 고장 확인됨 → 스크립트는 **memory에 검증된
  수동 worktree 델타 push 절차를 그대로 자동화**한다(새 메커니즘을 발명하지 않는다).
- **위성별 독립 실패.** 7개를 한 커밋/한 push로 묶지 않는다 — 하나가 실패해도 나머지는 배포된 채 남는다.
- **실행 전 검증, 실행 중 확인, 실행 후 대조** 3단계 — 아래 §3-b.
- **dry-run 기본값.** 실제 push는 명시적 플래그로만.

### 3-b. 절차 (의사코드)

```
# scripts/deploy-satellites.sh (설계 초안 — 아직 파일로 만들지 않음)
#
# 사용:
#   ./deploy-satellites.sh --dry-run                 # 전 위성 순회, push 없이 diff만 출력
#   ./deploy-satellites.sh --only=seat,payroll        # 지정 위성만
#   ./deploy-satellites.sh --apply --only=seat        # 실제 push (위성 1개씩만 권장)

SATELLITES = [canvas, crmboard, inventory, members, membership, payroll, seat]
TARGET_SATS = args.only ?? SATELLITES   # 기본 전수, --only로 좁힘

# --- 0단계: 사전 검증 (전수, push 없음) ---
for sat in TARGET_SATS:
  assert apps/<sat>/package.json 존재
  assert apps/<sat>/vite.config.js 의 base == "/thinkmap/<sat>/"   # 이름-base 불일치면 즉시 중단
  cd apps/<sat> && npm run build                                    # 로컬 빌드, 실패 시 그 위성만 스킵+보고
  assert dist/ 존재 ∧ dist/index.html 존재
  dist_hash[sat] = sha256(dist/ 전체 tar)                           # 배포 전 해시 기록

if any 빌드 실패:
  STOP — 실패 위성 목록만 보고, 성공한 것도 아직 push 안 함(전부 검증 통과해야 다음 단계)

# --- 1단계: 원격 상태 스냅샷 (push 없음) ---
git fetch origin gh-pages
git worktree add -f -b ghp-tmp <scratch>/ghp origin/gh-pages
before_tree = git -C <scratch>/ghp ls-tree -r --name-only HEAD
  # 배포 시작 «전» 트리를 기록해둔다 — 사고 시 "무엇이 사라졌는지" 즉시 대조 가능

# --- 2단계: 위성별 개별 처리 (여기서부터 실제 변경) ---
for sat in TARGET_SATS:
  target_dir = <scratch>/ghp/<sat>
  assert target_dir가 <scratch>/ghp/ 바로 하위 1단계인지 검사   # rm -rf 오사고 방지: 경로 정규화 후 접두사 검사
  if not dry_run:
    rm -rf target_dir && mkdir -p target_dir
    cp -R apps/<sat>/dist/. target_dir/
    git -C <scratch>/ghp add -A -- <sat>       # ★그 위성 경로만 stage. 전체 add 금지
    git -C <scratch>/ghp commit -m "deploy: <sat> ($(git rev-parse --short HEAD))"
  else:
    diff = diff -rq apps/<sat>/dist target_dir 2>&1 | 요약
    report[sat] = diff

if dry_run:
  print(report)   # 여기서 종료. push 없음.
  exit

# --- 3단계: 커밋 후 push 전 최종 대조 (아직 되돌릴 수 있는 마지막 지점) ---
after_tree = git -C <scratch>/ghp ls-tree -r --name-only HEAD
other_sats = SATELLITES - TARGET_SATS
for other in other_sats:
  assert (other_tree 안의 other/* 파일 수) unchanged from before_tree
  # 건드리지 않은 위성의 파일 수가 조금이라도 달라지면 = 의도치 않은 삭제 신호 → 즉시 중단, push 안 함

# --- 4단계: push (위성마다 별도 push — 하나의 대형 push로 묶지 않음) ---
for sat in TARGET_SATS (커밋된 순서대로):
  git -C <scratch>/ghp push origin ghp-tmp:gh-pages
  # 실패 시(HTTP 400 재발 등) 그 시점까지 push된 위성은 살아있고, 나머지는 재시도 가능

# --- 5단계: 배포 후 검증 (라이브 대조 — 로컬 트리가 아니라 실제 서버) ---
for sat in SATELLITES (전수, TARGET 밖도 포함):
  http_status[sat] = curl -o /dev/null -s -w '%{http_code}' https://…/thinkmap/<sat>/
  assert http_status[sat] == 200
  # ★TARGET 밖 위성까지 재확인 — "내가 안 건드린 위성이 진짜 안 건드려졌는지"가 wipe 사고의 핵심 질문

git worktree remove --force <scratch>/ghp && git branch -D ghp-tmp && git worktree prune

report:
  - 배포된 위성 / 실패한 위성 / 스킵된 위성
  - dist_hash 대조(로컬 빌드 해시 == 라이브에 실제로 올라간 해시)
  - 전 위성 HTTP 상태 표
```

### 3-c. 이 설계가 §2-b의 재발 조건을 어떻게 막는가

| 재발 조건 | 대응 |
|---|---|
| 손 경로 실수(`rm -rf` 오타) | 경로를 스크립트가 정규화·검증(target_dir가 `<scratch>/ghp/` 바로 하위 1단계인지 assert) — 사람이 매번 손으로 안 침 |
| `--add` CLI 되살림 위험 | 스크립트가 검증된 worktree 델타 절차만 사용, `gh-pages` CLI 자체를 호출 안 함 |
| 배포 후 검증이 습관 의존 | 5단계가 **강제 단계**로 스크립트에 내장(HTTP 200 + 트리 대조), 사람이 기억 안 해도 됨 |
| CI ↔ 수동이 같은 브랜치 공유 | 이 스크립트는 `keep_files`에 의존하지 않는다 — 3단계에서 **자체적으로 다른 위성 파일 수 불변을 확인**하므로 CI 설정이 바뀌어도 이 스크립트가 별도 안전망 |

---

## 4. 위험 분석 — 오케스트레이션 자체가 "한 번에 다 깨뜨리는 도구"가 될 위험

**핵심 우려**: 지금은 사람이 위성마다 따로 손으로 하기 때문에, 실수해도 **그 위성 하나**만 깨진다.
자동화가 잘못 설계되면 **전 위성을 한 스크립트, 한 실행, 한 push로 묶어** 버그 하나가 7개를 동시에 삼킬 수 있다.
`f289be2` 사고 자체가 "자동화(CI)가 손 배포 영역을 침범해서" 난 사고였다는 걸 기억해야 한다 —
오케스트레이션을 잘못 만들면 **같은 형태의 사고를 CI 대신 이 스크립트가 일으키는 셈**이다.

### 4-a. 구체 위험과 방지책

| 위험 | 왜 생기나 | 방지책(§3 설계에 반영됨) |
|---|---|---|
| **전 위성 동시 실패** | 한 worktree·한 커밋에 7위성을 다 넣고 한 번에 push | ★**위성마다 별도 push**(§3-b 4단계). 커밋은 위성별로 나눠도 되지만, **push 단위를 위성 1개로 쪼갠다** — 4번째 위성에서 HTTP 400이 나도 앞 3개는 이미 살아있는 상태로 확정됨 |
| **잘못된 base/이름 매핑으로 위성 뒤바뀜** | `-e` 값과 실제 디렉토리 이름이 어긋나면 다른 위성 경로에 엉뚱한 빌드가 덮임 | §3-b 0단계에서 **이름↔`vite.config.js` base 일치를 push 전에 assert** — 어긋나면 그 위성만 스킵, 나머지는 진행 |
| **`rm -rf` 스코프 오류가 전체를 지움** | 스크립트 버그로 대상 경로가 `<scratch>/ghp/` 자체를 가리키면 전 위성 삭제 | §3-b 2단계에서 **경로가 정확히 1단계 하위인지 assert 후에만 rm** + §3-b 3단계에서 **건드리지 않은 위성의 파일 수 불변을 push 전에 재확인**(이중 방어) |
| **자동화라 안 보고 넘어감(사람이 결과를 안 봄)** | "스크립트가 알아서 했겠지"로 배포 후 확인을 생략 | §3-b 5단계 **HTTP 상태 + 해시 대조를 표로 강제 출력**, 이게 없으면 "완료"로 취급하지 않는 절차 규율 |
| **dry-run을 건너뛰고 바로 --apply** | 급할 때 검증 단계를 생략하고 싶은 유혹 | ★**`--apply` 없이는 절대 push 안 함을 기본값으로**(§3-b 사용법) — dry-run이 디폴트, apply는 명시적 옵트인 |
| **전 위성을 한 번에 `--only` 없이 돌림** | "한 번에 다 하자"가 사고 반경을 키움 | 운영 규율로 권고: **첫 실행은 항상 위성 1개(`--only=<sat>`)로**, 안정화된 뒤에만 다중 위성 배치. 스크립트가 이걸 강제하진 않지만 §3-b 사용 예시 순서(단일→다중)로 유도 |
| **롤백 경로 부재** | push 후 잘못을 발견해도 되돌릴 절차가 없으면 다음 사고까지 방치됨 | 이 설계는 매 push가 **그 위성 폴더 전체 교체**이므로, 롤백 = **직전 라이브 dist를 별도 보관해뒀다가 같은 절차로 재배포**. §3-b에 아직 없음 — ★**추가 제안**: 2단계에서 교체 전 `target_dir`을 `<scratch>/rollback/<sat>-<timestamp>/`로 백업한 뒤 교체(비용 낮음, 다음 개선 시 반영 권고) |

### 4-b. 권고 — 완전 자동화보다 "검증 자동화 + 실행 반자동"

7위성을 무인으로 순회하며 전부 push까지 하는 **완전 자동화는 지금 단계에서 권고하지 않는다.**
이유: 검증(0·1·3·5단계)은 사고 예방 가치가 크고 반복적이라 자동화 이득이 확실하지만,
**실제 push(4단계)는 사람이 위성 단위로 확인하고 진행하는 편이 사고 반경을 계속 작게 유지한다.**
⇒ 스크립트는 **"7위성 전수 검증 + dry-run 리포트"까지는 무인**, **`--apply`는 위성 지정 + 사람이 트리거**하는
반자동을 1차 목표로 잡는다. 완전 무인 다중위성 배치는 이 반자동 버전이 몇 차례 사고 없이 돌고 난 뒤
재검토한다.

---

## 5. 남는 질문(승인 필요 사항 — 이 문서에서 결정하지 않음)

1. 이 스크립트를 실제 파일(`scripts/deploy-satellites.sh`)로 만들지, 만든다면 위험 4-a 표의
   롤백 백업 단계까지 1차 버전에 넣을지.
2. 루트 `package.json`의 `"deploy": "gh-pages -d dist"`(모선용, CI와 중복)와 위성 7개의
   `"deploy": "gh-pages -d dist -e <이름> --add"`(고장난 CLI 호출) — **죽은/오해를 부르는 스크립트로
   package.json에서 제거할지**, 아니면 "쓰지 마시오" 주석만 남길지.
3. `HANDOFF-thinkmap.md` §1의 수동 절차 기록을 이 문서로 대체·링크할지(문서 중복 방지).
