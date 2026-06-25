-- 재고 진입 페이지를 워크스페이스 멤버(로그인 사용자)가 보고 만들 수 있게 —
-- 'inventory' 를 pages 공개(B 패러다임) 절에 추가한다.
--
-- ⚠️ pages = 통합 홈 소유 테이블 → 통합 세션이 적용한다. (inventory worktree 에서 직접 적용 금지)
-- 진입 페이지(빈 컨테이너)만 공개되고, 실제 재고 데이터(inventory_products/entries/days)는
-- grant RLS(viewer/editor)가 막는다. grant 없는 계정은 진입 페이지만 보이고 데이터는 빈다.
--
-- 라이브 정책 전문 기준(2026-06-25). 기존 절은 그대로 보존하고 배열에 'inventory' 만 추가.
-- (참고: 통합 세션이 향후 pages RLS 를 page_type_access 기반 can() 으로 전환하면 이 파일은 불필요해진다.)

begin;

drop policy if exists pages_select_with_worklog on pages;
create policy pages_select_with_worklog on pages for select using (
  is_master()
  OR (auth.uid() = user_id)
  OR (exists ( select 1 from shares s
        where ((((s.resource_type = 'page')    and (s.resource_id = pages.id))
             or ((s.resource_type = 'project') and (s.resource_id = pages.project_id)))
          and (s.shared_with_user_id = auth.uid()))))
  OR is_linked_account_viewer(user_id)
  OR ((page_type = any (array['calendar','daily','schedule','inventory'])) and (auth.uid() is not null))
);

drop policy if exists pages_insert_worklog on pages;
create policy pages_insert_worklog on pages for insert with check (
  (page_type = any (array['calendar','daily','schedule','inventory'])) and (auth.uid() is not null)
);

commit;
