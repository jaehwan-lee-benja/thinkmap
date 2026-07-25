-- ============================================================================
-- [제안 · crm 소유] 멤버십 키오스크 읽기 RPC 2종 — 팝콘 이력 + 회원 리스트
--   membership 세션이 계약용으로 제시하는 SKETCH. ★crm 이 실제 스키마(컬럼명)로 확정·적용.
--   membership 은 소비자 — 이 파일을 crm DB 에 적용하지 않는다(crm 도메인 마이그).
--   경로: 크로스도메인 → supabase-guardian 검수 + 유저 승인 → crm 이 db-exec 적용 → crm Edge 배포.
--
-- 전제: crm.membership_events 는 이미 존재(0014, 적용됨). 새 테이블 없음 — 읽기 RPC 만 추가.
-- 노출: SECURITY DEFINER, grant execute to service_role only (crm Edge 가 x-api-key 게이트로 호출).
-- 정본: docs/MEMBERSHIP-KIOSK-SPEC.md §3, crm-archive/MEMBERSHIP-KIOSK-CONTRACT.md.
-- ============================================================================

-- ── ① 팝콘 수령 내역 (조회된 회원 한정) ─────────────────────────────────────
-- 반환: [{event_date, claimed_at}] 최신순. 소프트삭제 제외.
create or replace function public.membership_events_list(
  p_member_id uuid,
  p_event_type text default 'popcorn'
)
returns jsonb
language sql
stable
security definer
set search_path = crm, public
as $$
  select coalesce(jsonb_agg(
           jsonb_build_object('event_date', e.event_date, 'claimed_at', e.claimed_at)
           order by e.claimed_at desc
         ), '[]'::jsonb)
  from crm.membership_events e
  where e.member_id = p_member_id
    and e.event_type = p_event_type
    and e.deleted_at is null;
$$;
revoke all on function public.membership_events_list(uuid, text) from public, anon, authenticated;
grant execute on function public.membership_events_list(uuid, text) to service_role;

-- ── ② ★회원 리스트 (직원용 검색) — 전량 PII(이름+전화) ──────────────────────
-- ⚠️ 계약 §5 "목록·부분검색 금지"를 뒤집는 노출면. ★유저 결정 게이트 승인 후에만 배포.
-- ★crm 확정 필요: source='membership' canonical 회원의 이름/전화 컬럼명(customer_sources vs customers).
--   아래는 SKETCH — 실제 컬럼/조인은 crm 이 확정. (전화 정규화·중복 처리 포함.)
create or replace function public.membership_list()
returns jsonb
language sql
stable
security definer
set search_path = crm, public
as $$
  select coalesce(jsonb_agg(
           jsonb_build_object('member_id', c.id, 'name', c.name, 'phone', c.phone)
           order by c.name
         ), '[]'::jsonb)
  from crm.customers c
  where exists (
    select 1 from crm.customer_sources s
    where s.customer_id = c.id and s.source = 'membership'
  );
$$;
revoke all on function public.membership_list() from public, anon, authenticated;
grant execute on function public.membership_list() to service_role;

-- ============================================================================
-- crm 발행 Edge 2종(x-api-key=MEMBERSHIP_KIOSK_KEY, verify_jwt=false):
--   POST /functions/v1/membership-events  {member_id, event_type} → {events:[{event_date,claimed_at}]}
--   POST /functions/v1/membership-list    {}                      → {members:[{member_id,name,phone}]}
-- thinkmap 프록시(membership 소유, 배포=tm통합): membership-history, membership-list
--   (직원게이트 is_master()OR is_store() + 레이트리밋 history:60/list:6 + 감사).
-- ============================================================================
