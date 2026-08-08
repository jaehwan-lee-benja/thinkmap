-- ============================================================================
-- 멤버십 — 손님 폰 «감사» 화면용 Realtime 인가 (회수 확정 신호)
--   룸 `membership-ticket` 을 **수신=anon 허용 / 발신=직원(매장·마스터) 세션만** 으로 가른다.
--
-- ★적용 보류(초안). 하드게이트: supabase-guardian → 유저 승인 → thinkmap 통합세션(tm) 적용.
--   대상 DB = thinkmap(sqisntxippjzcekyhqyo). 전제: is_master()/is_store() 존재.
--   ★선행: migrate-membership-realtime-authz.sql (같은 테이블 RLS 활성 전제) — 함께 검수/적용한다.
--   프론트: `VITE_MEMBERSHIP_REALTIME='1'` 로 게이트(이 정책 적용 후에 켠다). 지금은 꺼진 채 배포됨.
-- 정본: docs/MEMBERSHIP-KIOSK-SPEC.md · 코드 useMembershipChannel.js(useTicketRedeemedSignal/useRedeemedBroadcast)
--
-- ── 왜 이런 모양인가 ────────────────────────────────────────────────────────
-- 손님 폰(`?role=ticket`)은 **계정이 없다**(인증 없이 여는 게 그 화면의 존재 이유).
-- 그래서 기존 `membership:<store>` private 채널(=authenticated 전용)을 재사용할 수 없다.
--
-- 그렇다고 **public 채널(private:false)로 두면 인가를 걸 방법이 없어** 아무나 브로드캐스트할 수 있다
--   → 손님 폰에 가짜 «감사합니다»를 띄울 수 있다(원장은 안 바뀌지만 열어둘 이유가 없다).
-- ⇒ private 채널로 두고 **비대칭 정책**을 준다: SELECT(구독·수신)=anon+authenticated,
--   INSERT(브로드캐스트)=authenticated ∧ (is_master() ∨ is_store()).
--
-- ── 이 룸으로 새는 것(설계상 허용 범위) ─────────────────────────────────────
-- payload = { token, stamp:'n/10' } — **이름 없음**(코드에서 의도적으로 뺐다).
--   · token 은 **회수가 끝난 뒤에만** 나간다 ⇒ 이미 소진(1회성·회수는 직원 게이트) ⇒ 재사용 가치 0.
--   · 남는 것은 «방금 어떤 티켓이 소진됐고 그 사람의 도장이 n/10 이다» 뿐. 신원과 결합되지 않는다.
--   ★역으로 «발권 시점»을 이 룸에 쏘면 **미소진 토큰이 새므로 절대 금지**(코드 주석에도 박아 둠).
-- ============================================================================

-- ── ★적용 절차(guardian 2026-08-08 검수 반영) — 순서를 지켜라 ──────────────
-- 이 스크립트는 **정책만** 만든다. `ENABLE ROW LEVEL SECURITY` 를 **일부러 뺐다**:
--   선행 마이그 실측대로 `realtime.messages` 는 supabase_realtime_admin 소유라 MCP 역할로는 ALTER 가 실패하고,
--   그 문장이 같은 트랜잭션에 있으면 **정책 생성까지 통째로 롤백**된다(적용이 막힌다).
--   ▸guardian 정정: 트랜잭션이 원자적이라 «정책은 생기고 RLS 는 꺼진» 부분 커밋은 이 스크립트로는 안 난다.
--     진짜 위험은 그 실패를 «31행만 빼고 수동 실행»으로 우회할 때 **RLS 상태를 그 시점에 재확인하지 않는 것**이다
--     (= 정책이 있는 줄 알았는데 전면 개방). ⇒ 그래서 아래 STEP 0 을 **필수**로 박는다.
--
-- STEP 0-a. RLS 활성 확인 — 결과가 true 여야 진행한다. false 면 여기서 멈추고 SQL Editor(postgres)로 켠 뒤 재확인.
--   SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'realtime' AND c.relname = 'messages';
--
-- STEP 0-b. 컬럼 실재 확인 — `extension` 이 없거나 이름이 다르면 **적용 중단**(아래 정책을 고쳐야 한다).
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='realtime' AND table_name='messages' ORDER BY ordinal_position;
--   ※`realtime.topic()` 은 선행 마이그가 실제로 통과했으므로 존재가 확인된 것으로 본다.
--     반면 `extension` 은 **이 파일이 처음 쓰는 컬럼**이라 이 프로젝트에서 전례가 없다(guardian 지적).
--
-- STEP 0-c. 기존 정책 목록 재확인(충돌 최종).
--   SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
--    WHERE schemaname='realtime' AND tablename='messages';
--
-- STEP 1. 아래 트랜잭션 적용.
-- STEP 2. ★**플래그를 켜기 «전에»** 세션 없는(로그아웃) 브라우저 탭으로 `membership-ticket` 구독이
--         실제로 되는지 확인한다 — 검수에서 «확신 못 함»으로 남은 «anon 정책이 Realtime 에서 평가되는가»는
--         **이 실물 확인이 유일한 실증 경로**다. 안 되면 감사 화면은 조용히 안 뜬다(안전측 실패).
-- STEP 3. `VITE_MEMBERSHIP_REALTIME='1'`. 문제 시 플래그만 끄면 즉시 무력화된다.
-- ============================================================================

