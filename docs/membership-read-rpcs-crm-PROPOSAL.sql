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

-- ── ② ★회원 검색 (직원용) — 유저결정(161·169): 스토어 열람 허용 + 검색필수 + ★서버측 마스킹 ────
-- ⚠️ 계약 §5 "목록·부분검색 금지" 완화. 승인됨(스토어 열람 + 마스킹 + 레이트리밋/감사, §5.2).
-- ★검색어(p_q) 로 원본(이름/전화) 부분일치 검색 → **마스킹된 매치만** 반환. 전량 덤프 없음(빈 검색=0건).
--   반환 필드 = member_id, name(성만 `김○○`), phone(끝4자리 `010-****-1234`), status. 이메일/주소/이력 미포함.
-- ★crm 확정: 이름/전화 실제 컬럼(customer_sources vs customers)·성 추출·전화 마스킹·상태 라벨.
create or replace function public.membership_search(p_q text)
returns jsonb
language sql
stable
security definer
set search_path = crm, public
as $$
  with hits as (
    select c.id, c.name, c.phone
    from crm.customers c
    where exists (select 1 from crm.customer_sources s
                  where s.customer_id = c.id and s.source = 'membership')
      and length(coalesce(p_q,'')) >= 1
      and ( c.name ilike '%'||p_q||'%'
            or regexp_replace(c.phone,'\D','','g') like '%'||regexp_replace(p_q,'\D','','g')||'%' )
    order by c.name
    limit 50
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'member_id', id,
           -- ★마스킹은 crm 이 확정(아래는 성만+끝4자리 SKETCH):
           'name',   left(name,1) || repeat('○', greatest(char_length(name)-1,0)),
           'phone',  '010-****-' || right(regexp_replace(phone,'\D','','g'),4),
           'status', '멤버십'
         )), '[]'::jsonb)
  from hits;
$$;
revoke all on function public.membership_search(text) from public, anon, authenticated;
grant execute on function public.membership_search(text) to service_role;

-- ============================================================================
-- crm 발행 Edge 2종(x-api-key=MEMBERSHIP_KIOSK_KEY, verify_jwt=false):
--   POST /functions/v1/membership-events  {member_id, event_type} → {events:[{event_date,claimed_at}]}
--   POST /functions/v1/membership-list    {q}                     → {members:[{member_id,name(성만),phone(끝4),status}]}  (검색필수·마스킹)
-- thinkmap 프록시(membership 소유, 배포=tm통합): membership-history, membership-list
--   (직원게이트 is_master()OR is_store() + 레이트리밋 history:60/list:6 + 감사).
-- ============================================================================
