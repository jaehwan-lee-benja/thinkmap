# Phase 0.7 — 역할×동작 회귀표 (적용 전/후)

> PLAN-daily-carryover-authority.md Phase 0.7 · 작성 2026-06-11
> **이 표가 "안 깨짐"을 증명하기 전에는 `phase07-step2-rls.sql` 실행 금지.**
> BEFORE 열은 추정이 아니라 **LIVE `pg_policies` 덤프**(verify-live-policies-1.sql 결과)에 근거.
>
> 권한 맥락: 여기서 도입한 `is_board_member_of_page` 헬퍼는 ThinkMap 권한 패러다임 B(공개형)를
> "만든 사람" 기준에서 **보드 멤버십** 기준으로 옮기는 첫 단계이자, L1 테넌시 계층의 선행
> 작업이다. 전체 권한 지도/수렴 방향은 [docs/ACCESS-MODEL.md](docs/ACCESS-MODEL.md) §3·§6 참조.

## 0. 변경 요약

- **변경되는 정책: `daily_blocks` UPDATE 단 하나.**
  - 추가 절: `OR (visibility='all' AND is_board_member_of_page(page_id))` (USING·WITH CHECK 양쪽)
- **무변경:** daily_blocks SELECT/INSERT/DELETE, `pages` 전체, `worklog_sections` 전체.
- 따라서 회귀 가능 영역은 **daily_blocks UPDATE 뿐**. 나머지는 BEFORE==AFTER (정의상 회귀 0).

## 1. LIVE BEFORE 기준 (effective = 동일 cmd 정책 OR 합산)

**daily_blocks**
| cmd | effective 조건 |
|---|---|
| SELECT | `visibility='all' OR is_master()` |
| INSERT (check) | `auth.uid()=user_id OR is_master()` |
| UPDATE (using=check) | `auth.uid()=user_id OR is_master()` |
| DELETE | `is_master()` |

**pages (daily)** — 참고(무변경): SELECT/INSERT/UPDATE = `… OR (worklog타입 AND auth.uid() IS NOT NULL)` (로그인 전원), DELETE = `master OR 본인 OR linked`.

## 2. 행위자 정의

| 코드 | 행위자 | 설명 |
|---|---|---|
| M | master | designerbenja / kbl0226 (`is_master()`=true) |
| Bm | 보드 멤버(비마스터) | partner / rlawldus0621 (STEP1 등록 후), 해당 블록 비작성자 |
| A | 작성자 | 그 블록의 `user_id` 본인 (비마스터) |
| U | 비멤버 로그인 | 로그인했으나 이 보드 멤버 아님·비작성자 |
| anon | 미로그인 | (정책 role 부여에 따름; 보통 authenticated 전용) |

## 3. daily_blocks UPDATE 회귀표 (★유일 변경점)

블록 visibility 별로 구분. ✅=허용, ❌=거부.

| # | 행위자 | 블록 visibility | BEFORE | AFTER | 판정 |
|---|---|---|---|---|---|
| 1 | M | all | ✅ | ✅ | 동일 |
| 2 | M | master | ✅ | ✅ | 동일 |
| 3 | A (작성자) | all | ✅ | ✅ | 동일 |
| 4 | A (작성자) | master | ✅ | ✅ | 동일(작성자 경로 불변) |
| 5 | **Bm (멤버 비작성자)** | **all** | ❌ | ✅ | **신규 grant=의도(협업)** |
| 6 | Bm (멤버 비작성자) | master | ❌ | ❌ | 동일 — **마스터 콘텐츠 보호** (USING의 visibility='all' 조건) |
| 7 | U (비멤버) | all | ❌ | ❌ | 동일 |
| 8 | U (비멤버) | master | ❌ | ❌ | 동일 |
| 9 | anon | any | ❌ | ❌ | 동일 |

**승격 차단 검증 (WITH CHECK):** Bm 가 'all' 블록을 수정하며 visibility를 'master'로 바꾸려 하면 → 결과 행 visibility='master' → WITH CHECK의 `visibility='all'` 불만족 → **거부**. 멤버는 'all'→'master' 승격 불가. ✅

## 4. 무변경 영역 (BEFORE==AFTER 확인)

| 테이블/동작 | 상태 |
|---|---|
| daily_blocks SELECT | 무변경 — master 블록은 여전히 마스터만(`visibility='all' OR is_master()`) |
| daily_blocks INSERT | 무변경 — 본인 OR master |
| daily_blocks DELETE | 무변경 — master only |
| pages 전체 | 무변경 |
| worklog_sections 전체 | 무변경 |

## 5. 결론

- 접근이 **줄어드는 칸 0개** → 회귀 없음.
- 새로 늘어나는 칸 = **#5 단 하나** (보드 멤버의 'all' 블록 협업 편집) = 의도된 기능.
- 마스터 콘텐츠(visibility='master')는 view·edit 모두 마스터 전용 유지.

## 6. 적용 후 LIVE 검증 시나리오 (실기기 확인 권장)

1. partner 로그인 → 마스터가 만든 **'all' 블록** 체크/수정 → **성공해야 함** (#5)
2. partner 로그인 → 마스터 섹션(**'master' 블록**)은 화면에 **안 보여야 함** (#6 SELECT)
3. partner 로그인 → (혹시 보이더라도) master 블록 수정 시도 → **거부** (#6 UPDATE)
4. 마스터 로그인 → 모든 블록 view/edit **정상** (#1,2)
5. 회귀: partner 본인이 만든 블록 수정 → 여전히 **성공** (#3 경로 불변)
