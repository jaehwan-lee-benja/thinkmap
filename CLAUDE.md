# ThinkMap 개발 규칙

## 대화 언어

- 사용자와의 모든 대화·설명·진행 보고는 **한글**로 한다. (코드/주석은 기존 컨벤션 유지)

## 필수 확인 문서

토글/블록 관련 코드를 수정하기 전에 반드시 아래 문서를 읽을 것:
- [docs/TOGGLE-BLOCK-SPEC.md](docs/TOGGLE-BLOCK-SPEC.md) — 토글 블록 기능 명세서 (스키마, 키보드, 복붙, 드래그, 수정 원칙, 체크리스트)

캘린더(schedule_events, 시간박스, 루틴, Google 동기) 관련 코드를 수정하기 전에 반드시 아래 문서를 읽을 것:
- [docs/SCHEDULE-SPEC.md](docs/SCHEDULE-SPEC.md) — 캘린더 기능 명세서 (핵심 원칙, 데이터 모델, 계정/공유, 뷰/인터랙션, RLS, Phase 로드맵, 수정 원칙, 체크리스트)

통합 대시보드 / 목표(goals) 관련 코드를 수정하기 전에 반드시 아래 문서를 읽을 것:
- [docs/DASHBOARD-SPEC.md](docs/DASHBOARD-SPEC.md) — 대시보드 명세서 (집계 원칙, goals 데이터 모델, 진행률 계산 규칙, RLS, Phase 로드맵, 수정 원칙, 체크리스트)

권한/RLS(마스터/멤버/linked, 정책, 새 page_type 진입) 관련 코드·마이그레이션을 만들거나 고치기 전에 반드시 아래 문서를 읽을 것:
- [docs/ACCESS-MODEL.md](docs/ACCESS-MODEL.md) — 접근/권한 모델 총괄 (권한 주체, RLS 헬퍼 인벤토리, 3 패러다임 지도, 단일 access 헬퍼 수렴 방향, 신규 도메인 원칙, 멤버십=L1 테넌시 선행, 예외/정정)

멤버(직원 인사 마스터)/배치도(날짜별 근무 배치, 급여 매칭) 관련 코드를 수정하기 전에 반드시 아래 문서를 읽을 것:
- [docs/MEMBER-SPEC.md](docs/MEMBER-SPEC.md) — 멤버 & 배치도 명세서 (데이터 모델, 권한/RLS, 진입점, 급여 매칭, 근무 요청 허브, Phase 로드맵, 체크리스트)

## 커밋/배포

- 커밋, 푸시, 릴리즈는 사용자가 명시적으로 요청할 때만 수행
