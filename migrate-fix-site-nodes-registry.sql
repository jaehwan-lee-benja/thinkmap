-- migrate-fix-site-nodes-registry.sql
-- ══════════════════════════════════════════════════════════════════════════
-- [승인 대기 · ★미적용] site_nodes 레지스트리 데이터 정정 — URL 5행 채움 +
--   canvas domain 정정 + inventory status 정정
-- ══════════════════════════════════════════════════════════════════════════
-- 근거: docs/REFACTOR-AUDIT-20260804.md §1 "확정된 발견" (rf-struct 실측,
--   측정법 = `select … from site_nodes` + `ls apps/` + 위성 7개 HTTP 실측).
--   작성 시각(이 파일): 2026-08-04. 아래 "현재값"은 그 실측 시점 기준 — 실행 전
--   반드시 §0 DRY-RUN 으로 재확인하라(그 사이 손으로 고쳤을 수 있다).
--
-- ■ 정정 대상 (감사 §1 표)
--   | domain      | 항목            | 틀린 값   | 맞는 값              |
--   |-------------|-----------------|-----------|-----------------------|
--   | payroll     | url             | '' (빈값) | /thinkmap/payroll/    |
--   | members     | url             | '' (빈값) | /thinkmap/members/    |
--   | engine→canvas| url            | '' (빈값) | /thinkmap/canvas/     |
--   | engine→canvas| domain         | engine    | canvas                |
--   | seat        | url             | '' (빈값) | /thinkmap/seat/       |
--   | inventory   | url             | '' (빈값) | /thinkmap/inventory/  |
--   | inventory   | status          | dev       | live                  |
--   | dashboard   | url             | '' (빈값) | ★대상 아님 — §5 참조   |
--
-- ■ url 형식 근거(코드 실측, 임의 판단 아님): apps/{payroll,members,canvas,seat,
--   inventory}/vite.config.js 전부 `base: process.env.APP_BASE || '/thinkmap/<name>/'`
--   (선행+후행 슬래시, 프로토콜 없는 절대경로 — 같은 origin 형제 서브트리, SSO 자동).
--   같은 형식을 이미 쓰는 살아있는 값들: site_nodes.hub url='/thinkmap/',
--   src/config/satellites.jsx 의 SATELLITES.{inventory,seat,canvas,members}.url,
--   src/utils/siteNodesSeed.js 의 seed-{payroll,seat,inventory,crmboard} url.
--   ⇒ 이번 정정값은 그 관례를 그대로 따른다(새 형식 발명 아님).
--
-- ■ url 이 비어 있을 때 실제로 무슨 일이 나는지(코드 근거, "런처가 안 나간다" 확정) —
--   src/components/Backoffice/BackofficePage.jsx:126-127 (표) : url 없으면 <a> 대신
--     "내부 page_type" 플레인 텍스트만 렌더.
--   src/components/Backoffice/BackofficePage.jsx:151-154 (런처 미리보기 타일) : url 없으면
--     href=undefined + onClick 에서 preventDefault — 타일이 죽어 있다(클릭해도 안 나감).
--   ※ 이 테이블은 실제 프로덕션 사이드바 런처(src/config/satellites.jsx, 별도 하드코딩 상수)의
--   소스가 **아니다** — 백오피스 "사이트 구조도" 관리 화면의 데이터일 뿐이다. 그래도 그 화면이
--   바로 "위성 런처 레지스트리 = 단일 소스"라는 SITE-SPLIT-PLAN §10 결정의 실물이라 정정 대상이다.
--
-- ■ 범위 밖(이 파일이 다루지 않는 것)
--   - membership 위성 등록(감사 §6-a, §11 항목2) — 별도 판단·별도 마이그. 이 파일과 섞지 않는다.
--   - dashboard kind/존치 여부 — §5. 판단이 필요해 이 트랜잭션 밖에 둔다.
--   - RLS 정책 — 손대지 않음. 현재 site_nodes 는 site_nodes_ws_owner_v2
--     (can_in_workspace(current_workspace(),'owner')) 단독 정책(2026-07-11 적용, master_all 폐기됨).
--
-- ■ 조치 성격: DDL 아님. UPDATE 3개 필드(url×5행 + domain×1행 + status×1행) = 실질 5행.
--   위험 낮음(감사 §1 판정과 동일) — 단, "행을 어떻게 찾는가"가 유일한 리스크이므로
--   name 이 아니라 domain(+kind)으로 매칭하고, 각 UPDATE 뒤 영향행수를 검사해
--   기대와 다르면 예외를 던져 트랜잭션을 통째로 되돌린다(부분 적용 방지).
--   ★재실행 안전은 "영구 idempotent"가 아니라 "실패해도 안전"이다 — 이미 채워진 뒤 다시
--   돌리면 WHERE 의 (url IS NULL OR url='') 조건에 안 걸려 0행 → 아래 가드가 예외를 던진다.
--   이는 의도된 동작이다(자동 무해 스킵보다 "말라 붙어 알려주는 것"이 이 값엔 더 안전 —
--   드리프트를 소리 없이 재승인 없이 덮어쓰지 않기 위함).
-- ══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- §0. DRY-RUN — 적용 전 반드시 먼저 실행. 아래 매칭 가정이 아직 맞는지 눈으로 확인한다.
-- ─────────────────────────────────────────────────────────────────────────
-- (a) 전체 현황 — 9행 기대(2026-08-04 감사 기준). 다르면 §1 이전에 멈추고 재조사.
--   SELECT id, name, kind, domain, url, status, sort_order, deleted_at
--     FROM site_nodes
--    ORDER BY sort_order;

