-- ============================================================================
-- 멤버 시드 — 직원 연명부 기반 (ver.250204 / 명세서 전달 / 직원 현황_250803 종합)
--
--   migrate-create-members.sql 실행 후에 실행한다.
--   재실행 안전: 살아있는 동명이 없을 때만 INSERT (uq_members_name_alive + WHERE NOT EXISTS).
--   민감정보(생일/계좌/메일 등)는 시드에 넣지 않는다 — 마스터가 멤버 관리 페이지에서 입력.
--
--   ⚠ work_days/seniority/status 는 연명부 추정값이다. 실제와 다르면 멤버 관리 페이지에서 수정.
-- ============================================================================

BEGIN;

INSERT INTO members (name, work_days, seniority, status)
SELECT v.name, v.work_days, v.seniority, 'active'
FROM (VALUES
  ('김지연', ARRAY['월','화','수','목','금'], '매니저'),
  ('김가을', ARRAY['목','금','토','일'],     '시니어'),
  ('장원희', ARRAY['월','화'],               NULL),
  ('조우영', ARRAY['월','화'],               NULL),
  ('안선영', ARRAY['목','금'],               NULL),
  ('신민정', ARRAY['목','금'],               NULL),
  ('공가영', ARRAY['목','금'],               NULL),
  ('배미진', ARRAY['토','일'],               NULL),
  ('이다경', ARRAY['토'],                    NULL),
  ('장아린', ARRAY['토','일'],               NULL),
  ('김도윤', ARRAY['토','일'],               NULL),
  ('김한빈', ARRAY['토'],                    '주니어'),
  ('이다혜', ARRAY['토'],                    NULL),
  ('김동화', ARRAY['토'],                    NULL),
  ('유지현', ARRAY['일'],                    NULL),
  ('서효경', ARRAY['일'],                    NULL),
  ('문지선', ARRAY['일'],                    NULL),
  ('김향숙', ARRAY['일'],                    NULL),
  ('이재환', ARRAY['토'],                    '대표')
) AS v(name, work_days, seniority)
WHERE NOT EXISTS (
  SELECT 1 FROM members m WHERE m.name = v.name AND m.deleted_at IS NULL
);

-- display_order: 직급(매니저>시니어>일반) → 이름 순으로 부여(선택)
WITH ranked AS (
  SELECT id, row_number() OVER (
           ORDER BY CASE seniority WHEN '대표' THEN 0 WHEN '매니저' THEN 1
                                   WHEN '시니어' THEN 2 ELSE 3 END, name
         ) * 10 AS ord
  FROM members WHERE deleted_at IS NULL
)
UPDATE members m SET display_order = r.ord
FROM ranked r WHERE m.id = r.id;

COMMIT;

SELECT display_order, name, work_days, seniority, status
FROM members WHERE deleted_at IS NULL
ORDER BY display_order, name;
