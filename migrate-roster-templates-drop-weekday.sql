-- 역할 배치 버전을 요일 무관으로 재정의 → weekday 바인딩은 roster_template_schedule로 이관.
-- (사용자 확정: 컬럼까지 완전 제거. 기존 요일 태그 데이터는 영구 삭제됨.)
alter table roster_templates drop column if exists weekday;