-- (b) 이번 UPDATE 가 매칭할 행이 정확히 "1행씩"인지 사전 확인(핵심 안전판).
--   domain+kind 매칭이 예상과 다르면(0행/2행 이상) 아래 §1 은 실행하지 말고
--   (a) 의 id 를 직접 보고 WHERE 절을 id = '<uuid>' 로 바꿔 재작성하라.
--   SELECT domain, kind, count(*)
--     FROM site_nodes
--    WHERE deleted_at IS NULL
--      AND domain IN ('payroll','members','engine','seat','inventory')
--    GROUP BY domain, kind
--    ORDER BY domain;
--   -- 기대: payroll/satellite=1, members/satellite=1, engine/satellite=1,
--   --       seat/satellite=1, inventory/satellite=1
--   --       (members/hub=1 이 별도로 있어도 무방 — 아래 UPDATE 는 kind='satellite' 만 잡는다)


-- ─────────────────────────────────────────────────────────────────────────
-- §1. 본 트랜잭션 — url 5행 + canvas domain + inventory status
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;

DO $$
DECLARE
  affected int;
BEGIN
  -- ① payroll url
  UPDATE site_nodes
     SET url = '/thinkmap/payroll/'
   WHERE domain = 'payroll' AND kind = 'satellite' AND deleted_at IS NULL
     AND (url IS NULL OR url = '');
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN
    RAISE EXCEPTION 'site_nodes payroll 매칭 실패 — 예상 1행, 실제 %행. §0(b) 로 재확인 후 id 매칭으로 재작성하라.', affected;
  END IF;

  -- ② members url
  UPDATE site_nodes
     SET url = '/thinkmap/members/'
   WHERE domain = 'members' AND kind = 'satellite' AND deleted_at IS NULL
     AND (url IS NULL OR url = '');
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN
    RAISE EXCEPTION 'site_nodes members 매칭 실패 — 예상 1행, 실제 %행. §0(b) 로 재확인 후 id 매칭으로 재작성하라.', affected;
  END IF;

  -- ③ canvas — domain(engine→canvas) + url, 같은 행이라 한 문장으로 같이 정정
  UPDATE site_nodes
     SET domain = 'canvas',
         url    = '/thinkmap/canvas/'
   WHERE domain = 'engine' AND kind = 'satellite' AND deleted_at IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN
    RAISE EXCEPTION 'site_nodes canvas(engine) 매칭 실패 — 예상 1행, 실제 %행. §0(b) 로 재확인 후 id 매칭으로 재작성하라.', affected;
  END IF;

  -- ④ seat url
  UPDATE site_nodes
     SET url = '/thinkmap/seat/'
   WHERE domain = 'seat' AND kind = 'satellite' AND deleted_at IS NULL
     AND (url IS NULL OR url = '');
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN
    RAISE EXCEPTION 'site_nodes seat 매칭 실패 — 예상 1행, 실제 %행. §0(b) 로 재확인 후 id 매칭으로 재작성하라.', affected;
  END IF;

  -- ⑤ inventory — url + status(dev→live), 같은 행
  UPDATE site_nodes
     SET url    = '/thinkmap/inventory/',
         status = 'live'
   WHERE domain = 'inventory' AND kind = 'satellite' AND deleted_at IS NULL
     AND (url IS NULL OR url = '' OR status = 'dev');
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN
    RAISE EXCEPTION 'site_nodes inventory 매칭 실패 — 예상 1행, 실제 %행. §0(b) 로 재확인 후 id 매칭으로 재작성하라.', affected;
  END IF;
