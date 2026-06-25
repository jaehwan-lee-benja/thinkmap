-- 재고 관리 모듈 스키마 — ⚠️ 초안. 아직 프로덕션 미적용.
-- 적용은 supabase-guardian 검수 → 사용자 승인 → 통합 세션이 수행한다.
--
-- 전제(라이브 프로덕션에 이미 존재 — 적용 전 재확인 권장):
--   함수 can_in_workspace(uuid,text) / current_workspace() / access_can(...)
--   테이블 page_type_access(page_type, default_scope, read_capability, write_capability, row_visibility)
--   pages_page_type_chk 에 'inventory' (0번은 idempotent 재적용)
--
-- 진입 페이지(pages) 공개는 이 파일이 아니라 migrate-pages-allow-inventory.sql 에서 처리한다
--   (pages = 통합 홈 소유, B 패러다임 worklog 절 확장).

begin;

-- 0) pages 진입 등록 — page_type CHECK 에 'inventory' (idempotent) -----------
alter table pages drop constraint if exists pages_page_type_chk;
alter table pages add constraint pages_page_type_chk
  check (page_type = any (array[
    'normal','daily','calendar','frame','engine','schedule',
    'payroll','dashboard','members','goal','inventory','seat'
  ]));
  -- ★ 'seat'(자리후) 포함 — 라이브 CHECK 전체 목록과 일치시켜 재실행 시 seat 미탈락(통합 세션 보정).

-- 1) 제품 마스터 ------------------------------------------------------------
create table if not exists inventory_products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,        -- unique → 시드 멱등(on conflict)
  category    text not null check (category in ('main','sub','derived')),
  unit        text,
  par_weekday numeric,                      -- 한계재고 평일 (null = 미설정)
  par_weekend numeric,                      -- 한계재고 주말/공휴일 (null = 미설정)
  sort_order  int  not null default 0,
  note        text,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2) 일자 × 제품 입력값 -----------------------------------------------------
-- 계산 컬럼(시작최종/종료합계/소비/수령필요)은 저장하지 않고 조회 시 util(inventoryCalc.js)에서 계산.
-- on delete restrict: 입력 이력이 있는 제품은 삭제를 차단(연쇄 삭제로 인한 이력 손실 방지).
create table if not exists inventory_entries (
  id            uuid primary key default gen_random_uuid(),
  business_date date not null,
  product_id    uuid not null references inventory_products(id) on delete restrict,
  start_total   numeric,
  start_manual  boolean not null default false,
  adjustment    numeric,
  note          text,
  end_a         numeric,
  end_b         numeric,
  received      numeric,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (business_date, product_id)
);

create index if not exists inventory_entries_date_idx    on inventory_entries (business_date);
create index if not exists inventory_entries_product_idx on inventory_entries (product_id);

-- 2-1) 날짜별 par 기준 ------------------------------------------------------
-- par_basis 미지정(행 없음 or null) = 자동(요일 + 공휴일). 'weekday'/'weekend' = 사용자 수동 강제.
create table if not exists inventory_days (
  business_date date primary key,
  par_basis     text check (par_basis in ('weekday','weekend')),
  is_holiday    boolean,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 3) updated_at 자동 갱신 트리거 -------------------------------------------
create or replace function inventory_touch_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_inventory_products_touch on inventory_products;
create trigger trg_inventory_products_touch before update on inventory_products
  for each row execute function inventory_touch_updated_at();

drop trigger if exists trg_inventory_entries_touch on inventory_entries;
create trigger trg_inventory_entries_touch before update on inventory_entries
  for each row execute function inventory_touch_updated_at();

drop trigger if exists trg_inventory_days_touch on inventory_days;
create trigger trg_inventory_days_touch before update on inventory_days
  for each row execute function inventory_touch_updated_at();

