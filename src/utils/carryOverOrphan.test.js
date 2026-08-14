// 이월 «고아 블록» 회귀 시험 — 2026-08-14 회원님 신고(「섹션이 깨진 게 있다」)의 재발 방지.
//
// 사건: 06-21 에 있던 고아 블록 2개(parentBlockId 는 있는데 그 부모 행이 없음)가 오늘 페이지로
//   이월되면서 **문서 최상위로 떨어졌다**(sectionMasterId 는 이월 설계상 null → 화면엔 «마스터 없는
//   루트 블록» = 깨진 섹션). position 도 «섹션 안 순번»(1·3)으로 매겨진 채 루트에 놓여 섹션 행과 충돌했다.
//
// 원인: toCarryOverSubtree 의 섹션 폴백에 `!r.parentBlockId` 게이트가 있어, 고아처럼
//   **parentBlockId 가 truthy 인데 매핑은 안 되는** 경우 폴백이 «평가조차» 안 됐다.
//
// ★이 시험의 성질(교본 §98): 「고쳐진 뒤 통과한다」만 보면 시험이 결함을 «보는지» 알 수 없다.
//   그래서 ⑴정상 경로가 안 깨졌는가 ⑵고아가 섹션 밑으로 들어가는가 **둘 다** 본다.
//   ⑵는 수정 전 코드에서 **반드시 실패**한다(그때 rootParent 가 null 이었다).
import { describe, it, expect } from 'vitest'
import { toCarryOverSubtree, filterRootCandidates } from './carryOverPipelineV2.js'

const CTX = { pageId: 'PAGE_NEW', pageDate: '2026-08-14', userId: 'U1' }
const NEW_SECTION = 'NEWSEC1'

// 어제 페이지: 섹션 1개 + 그 밑 정상 todo 1개 + ★고아 1개(부모 행이 없다)
const SEC_OLD = { blockId: 'OLDSEC1', blockType: 'section', sectionId: 'OLDSEC1', sectionMasterId: 'M1', textContent: '작업' }
const NORMAL  = { blockId: 'B_OK',    blockType: 'todo', parentBlockId: 'OLDSEC1', sectionId: 'OLDSEC1', isTodo: true, todoChecked: false, textContent: '정상 항목', position: 1, pageDate: '2026-06-21' }
const ORPHAN  = { blockId: 'B_ORPH',  blockType: 'todo', parentBlockId: 'GONE',    sectionId: 'OLDSEC1', isTodo: true, todoChecked: false, textContent: '작업대 연장 사이즈', position: 1, pageDate: '2026-06-21' }

const PREV_ROWS = [SEC_OLD, NORMAL, ORPHAN]
const SECTION_ID_MAP = new Map([['OLDSEC1', NEW_SECTION]])

describe('이월 — 고아 블록이 섹션 밖으로 새지 않는다', () => {
  it('★고아(parentBlockId 는 있지만 부모 행이 없음)도 «루트 후보»로 잡힌다', () => {
    const roots = filterRootCandidates([NORMAL, ORPHAN])
    // NORMAL 의 부모 OLDSEC1 은 후보에 없으므로 NORMAL 도 루트다(섹션은 후보가 아니다).
    expect(roots.map(r => r.blockId).sort()).toEqual(['B_OK', 'B_ORPH'])
  })

  it('★★고아의 새 부모가 «섹션»이어야 한다 — null(문서 최상위)이면 깨진 섹션이 된다', () => {
    const [root] = toCarryOverSubtree(ORPHAN, PREV_ROWS, CTX, SECTION_ID_MAP, null)
    // 수정 전 코드에서는 여기가 null 이었다(게이트가 섹션 폴백을 막아서).
    expect(root.parentBlockId).toBe(NEW_SECTION)
    expect(root.parentBlockId).not.toBeNull()
  })

  it('정상 블록(부모가 섹션)은 동작이 바뀌지 않는다 — 회귀 없음', () => {
    const [root] = toCarryOverSubtree(NORMAL, PREV_ROWS, CTX, SECTION_ID_MAP, null)
    expect(root.parentBlockId).toBe(NEW_SECTION)
  })

  it('sectionId 조차 매핑 안 되면 부모는 null 로 남는다 — 호출자 가드가 걸러낼 몫', () => {
    // 이 경우는 호출자(carryOverEager/Lazy)가 `if (!sectionIdMap.get(sectionId)) continue` 로
    // 애초에 오지 못하게 막는다. 그래도 순수함수 자체의 계약을 명시해 둔다.
    const [root] = toCarryOverSubtree(ORPHAN, PREV_ROWS, CTX, new Map(), null)
    expect(root.parentBlockId).toBeNull()
  })

  it('이월 블록은 sectionMasterId 를 갖지 않는다(설계) — 그래서 부모가 null 이면 «마스터 없는 루트»가 된다', () => {
    const [root] = toCarryOverSubtree(ORPHAN, PREV_ROWS, CTX, SECTION_ID_MAP, null)
    expect(root.sectionMasterId).toBeNull()
    expect(root.isCarryOver).toBe(true)
  })
})