END $$;

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────
-- §2. 검증 쌍 — ⑴금지 술어(적용 후 이 값이 0이어야 한다) ∧ ⑵의도된 경로(코드가 실제로 그 값을 쓴다)
-- ─────────────────────────────────────────────────────────────────────────
-- ⑴ 금지 술어 — 배포된 5위성 중 url 빈값 0건, canvas domain='engine' 잔존 0건, inventory status='dev' 0건.
--   SELECT count(*) AS bad_url FROM site_nodes
--    WHERE kind='satellite' AND deleted_at IS NULL
--      AND domain IN ('payroll','members','canvas','seat','inventory')
--      AND (url IS NULL OR url = '');                          -- 기대 0
--   SELECT count(*) AS stale_engine FROM site_nodes
--    WHERE domain = 'engine' AND deleted_at IS NULL;            -- 기대 0
--   SELECT count(*) AS stale_dev FROM site_nodes
--    WHERE domain = 'inventory' AND status = 'dev' AND deleted_at IS NULL; -- 기대 0
--
-- ⑵ 의도된 경로(코드 근거, 술어만으로 안 끝냄) —
--   src/components/Backoffice/BackofficePage.jsx:126-127 은 `n.url` 이 존재하면
--   `<a href={n.url} target="_blank">` 를 렌더하고(표 URL 열), :151-154 는 런처 미리보기
--   타일에서 `href={n.url || undefined}` + url 없을 때만 `preventDefault` 한다.
--   ⇒ url 이 채워지면 **그 두 렌더 경로 모두** 자동으로 살아있는 링크를 낸다(추가 코드 변경 불필요).
--   수동 확인: 적용 후 백오피스(page_type=backoffice) 새로고침 → "런처 미리보기" 섹션에서
--   payroll/members/canvas/seat/inventory 5타일이 실제로 새 탭에서 해당 위성으로 열리는지 클릭 확인.


-- ─────────────────────────────────────────────────────────────────────────
-- §3. 롤백 — §1 이 만든 값을 원복. 실행 전 site_nodes 를 다시 조회해 다른 손이
--   그 사이 더 안 건드렸는지 확인하고 쓸 것(아래는 §1 적용 직후 상태 기준).
-- ─────────────────────────────────────────────────────────────────────────
-- BEGIN;
-- UPDATE site_nodes SET url = ''            WHERE domain = 'payroll'  AND kind = 'satellite' AND deleted_at IS NULL;
-- UPDATE site_nodes SET url = ''            WHERE domain = 'members'  AND kind = 'satellite' AND deleted_at IS NULL;
-- UPDATE site_nodes SET domain = 'engine', url = '' WHERE domain = 'canvas' AND kind = 'satellite' AND deleted_at IS NULL;
-- UPDATE site_nodes SET url = ''            WHERE domain = 'seat'     AND kind = 'satellite' AND deleted_at IS NULL;
-- UPDATE site_nodes SET url = '', status = 'dev' WHERE domain = 'inventory' AND kind = 'satellite' AND deleted_at IS NULL;
-- COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- §5. dashboard — ★판단 필요, 이 트랜잭션 밖(§1 에 안 넣음). 감사 §1 은 dashboard 를
--   "URL 빈값 6행" 목록에 넣었지만, dashboard 는 apps/dashboard 가 **존재하지 않는다**
--   (실측: `ls apps/` → dashboard 없음). 즉 나머지 5행과 이유가 다르다 — 저건 "채우는 걸
--   깜빡한 빈값"이고 dashboard 는 "**채울 URL 자체가 없다**"(모선 안 page_type=dashboard).
--   ⇒ url 을 채우는 게 정답이 아니다. 문제는 kind='satellite' 라는 **분류**다.
--
--   옵션 A(권고, 가장 보수적) — 아무것도 안 바꾼다.
--     장점: 리스크 0. 단점: 백오피스 "런처 미리보기"에 클릭 안 되는 죽은 타일로 계속 남는다
--     (BackofficePage.jsx:151-154, url 없으면 클릭 무효 — 망가지진 않고 그냥 비활성 상태 유지).
--
--   옵션 B — kind 를 'hub' 로 바꾼다.
--     UPDATE site_nodes SET kind = 'hub' WHERE domain = 'dashboard' AND deleted_at IS NULL;
--     장점: launchers 필터(`kind === 'satellite'`, BackofficePage.jsx:28)에서 빠져 죽은 타일이 사라짐.
--     단점: 의미가 틀렸다 — dashboard 는 hub "그 자체"가 아니라 hub **안의 한 page_type**이다.
--     SiteMapDiagram.jsx:36-37 은 `kind==='hub'` 를 다이어그램의 최상위 노드로 그리므로,
--     다이어그램에 "허브"가 2개 뜨는 부작용이 생긴다(모선 하나 + dashboard 하나).
--
--   옵션 C — 소프트 삭제(레지스트리에서 제거).
--     UPDATE site_nodes SET deleted_at = now() WHERE domain = 'dashboard' AND deleted_at IS NULL;
--     장점: 가장 깔끔 — "위성이 아닌 것"을 위성 레지스트리에서 아예 뺀다.
--     단점: 되돌리기 쉬운 편(soft-delete)이지만, "dashboard 가 모선의 어느 page_type 인지"
--     문서화하던 유일한 곳이 사라진다(대체 문서화 필요 — docs/DASHBOARD-SPEC.md 로 이관 검토).
--
--   ⇒ 이 파일은 옵션을 실행하지 않는다. 승인 시 위 세 문 중 하나만 골라 별도로 돌려라.
-- ═══════════════════════════════════════════════════════════════════════════