-- 4) 제품 마스터 시드 (src/components/Inventory/inventoryProducts.js 와 동기) ----
insert into inventory_products (name, category, par_weekday, par_weekend, sort_order, note) values
  ('제조 우유',      'main', 10,   20,   10,  null),
  ('판매 우유',      'main', 15,   20,   20,  null),
  ('플레인 1L',      'main', 10,   10,   30,  null),
  ('플레인 500ml',   'main', 5,    10,   40,  null),
  ('플레인 150ml',   'main', 10,   14,   50,  null),
  ('딸기 요거트',    'main', 10,   15,   60,  '목-오전 택배 외 수령'),
  ('밀크티',         'main', null, null, 70,  null),
  ('그릭요거트(2w)', 'main', 2,    2,    80,  null),
  ('꾼치즈(3w)',     'main', 2,    2,    90,  null),
  ('스트링치즈(3w)', 'main', 5,    5,    100, null),
  ('베이스',         'main', 10,   18,   110, '1박스 = 24개'),
  ('카이막',         'main', 2,    4,    120, '금-다음주 날짜 수령'),
  ('카이막컵',       'main', null, null, 130, null),
  ('빵 포장',        'main', null, null, 140, null),
  ('원두',           'sub',  null, null, 210, null),
  ('원두(디카페인)', 'sub',  null, null, 220, null),
  ('식빵',           'sub',  null, null, 230, null),
  ('호밀',           'sub',  null, null, 240, null),
  ('자몽',           'sub',  null, null, 250, null),
  ('오레오쿠키',     'sub',  null, null, 260, null),
  ('오레오링 오즈',  'sub',  null, null, 270, null),
  ('꿀',             'sub',  null, null, 280, null),
  ('하)카이막(개)',  'derived', null, null, 310, null),
  ('베이스(박스)',   'derived', null, null, 320, null),
  ('우유(개or박스)', 'derived', null, null, 330, null)
on conflict (name) do nothing;

-- 5) RLS — grant 모델(can_in_workspace) 결합 ------------------------------
-- 읽기 = viewer 이상, 쓰기 = editor 이상(일자 입력) / owner(제품 마스터·구조 데이터 보호).
-- 현 grant 시드: 마스터=owner, active 멤버·파트너·rlawldus0621=editor.
-- ★ 제품 마스터 쓰기 등급은 사용자 결정 대기 — (B) owner 기준으로 작성. (A)면 아래 owner→editor.

alter table inventory_products enable row level security;
alter table inventory_entries  enable row level security;
alter table inventory_days     enable row level security;

-- 제품 마스터 (read viewer / write owner = 마스터 전용)
drop policy if exists inv_products_read   on inventory_products;
create policy inv_products_read   on inventory_products for select
  using ( can_in_workspace(current_workspace(), 'viewer') );
drop policy if exists inv_products_insert on inventory_products;
create policy inv_products_insert on inventory_products for insert
  with check ( can_in_workspace(current_workspace(), 'owner') );
drop policy if exists inv_products_update on inventory_products;
create policy inv_products_update on inventory_products for update
  using ( can_in_workspace(current_workspace(), 'owner') )
  with check ( can_in_workspace(current_workspace(), 'owner') );
drop policy if exists inv_products_delete on inventory_products;
create policy inv_products_delete on inventory_products for delete
  using ( can_in_workspace(current_workspace(), 'owner') );

-- 일자 입력값 (read viewer / write editor)
drop policy if exists inv_entries_read   on inventory_entries;
create policy inv_entries_read   on inventory_entries for select
  using ( can_in_workspace(current_workspace(), 'viewer') );
drop policy if exists inv_entries_insert on inventory_entries;
create policy inv_entries_insert on inventory_entries for insert
  with check ( can_in_workspace(current_workspace(), 'editor') );
drop policy if exists inv_entries_update on inventory_entries;
create policy inv_entries_update on inventory_entries for update
  using ( can_in_workspace(current_workspace(), 'editor') )
  with check ( can_in_workspace(current_workspace(), 'editor') );
drop policy if exists inv_entries_delete on inventory_entries;
create policy inv_entries_delete on inventory_entries for delete
  using ( can_in_workspace(current_workspace(), 'editor') );

-- 날짜별 par 기준 (read viewer / write editor)
drop policy if exists inv_days_read   on inventory_days;
create policy inv_days_read   on inventory_days for select
  using ( can_in_workspace(current_workspace(), 'viewer') );
drop policy if exists inv_days_insert on inventory_days;
create policy inv_days_insert on inventory_days for insert
  with check ( can_in_workspace(current_workspace(), 'editor') );
drop policy if exists inv_days_update on inventory_days;
create policy inv_days_update on inventory_days for update
  using ( can_in_workspace(current_workspace(), 'editor') )
  with check ( can_in_workspace(current_workspace(), 'editor') );
drop policy if exists inv_days_delete on inventory_days;
create policy inv_days_delete on inventory_days for delete
  using ( can_in_workspace(current_workspace(), 'editor') );

-- 6) page_type_access SSOT 에 inventory 등록 ------------------------------
-- RLS can() 과 프론트 게이팅이 둘 다 이 행을 읽는다. (write_capability=editor: 일자 입력 기준)
insert into page_type_access (page_type, default_scope, read_capability, write_capability, row_visibility)
values ('inventory', 'workspace', 'viewer', 'editor', false)
on conflict (page_type) do update set
  default_scope     = excluded.default_scope,
  read_capability   = excluded.read_capability,
  write_capability  = excluded.write_capability,
  row_visibility    = excluded.row_visibility;

commit;
