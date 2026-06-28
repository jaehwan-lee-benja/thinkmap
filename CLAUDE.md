# ThinkMap 개발 규칙

## 대화 언어

- 사용자와의 모든 대화·설명·진행 보고는 **한글**로 한다. (코드/주석은 기존 컨벤션 유지)

## 필수 확인 문서

토글/블록 관련 코드를 수정하기 전에 반드시 아래 문서를 읽을 것:
- [docs/TOGGLE-BLOCK-SPEC.md](docs/TOGGLE-BLOCK-SPEC.md) — 토글 블록 기능 명세서 (스키마, 키보드, 복붙, 드래그, 수정 원칙, 체크리스트)

캘린더 관련 코드를 수정하기 전에 반드시 아래 문서를 읽을 것:
- [docs/CALENDAR-SPEC.md](docs/CALENDAR-SPEC.md) — ★캘린더 플랫폼 명세서 (shell + 레이어 + 뷰 계약, 레이어별 접근권한, 통합 구조). 캘린더에 새 데이터(데일리/날씨/매출 등)를 얹거나 shell·레이어·뷰를 손대면 이걸 따른다. SCHEDULE-SPEC을 ScheduleLayer 하위 명세로 품는 상위 문서.
- [docs/SCHEDULE-SPEC.md](docs/SCHEDULE-SPEC.md) — 시간박스 레이어(ScheduleLayer) 상세 명세 (schedule_events 데이터 모델, 계정/공유, 시간박스 인터랙션, 루틴, 링크, Google 동기, RLS, 체크리스트)

통합 대시보드 / 목표(goals) 관련 코드를 수정하기 전에 반드시 아래 문서를 읽을 것:
- [docs/DASHBOARD-SPEC.md](docs/DASHBOARD-SPEC.md) — 대시보드 명세서 (집계 원칙, goals 데이터 모델, 진행률 계산 규칙, RLS, Phase 로드맵, 수정 원칙, 체크리스트)

권한/RLS(마스터/멤버/linked, 정책, 새 page_type 진입) 관련 코드·마이그레이션을 만들거나 고치기 전에 반드시 아래 문서를 읽을 것:
- [docs/ACCESS-TIERS-SPEC.md](docs/ACCESS-TIERS-SPEC.md) — ★현행 권한 모델(노드×능력 grant + can(), 수렴 결과). 신규 기능 RLS는 이걸 따른다: 워크스페이스 자산은 `can_in_workspace(current_workspace(), 'viewer'|'editor'|'owner')`. Phase A 토대 프로덕션 적용됨.
- [docs/ACCESS-TIERS-MIGRATION-PLAN.md](docs/ACCESS-TIERS-MIGRATION-PLAN.md) — Phase A→C 이관 계획(C는 대기, 단계마다 supabase-guardian→승인→통합 세션 적용). 백로그 B-6.
- [docs/ACCESS-MODEL.md](docs/ACCESS-MODEL.md) — 접근/권한 모델 총괄·배경(권한 주체, RLS 헬퍼 인벤토리, 3 패러다임 지도, 단일 access 헬퍼 수렴 방향). ※구모델 언어 일부는 ACCESS-TIERS로 수렴 중.

멤버(직원 인사 마스터)/배치도(날짜별 근무 배치, 급여 매칭) 관련 코드를 수정하기 전에 반드시 아래 문서를 읽을 것:
- [docs/MEMBER-SPEC.md](docs/MEMBER-SPEC.md) — 멤버 & 배치도 명세서 (데이터 모델, 권한/RLS, 진입점, 급여 매칭, 근무 요청 허브, Phase 로드맵, 체크리스트)

자리후 시스템(seat — 카페 주방 자리후·올리기 실시간 협업) 관련 코드를 수정하기 전에 반드시 아래 문서를 읽을 것:
- [docs/SEAT-SPEC.md](docs/SEAT-SPEC.md) — 자리후 시스템 명세서 (4역할 모델, seat_orders·seat_station_status 데이터 모델, 워크스페이스 grant(can_in_workspace) 테넌시·RLS, Realtime 동기화, 규칙 R1~R7, 카메라 슬롯, Phase 로드맵, 체크리스트)

## 디자인 / UI 작업

UI·스타일을 만들거나 다듬기 전에 아래 기준을 따른다:
- [docs/DESIGN-PHILOSOPHY.md](docs/DESIGN-PHILOSOPHY.md) — 건조한 스타일(폰트 크기 계층 X, 장식선 X, bold·들여쓰기·기능적 레이아웃만).
- [docs/MOBILE-DESIGN.md](docs/MOBILE-DESIGN.md) — mobile-first, 기능=데스크톱 동등, 가로 스크롤 X, 터치 타겟 ≥36px, 입력 폰트 ≥16px, 360/768/1024/1440 검증.

### frontend-design 플러그인 사용 규칙
이 프로젝트는 공식 플러그인 `frontend-design@claude-plugins-official`을 디자인 보조로 쓴다(`.claude/settings.json`의 `enabledPlugins`에 선언 — repo 클론 시 자동 설치/활성).
- **사용 가능 스킬 목록에 `frontend-design`이 없으면 = 이 컴퓨터에 미설치.** 디자인/UI 작업을 시작하기 전에 사용자에게 "`/plugin` Discover 탭에서 frontend-design 설치 필요(Project scope)"를 **먼저 안내**한다.
- **내부 앱 화면**(daily·roster·schedule·dashboard 등): 건조한 스타일이 곧 브리프다. frontend-design을 쓰더라도 **타이포/팔레트/시그니처에 대담함을 쓰지 말고**, 그 도구의 *절제·자기비평·품질 바닥선(반응형·키보드 포커스·reduced-motion)·카피라이팅* 가이드만 끌어온다. "미적 모험 = 장식의 부재".
- **공개/마케팅/랜딩 화면**: frontend-design 풀가동(팔레트·타입·시그니처 재량). 단 별도 브랜드 브리프로.

## 커밋/배포

- 커밋, 푸시, 릴리즈는 사용자가 명시적으로 요청할 때만 수행
