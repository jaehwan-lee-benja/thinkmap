-- 요일별 "인원배치 버전" — 이름붙은 여러 버전 + 별표(is_active) 하나.
--
-- 배경: roster_weekday_default 는 (board_id, weekday) 당 1개·무명 이었다(요일 기본 1개).
--   사용자 요청(2026-06-28): 한 요일에 "2026 성수기" 처럼 이름붙은 인원배치를 여러 개 두고,
--   그 중 하나에 별표(주배치)를 줘서 그게 빈 날짜 자동 시드 소스가 되게 한다.
--   → 역할 레이아웃(roster_templates)이 이미 가진 "이름붙은 여러 버전 + is_default" 패턴과 대칭.
--
-- 모델:
--   roster_weekday_preset       (부모) = 한 요일의 인원배치 버전 1개. is_active=별표/주(요일당 1개).
--   roster_weekday_preset_item  (자식) = 그 버전의 인원 줄.
--   roster_weekday_preset_set_active(uuid) = 별표 전환을 단일 트랜잭션으로(원자성).
--
-- 전제: is_master()(migrate-dynamic-master.sql), is_board_member(board_id uuid)(migrate-create-members.sql),
--       schedule_touch_updated_at()(migrate-create-schedule-events.sql).
-- 재실행 안전(IF NOT EXISTS / DROP ... IF EXISTS / 멱등 이전). supabase-guardian 검수 반영(2026-06-28).
-- ※ 적용은 통합 세션. 워커는 제시만.

begin;

-- ── 1. 부모: 버전 ────────────────────────────────────────────────────────────
create table if not exists roster_weekday_preset (
  id            uuid primary key default gen_random_uuid(),
  board_id      uuid not null references pages(id) on delete cascade,
  weekday       text not null check (weekday in ('일','월','화','수','목','금','토')),
  name          text not null default '기본',         -- 예: '2026 성수기'
  is_active     boolean not null default false,      -- 별표/주(主). 요일당 1개. 빈 날짜 자동 시드 소스
  display_order int not null default 0,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index if not exists roster_weekday_preset_board_wd_idx
  on roster_weekday_preset (board_id, weekday) where deleted_at is null;

-- 요일당 활성(별표) 1개 보장 — 부분 유니크.
create unique index if not exists roster_weekday_preset_one_active_idx
  on roster_weekday_preset (board_id, weekday)
  where is_active and deleted_at is null;

drop trigger if exists trg_roster_weekday_preset_touch on roster_weekday_preset;
create trigger trg_roster_weekday_preset_touch
  before update on roster_weekday_preset
  for each row execute function schedule_touch_updated_at();

-- ── 2. 자식: 버전의 인원 줄 ───────────────────────────────────────────────────
create table if not exists roster_weekday_preset_item (
  id          uuid primary key default gen_random_uuid(),
  preset_id   uuid not null references roster_weekday_preset(id) on delete cascade,
  member_id   uuid references members(id) on delete set null,  -- 멤버 삭제돼도 줄 보존(이름 스냅샷)
  member_name text not null,
  role        text,
  shift       text,
  status      text not null default 'confirmed',
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists roster_weekday_preset_item_preset_idx
  on roster_weekday_preset_item (preset_id) where deleted_at is null;

-- ── 3. RLS — 기존 roster 도메인과 동일 패러다임(B 공개읽기 + 마스터·보드멤버 쓰기) ──
--   ※ roster_* 전체(assignments/templates/weekday_default)가 is_master() OR is_board_member(board_id)
--      모델이다. 같은 모달에서 같은 권한이므로 여기만 access-tiers(can_in_workspace)로 가르면
--      정책이 갈려 혼란 → 도메인 일관성 위해 동일 모델 사용. (전환은 roster 도메인 일괄로, guardian 판단.)
alter table roster_weekday_preset enable row level security;
alter table roster_weekday_preset_item enable row level security;

drop policy if exists roster_weekday_preset_select on roster_weekday_preset;
create policy roster_weekday_preset_select on roster_weekday_preset
  for select using (auth.uid() is not null);

drop policy if exists roster_weekday_preset_write on roster_weekday_preset;
create policy roster_weekday_preset_write on roster_weekday_preset
  for all using (is_master() or is_board_member(board_id))
  with check (is_master() or is_board_member(board_id));

-- 자식: 부모 버전(살아있는)의 권한 위임.
drop policy if exists roster_weekday_preset_item_select on roster_weekday_preset_item;
create policy roster_weekday_preset_item_select on roster_weekday_preset_item
  for select using (auth.uid() is not null);

drop policy if exists roster_weekday_preset_item_write on roster_weekday_preset_item;
create policy roster_weekday_preset_item_write on roster_weekday_preset_item
  for all using (
    exists (
      select 1 from roster_weekday_preset p
      where p.id = preset_id and p.deleted_at is null
        and (is_master() or is_board_member(p.board_id))
    )
  )
  with check (
    exists (
      select 1 from roster_weekday_preset p
      where p.id = preset_id and p.deleted_at is null
        and (is_master() or is_board_member(p.board_id))
    )
  );

-- ── 4. 별표(주배치) 전환 — 단일 트랜잭션(원자성). 같은 요일 다른 것 false → 대상 true ──
--   SECURITY INVOKER(기본): 두 UPDATE 모두 RLS 적용 → 보드멤버/마스터만 전환 가능.
create or replace function roster_weekday_preset_set_active(p_preset_id uuid)
returns void language plpgsql as $$
declare
  v_board   uuid;
  v_weekday text;
begin
  select board_id, weekday into v_board, v_weekday
  from roster_weekday_preset
  where id = p_preset_id and deleted_at is null;
  if v_board is null then
    raise exception 'roster_weekday_preset % 없음(또는 삭제됨)', p_preset_id;
  end if;
  update roster_weekday_preset set is_active = false
    where board_id = v_board and weekday = v_weekday and id <> p_preset_id;
  update roster_weekday_preset set is_active = true
    where id = p_preset_id;
end $$;

-- ── 5. 기존 roster_weekday_default 무손실 이전 ────────────────────────────────
--   각 (board, weekday) → '기본' 버전(is_active=true) 1개로 옮긴다. 멱등(이미 있으면 건너뜀).
--   기존 테이블은 남겨둔다(롤백 안전). 앱은 새 테이블만 읽는다.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_name = 'roster_weekday_default') then

    -- 5a. 보드+요일별 '기본' 버전 생성
    insert into roster_weekday_preset (board_id, weekday, name, is_active)
    select distinct d.board_id, d.weekday, '기본', true
    from roster_weekday_default d
    where not exists (
      select 1 from roster_weekday_preset p
      where p.board_id = d.board_id and p.weekday = d.weekday and p.deleted_at is null
    );

    -- 5b. 인원 줄 복사 (해당 '기본' 버전이 아직 비어 있을 때만)
    insert into roster_weekday_preset_item (preset_id, member_id, member_name, role, shift, status, position)
    select p.id, d.member_id, d.member_name, d.role, d.shift, d.status, d.position
    from roster_weekday_default d
    join roster_weekday_preset p
      on p.board_id = d.board_id and p.weekday = d.weekday
     and p.name = '기본' and p.deleted_at is null
    where not exists (
      select 1 from roster_weekday_preset_item i where i.preset_id = p.id
    );
  end if;
end $$;

commit;
