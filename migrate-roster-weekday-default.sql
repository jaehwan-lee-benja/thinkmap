-- 요일 기본 배치(사람→역할) — 보드(pages)별. 그 요일 날짜를 빈 상태로 열면 자동으로 깔린다.
-- roster_template_schedule(요일→역할카드 버전)과는 별개: 이건 "누가 어느 역할"의 사람 배치 기본값.
create table if not exists roster_weekday_default (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references pages(id) on delete cascade,
  weekday text not null,
  member_id uuid,
  member_name text not null,
  role text,
  shift text,
  status text not null default 'confirmed',
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists roster_weekday_default_board_wd_idx
  on roster_weekday_default (board_id, weekday);

alter table roster_weekday_default enable row level security;

create policy roster_weekday_default_select on roster_weekday_default
  for select using (auth.uid() is not null);
create policy roster_weekday_default_write on roster_weekday_default
  for all using (is_master() or is_board_member(board_id))
  with check (is_master() or is_board_member(board_id));
