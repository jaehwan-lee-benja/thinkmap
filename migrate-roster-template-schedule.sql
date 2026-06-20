-- 역할 배치 버전(roster_templates) ↔ 요일/날짜 매핑. 보드(pages)별.
-- 버전은 요일 무관(이름+슬롯). 이 표가 "어느 요일/날짜에 어느 버전을 쓸지"를 담는다.
--   - weekday('월'..'일'): 요일 기본 버전 (보드당 1개)
--   - work_date(YYYY-MM-DD): 특정 날짜 오버라이드 (공휴일 등; 보드당 1개)
-- 해석 우선순위: 날짜 오버라이드 > 요일 기본 > 없음.
create table if not exists roster_template_schedule (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references pages(id) on delete cascade,
  weekday text,
  work_date date,
  template_id uuid not null references roster_templates(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roster_template_schedule_one_key check (
    (weekday is not null and work_date is null)
    or (weekday is null and work_date is not null)
  )
);

-- 보드당 요일 1개, 날짜 1개 (부분 유니크)
create unique index if not exists roster_template_schedule_weekday_uq
  on roster_template_schedule (board_id, weekday) where work_date is null;
create unique index if not exists roster_template_schedule_date_uq
  on roster_template_schedule (board_id, work_date) where weekday is null;

alter table roster_template_schedule enable row level security;

-- 조회: 로그인 사용자 전체 (기존 roster_* select 정책과 동일)
create policy roster_template_schedule_select on roster_template_schedule
  for select using (auth.uid() is not null);

-- 쓰기: 마스터 또는 해당 보드 멤버 (roster_board_layout_write와 동일)
create policy roster_template_schedule_write on roster_template_schedule
  for all using (is_master() or is_board_member(board_id))
  with check (is_master() or is_board_member(board_id));
