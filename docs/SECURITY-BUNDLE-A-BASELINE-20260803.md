# 보안 묶음 A — 적용 전 기준선 (불변 참조)

> 측정 시각 **2026-08-03** · 프로젝트 `sqisntxippjzcekyhqyo` · read-only 조회
> ★이 파일은 **적용 후 수정하지 않는다.** 재측정 결과와 대조하기 위한 고정 기준선이다.
> (규율: 기준선을 조치와 같은 문서에 두면 조치가 기준선을 덮어써 판정이 무력화된다.)

## ⓐ `migrate-fix-create-canvas-pair-exposure.sql` 대상

| 함수 | secdef | search_path | anon_x | auth_x | svc_x |
|---|---|---|---|---|---|
| `create_canvas_pair(p_user_id uuid, p_master_id uuid, p_name text)` | true | `public` | **true** | true | true |

`proacl` = `{=X/postgres, postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}`
▸ `=X/postgres` = **PUBLIC EXECUTE 존재** ⇒ `from anon` 단독 회수는 no-op(축6). 문안이 `PUBLIC, anon`인 이유.
▸ 전부 **defacl 상속분(ⓒ)** — 정의 마이그에 authored `GRANT` 0줄.

## ⓑ `migrate-pin-secdef-search-path.sql` 대상 (버킷A = secdef ∧ proconfig IS NULL)

| # | 함수 | search_path | anon_x | auth_x | svc_x |
|---|---|---|---|---|---|
| 1 | `is_master()` | **(미설정)** | true | true | true |
| 2 | `get_user_id_by_email(email_input text)` | (미설정) | true | true | true |
| 3 | `get_linked_accounts()` | (미설정) | true | true | true |
| 4 | `is_linked_account(owner_user_id uuid)` | (미설정) | true | true | true |
| 5 | `is_linked_account_viewer(owner_user_id uuid)` | (미설정) | true | true | true |
| 6 | `purge_deleted_pages()` | (미설정) | true | true | true |
| 7 | `set_shared_with_user_id()` | (미설정) | true | true | true |

**계수 = 7** (나열 7 == 합계 7 ✓ 대조 완료 — ⒅ 규율)
모집단 = `pg_proc` × `nspname='public'` × `prosecdef` × `proconfig IS NULL`. 제외 없음(전수).

## 통과 판정 술어 (적용 후 이 파일과 대조)

**⑴ 금지 술어 = false**
- ⓐ `create_canvas_pair` `anon_x` **true → false**
- ⓑ `public` secdef 중 `proconfig IS NULL` **7건 → 0건**

**⑵ 의도된 경로 = true** ★이게 없으면 회수 성공이 아니라 기능 정지
- ⓐ `create_canvas_pair` `auth_x` **true 유지** + 캔버스 페어 생성 1회 실동작
- ⓑ `is_master()` 등 7종이 계속 동작 — 마스터 로그인·연결계정·공유 트리거 실경로

**⑶ 기장행 존재** — 적용 후 `supabase_migrations.schema_migrations`에 해당 version 행이 남는가
(= "실행했다"가 아니라 "DB가 실행을 기억하는가")