BEGIN;

-- ① 수신(구독) — 손님 폰은 세션이 없어 role=anon 으로 붙는다. 그래서 anon 이 필요하다.
--    범위를 **이 룸 하나 · broadcast 확장 하나**로 못 박는다(다른 realtime 사용에 영향 0).
--    ▸guardian 확인: anon 에 걸린 기존 정책은 **하나도 없다** ⇒ 이게 첫 정책이고,
--      topic 이 콜론 없는 리터럴 완전일치라 기존 `'membership:%'` 패턴과 문자열상 절대 겹치지 않는다.
DROP POLICY IF EXISTS membership_ticket_thanks_read ON realtime.messages;
CREATE POLICY membership_ticket_thanks_read ON realtime.messages
  FOR SELECT
  TO anon, authenticated
  USING (
    realtime.topic() = 'membership-ticket'
    AND realtime.messages.extension = 'broadcast'
  );

-- ② 발신(브로드캐스트) — 직원(매장·마스터) 세션만. anon 은 여기 없다 ⇒ 가짜 «감사합니다» 주입 불가.
DROP POLICY IF EXISTS membership_ticket_thanks_write ON realtime.messages;
CREATE POLICY membership_ticket_thanks_write ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    realtime.topic() = 'membership-ticket'
    AND realtime.messages.extension = 'broadcast'
    AND (is_master() OR is_store())
  );

COMMIT;

-- 롤백:
--   DROP POLICY IF EXISTS membership_ticket_thanks_read  ON realtime.messages;
--   DROP POLICY IF EXISTS membership_ticket_thanks_write ON realtime.messages;
--   (프론트는 VITE_MEMBERSHIP_REALTIME 을 끄면 이 룸을 아예 구독하지 않는다 — 즉시 무력화 경로.)

-- ── guardian 검수 결과 요약(2026-08-08) ────────────────────────────────────
-- 판정: **치명(🔴) 없음 · 조건부 적용 가** — 조건 = 위 STEP 0-a/0-b 두 dry-run.
-- 해소된 우려: (3)(4) 기존 접근 확장 없음 — `realtime.messages` 에 정책을 건 파일은 이 둘뿐이고
--   기존 정책은 `TO authenticated` 뿐이라 anon 에는 애초에 아무 정책도 없었다. topic 조건이
--   리터럴 완전일치라 anon 은 이 룸 하나 외에는 SELECT 할 방법이 없다.
--   (6) payload — `pushRedeemed` 는 `redeemTicket` 성공 후에만 호출됨을 호출부에서 확인(코드 정합).
-- 남은 «확신 못 함»: (1) 「세션 없는 supabase-js 가 anon JWT 로 붙어 `TO anon` 이 평가된다」는 전제.
--   공식 문서상 지원 패턴과 일치하나 **이 환경에서 라이브 검증된 적 없음** ⇒ STEP 2 로만 닫힌다.
-- 잔여 리스크(문서화 대상): 이 룸은 **매장 스코프 없는 단일 전역 룸**이라(QR 에 store 가 없다),
--   룸 이름을 아는 쪽은 회수 이벤트의 **빈도·타이밍·도장 분포**를 계속 엿들을 수 있다.
--   PII 는 아니지만 경미한 영업정보다 — SPEC 에 명시했다. 다매장 확장 시 store 스코프화 필요.
