-- ══════════════════════════════════════════════════════════════════════════
-- 자리후(seat) — raise_canceled 컬럼 추가 : "올리기 전달 세부 보기 / 올림취소됨"
-- ══════════════════════════════════════════════════════════════════════════
-- 목적: '올리기 전달 세부 보기'(역할별 기능 설정)에서 올림을 푼 뒤 세부설명에
--       '올림취소됨(방식)'을 표시하기 위한 흔적 + 다시 올림 활성 단서.
--       올리기 전달을 풀면 한 스텝만 되돌리는데(raised=false + 제조옵션 해제 등),
--       그 결과 '안 올린 행'과 구분할 단서·방식 정보가 사라진다 → 이 컬럼에 취소 당시 방식을 남긴다.
--
-- ★text 컬럼(nullable). 값 = 취소 당시 올림 방식:
--     'takeout'(포장) | 'outdoor'(야외) | 'parallel'(야외병행) | 'direct'(직접체크)
--   NULL = 취소 이력 없음.
--
-- 앱 로직(utils/seatRules):
--   raiseDetailText: raise_canceled 있으면 '올림취소됨(포장/야외/…)' (최우선). 없으면 raised 경로 표시.
--   isRaiseEnabled: raise_canceled 있으면(=한 번 올렸다 푼 것) 올리기 체크박스 다시 활성.
--   · 올림 체크(직접/제조옵션) 시 raise_canceled=NULL 로 리셋.
--
-- ★안전성:
--   - 엄격히 additive: 신규 text, nullable, DEFAULT 없음(=NULL). 기존 컬럼/CHECK/트리거/
--     인덱스/시퀀스 무변경 → 기존 앱 로직·쿼리 회귀 0. (값 도메인 CHECK 없음 — 앱이 4값만 씀.)
--   - seat_status CHECK('pending','raised','canceled') 는 건드리지 않는다
--     (취소 시 seat_status='pending' 유지 — 자리후 대기로 복귀. '올림취소됨'은 이 컬럼으로만 표현).
--   - RLS 무변경: seat_orders_rw 는 행 단위(can_in_workspace(workspace_id,'editor')) →
--     컬럼 추가에 정책 수정 불필요(컬럼 단위 GRANT 없음, 테이블 RLS가 새 컬럼 자동 포함).
--   - Realtime 무변경: seat_orders 는 REPLICA IDENTITY FULL + publication 등록 →
--     새 컬럼이 payload 에 자동 포함.
--   - updated_at 트리거가 UPDATE 시 자동 갱신(무변경).
--   - 재실행 안전: ADD COLUMN IF NOT EXISTS.
--
-- 적용: supabase-guardian 검수 → 유저 승인 후 → thinkmap 통합세션이 적용(tmseat 직접적용 금지).
--       ★앱 배포는 이 마이그 적용 이후여야 함(컬럼 부재 시 { raise_canceled: ... } UPDATE 가
--        PGRST 컬럼오류 → 저장실패 토스트). 마이그 먼저, 그 다음 seat 위성 재배포.
--       백필 불필요(기본 NULL = 취소이력 없음, 정상).
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE seat_orders
  ADD COLUMN IF NOT EXISTS raise_canceled text;

COMMENT ON COLUMN seat_orders.raise_canceled IS
  '올리기 전달을 푼 흔적 + 방식. takeout/outdoor/parallel/direct 중 하나면 ''올림취소됨(방식)'' 표시, NULL 이면 이력 없음. 다시 올림 시 NULL 로 리셋.';
