// 세부분류·메모 «임시» 보관소 — 계약 v1.3(GET /spend-taxonomy · verdicts 의 subcategory_id·note) 대기용.
//
// ★왜 서버가 아니라 여기인가: 발주가 «UI 골격은 지금, 저장 배선은 계약 대기» 로 갈렸다.
//   화면에 입력란을 열어 두고 값을 버리면 사용자에겐 «저장됐는데 사라진 것»과 구별이 안 된다
//   — 오늘 내내 쫓던 «조용한 실패» 그 형태다. 그래서 ⑴기기에 남기고 ⑵«서버 저장 전»이라고 화면이 말한다.
//   계약이 오면 loadDetails() 결과를 그대로 밀어 올린다(입력한 것을 다시 받아낼 필요가 없다).
//
// ★메모의 단위 = «품목»이다(계약 v1.3 §2-2-a). 발주 문구는 «행별 메모»였지만 §3 이 행 식별자 비노출을
//   못박고 있어 위성이 개별 행을 지목할 수단이 없다. 그래서 메모는 그 품목의 모든 행에 붙는다 —
//   화면 문구도 «이 품목에 대한 메모»로 적어 오해를 안 만든다.
const KEY = 'expense.details.v1'

/**
 * 2단 고정 — 세부는 «자기 대분류»를 들고 다닌다. 필드명은 계약 §2-3 과 같은 `category` 다.
 * ★같은 것을 두 이름으로 부르면 반드시 «한쪽만 고치는 날»이 온다(asset 지적, 채택).
 * ★세부가 대분류를 이긴다(계약 v1.3): `사업-운영` 을 눌러도 세부 `직원식대`(인건비)를 고를 수 있다.
 *   버튼은 «빠른 기본값»이지 최종 판정이 아니다. 그래서 세부를 그룹 안에 가두지 않고 category 를 붙여 둔다.
 */
export const BASE_TAXONOMY = [
  { id: 'raw.dairy', label: '유제품', category: '사업-원재료' },
  { id: 'raw.bakery', label: '베이커리', category: '사업-원재료' },
  { id: 'raw.produce', label: '과일·채소', category: '사업-원재료' },
  { id: 'raw.bev', label: '음료·원두', category: '사업-원재료' },
  { id: 'raw.pack', label: '포장·부자재', category: '사업-원재료' },
  { id: 'ops.supply', label: '소모품', category: '사업-운영' },
  { id: 'ops.fix', label: '수리·유지', category: '사업-운영' },
  { id: 'ops.util', label: '공과금', category: '사업-운영' },
  { id: 'ops.ship', label: '배송비', category: '사업-운영' },
  { id: 'ops.mkt', label: '마케팅', category: '사업-운영' },
  { id: 'labor.meal', label: '직원식대', category: '인건비' },
  { id: 'personal.life', label: '생활', category: '개인' },
  { id: 'personal.food', label: '식비', category: '개인' },
  { id: 'personal.move', label: '교통', category: '개인' },
]

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } }
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* 사파리 프라이빗 등 — 화면엔 남는다 */ } }

/** { items: { [item_key]: { detail, memo } }, custom: [{id,label,category}] } */
export function loadDetails() {
  const raw = read()
  return { items: raw.items || {}, custom: raw.custom || [] }
}

export function saveDetail(itemKey, patch) {
  const s = loadDetails()
  s.items[itemKey] = { ...(s.items[itemKey] || {}), ...patch }
  const v = s.items[itemKey]
  if (!v.detail && !v.memo) delete s.items[itemKey]   // 빈 껍데기 키는 나중에 올릴 때 잡음이 된다
  write(s)
  return s
}

/** 유저가 직접 추가한 세부요소. ★선택 이력은 규칙 학습 재료라 지우지 않는다(발주). */
export function addCustomDetail(category, name) {
  const label = String(name || '').trim()
  if (!label) return null
  const s = loadDetails()
  const all = [...BASE_TAXONOMY, ...s.custom]
  const hit = all.find((t) => t.label === label)
  if (hit) return hit.id
  // ★서버 id 가 아니다. 배선할 때 **이걸 그대로 밀면 안 된다** — 서버는 uuid 형식이 아닌 값을
  //   전부 `unknown_subcategories` 로 반송하므로, 회원님이 입력해 둔 게 «조용히» 전부 사라진다.
  //   반드시 이 순서다(계약 §2-3-a):
  //     ⑴ spend_taxonomy 에 INSERT → 돌아온 uuid 수령
  //     ⑵ 보관된 custom.* → 그 uuid 로 치환
  //     ⑶ 그 다음에야 POST /spend-verdicts
  const id = `custom.${Date.now().toString(36)}`
  s.custom = [...s.custom, { id, label, category: category || '사업-운영' }]
  write(s)
  return id
}

export const allTaxonomy = (state) => [...BASE_TAXONOMY, ...((state && state.custom) || [])]
export const taxonomyById = (state, id) => allTaxonomy(state).find((t) => t.id === id) || null

/** 계약 v1.3 이 오면 이걸 그대로 배치 전송한다 — 지금은 «대기 중인 것이 몇 건인지»를 센다. */
export const pendingDetailCount = (state) => Object.keys((state && state.items) || {}).length
