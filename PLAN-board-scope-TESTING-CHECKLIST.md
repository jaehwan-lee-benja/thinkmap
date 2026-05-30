# 보드-스코프 마이그레이션 테스트 체크리스트

> 작성: 2026-05-30 · 상태: **미실행 — 다음 작업 세션에서 반드시 확인**
> 관련: [PLAN-board-scope-sections.md](PLAN-board-scope-sections.md)
> 발단: 2026-05-30 마이그레이션 STEP 0~4 + 코드 변경 완료, 로컬 검증 미진행 상태로 보류.

---

## 현재 상태 (테스트 전)

- 마이그레이션 STEP 0~4 (백업 / 스키마 / 멤버 시드 / 섹션 이전 / section_order 이전) — **prod 적용 완료**
- 코드 변경 (`createDailyPageV2.js`, `DailyPageV2.jsx`, `useWorklogUserSettings.js`, `TipTapTestPage.jsx`, `worklogTemplateV2.js`) — **로컬에만 있고 커밋·배포 안 됨**
- 빌드는 통과 (`npm run build` 성공)
- 로컬 테스트는 미실행 — 이 문서가 그 작업 목록

---

## 0. 사전 준비

- [ ] `cd ~/claude-project-pro2017/thinkmap && npm run dev` 로 dev 서버 실행 (http://localhost:5173/thinkmap/)
- [ ] 브라우저 콘솔 열고 에러 모니터링 (`Cmd+Option+J`)
- [ ] DB 검증: `migrate-board-scope-sections.sql` STEP 5 의 검증 6개 다시 한 번 통과 확인 (마이그 후 시간이 지났으니 sanity)

---

## 1. 핵심 시나리오 — 보드-스코프 동작 확인 (★최우선)

### 1-1. designerbenja 의 신규 daily 생성

- [ ] designerbenja@gmail.com 로 로그인
- [ ] 캘린더 (보드 `0fcc0fee-9467-49f5-a5c2-5b9952964351`) 에서 **새 daily 페이지** 생성 (오늘 날짜)
- [ ] **기대**: 글로벌 고정 4개 + designerbenja 의 자유 섹션 18개 (= 총 22 섹션 카드) 등장
- [ ] 섹션 순서가 자기가 정렬했던 대로 (worklog_board_user_settings.section_order 적용) 나오는지
- [ ] DB 확인: 그 페이지 daily_blocks 에 22 개의 `block_type='section'` row INSERT 됐는지

### 1-2. kbl0226 의 신규 daily 생성 — **5/28 사고가 재현 안 되는지 확인**

- [ ] kbl0226@gmail.com 로 로그인 (또는 designerbenja 가 임퍼소네이션)
- [ ] 같은 보드에서 **5/30 새 daily 페이지** 생성 (designerbenja 가 이미 만든 날이면 다른 미생성 날짜)
- [ ] **기대**: designerbenja 와 **동일한** 22 개 섹션 카드 (= 보드 공유 동작)
- [ ] **이게 통과해야 마이그가 의미 있음.** 4 개만 나오면 보드 매핑 실패 — 즉시 디버깅
- [ ] carry-over 토글들이 새 페이지의 section_id 와 정상 매칭되는지 (고아 토글 없는지)

### 1-3. 같은 보드의 두 마스터 — 섹션 공유

- [ ] designerbenja 로 자유 섹션 1 개 새로 추가 (예: "테스트섹션-0530")
- [ ] DB: `worklog_sections` 에 `scope='board', board_id='0fcc0fee...'` 로 INSERT 됐는지
- [ ] kbl0226 으로 페이지 열어보면 그 섹션이 보이는지 (refresh 버튼 누른 뒤)
- [ ] 그 자유 섹션 삭제 → 다음 daily 에 안 나오는지

---

## 2. carry-over 정합성

### 2-1. 같은 보드 안 carry-over

- [ ] designerbenja 의 5/26 페이지에 미완료 todo 추가
- [ ] kbl0226 으로 5/30 새 daily 생성 → designerbenja 의 미완료가 정상으로 이월되는지
- [ ] 이월된 토글의 section_id 가 새 페이지의 섹션 row 와 매칭되는지 (고아 0)

### 2-2. handleRefreshCarryOver (DailyPageV2.jsx)

- [ ] 기존 daily 페이지에서 새로고침 버튼 → 직전 페이지의 신규 자유 섹션이 자동 추가되는지
- [ ] DB: `worklog_sections.scope='board'` + `board_id=parentId` 조건으로 조회되는 게 맞는지 (network 탭에서 쿼리 확인)

---

## 3. section_order (정렬) 유지

### 3-1. 드래그로 섹션 순서 변경

- [ ] designerbenja 로 섹션 카드 드래그 → 순서 바뀜
- [ ] DB: `worklog_board_user_settings` 의 designerbenja+0fcc0fee row 의 `section_order` 가 새 순서로 upsert
- [ ] 다음 날 daily 생성 → 그 순서 그대로 나오는지

### 3-2. kbl0226 자신만의 정렬

- [ ] kbl0226 로 자기 순서로 다시 드래그 → designerbenja 정렬에 영향 없는지 (두 user 의 row 분리 유지)

---

## 4. QuickTodo (user-global) 분리 확인

- [ ] designerbenja 의 QuickTodo 에 고정 섹션 설정
- [ ] DB: `worklog_user_settings.quicktodo_pinned` 에 저장되는지 (worklog_board_user_settings 가 아니라)
- [ ] 보드를 바꿔도 (다른 캘린더가 있다면) quicktodo_pinned 가 동일한지

---

## 5. 임퍼소네이션

- [ ] designerbenja 로 로그인 후 kbl0226 으로 임퍼소네이션
- [ ] kbl0226 으로 새 daily 페이지 만들기 → designerbenja-as-kbl0226 로 owner 저장되지만 섹션은 보드 기준으로 동일하게 나오는지
- [ ] 임퍼소네이션 해제 후 designerbenja 본인으로 봐도 그 페이지 정상으로 보이는지

---

## 6. RLS / 권한

- [ ] kbl0226 로 SQL 호출 (Supabase 클라이언트 또는 콘솔): `worklog_board_members` 자기 row 만 보이는지
- [ ] kbl0226 (보드 master) 가 `worklog_sections` 에 board-scope row INSERT 가능한지
- [ ] (보드 멤버 아닌 다른 사용자가 있다면) 그 사용자는 보드의 섹션 못 보는지 확인

---

## 7. 회귀 — 기존 동작이 깨지지 않았는지

- [ ] 일반 페이지(non-daily) 작성 / 수정 / 삭제 — 영향 없는지
- [ ] 캘린더 뷰 (월간/주간) — 정상
- [ ] 사이드바 트리 — 정상
- [ ] 토글 안 todo 체크 / 이동 / 드래그 — 정상
- [ ] 마스터 visibility 토글 (왕관) — 정상

---

## 8. 테스트 통과 후 — 후속 작업

### 8-1. 커밋 + 푸시 + 배포

```bash
cd ~/claude-project-pro2017/thinkmap
git add src/utils/createDailyPageV2.js src/utils/worklogTemplateV2.js \
        src/components/TipTapEditor/DailyPageV2.jsx \
        src/components/TipTapEditor/TipTapTestPage.jsx \
        src/hooks/useWorklogUserSettings.js \
        PLAN-board-scope-TESTING-CHECKLIST.md \
        migrate-step0-backup.sql migrate-step1-schema.sql migrate-step1-verify.sql \
        migrate-step2-members.sql migrate-step3-sections.sql migrate-step4-section-order.sql \
        diagnose-orphan-section-masters.sql
git commit -m "feat(daily): worklog_sections 보드-스코프 전환 + 마이그 SQL"
git push origin main
npm run deploy   # gh-pages 배포
```

### 8-2. STEP 6 정리 (며칠 운영 안정 확인 후)

`migrate-board-scope-sections.sql` 의 STEP 6 블록 (현재 주석 처리). 실행 전제:
- 코드 배포 + 며칠 운영에서 신규 daily 생성 정상 확인
- `SELECT COUNT(*) FROM worklog_sections WHERE scope='user' AND deleted_at IS NULL` = 0 재확인

내용:
- `worklog_sections.scope` CHECK 에서 `'user'` 제거 (`'global','board'` 만)
- 구 `worklog_user_settings` 의 `section_order` 컬럼 drop (또는 테이블 전체 — quicktodo_pinned 가 거기 있으므로 컬럼만 drop 권장)

> ⚠️ 메모: 원 기획에선 `worklog_user_settings` 통째 drop 이라 적혀 있었으나, 실제 마이그 진행 중 `quicktodo_pinned` 가 그 테이블에 남아야 하는 user-global 데이터로 확인됨. **테이블은 유지하고 `section_order` 컬럼만 drop** 으로 변경 필요. PLAN-board-scope-sections.md §7 Phase 3 도 같이 수정.

### 8-3. 스펙 문서 갱신

- [ ] `docs/WORKLOG-SPEC.md` §3.2.3 / §2 "v1 현황" 등에서 user-scope 설명을 board-scope 으로 갱신
- [ ] `PLAN-board-scope-sections.md` §10 변경 이력에 "2026-05-30 STEP 0~4 완료 + 코드 변경 완료, 로컬 테스트 보류" 추가

---

## 빠른 회복 시나리오 (테스트 중 망가졌을 때)

| 증상 | 원인 후보 | 응급 조치 |
|---|---|---|
| 새 daily 가 4개 섹션만 나옴 | createDailyPageV2 의 board-scope 쿼리가 빈 결과 | DB 에서 `worklog_sections WHERE scope='board' AND board_id='0fcc0fee...'` 살아있나 확인 |
| 새 daily 생성 시 에러 | board_id NULL 인 곳에 INSERT 시도 | `parentId` prop 이 페이지 컴포넌트에 전달되는지 확인 |
| QuickTodo 의 고정 섹션이 사라짐 | useWorklogUserSettings 가 worklog_user_settings 의 quicktodo_pinned 조회 실패 | 그 테이블 그대로 살아있는지 확인. RLS 정책 변경 안 됐는지 |
| 섹션 드래그 후 reload 시 순서 안 유지 | upsert 가 worklog_board_user_settings 에 못 들어감 | 네트워크 탭에서 그 PATCH 확인. RLS / 키 충돌 확인 |
| **롤백 필요한 큰 사고 시** | — | backup 테이블 (`*_backup_2026_05_29`) 에서 복원 + 코드 revert |
