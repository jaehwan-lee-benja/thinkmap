// 세부분류·메모 «임시» 보관소 — 계약 v1.3(asset 이 verdicts 확장·taxonomy 작성 중) 대기용.
//
// ★왜 서버가 아니라 여기인가: 발주가 «UI 골격·모형 동작은 지금, 저장 배선은 계약 대기» 로 갈렸다.
//   그런데 화면에 입력란을 열어 두고 값을 버리면, 사용자에겐 «저장됐는데 사라진 것»과 구별이 안 된다
//   — 오늘 내내 쫓던 «조용한 실패» 바로 그 형태다. 그래서 ⑴기기에 남기고 ⑵«서버 저장 전»이라고 화면이 말한다.
//   계약이 오면 이 파일의 read() 결과를 그대로 밀어 올리면 된다(입력한 것을 다시 받아낼 필요가 없다).
const KEY = 'expense.details.v1'

/** 2단 고정 — 대분류(판정 버튼) → 세부. 그 이상 깊이는 메모로 간다(발주 명시). */
export const BASE_TAXONOMY = {
  '사업-원재료': ['유제품', '베이커리', '과일·채소', '음료·원두', '포장·부자재'],
  '사업-운영': ['소모품', '수리·유지', '공과금', '배송비', '마케팅'],
  '개인': ['생활', '식비', '교통', '기타'],
  '보류': [],
}

const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
}
const write = (v) => {
  try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* 사파리 프라이빗 등 — 조용히 포기(입력은 화면엔 남는다) */ }
}

/** { items: { [item_key]: { detail, memo } }, custom: { [대분류]: string[] } } */
export function loadDetails() {
  const raw = read()
  return { items: raw.items || {}, custom: raw.custom || {} }
}

export function saveDetail(itemKey, patch) {
  const s = loadDetails()
  s.items[itemKey] = { ...(s.items[itemKey] || {}), ...patch }
  // 빈 값만 남으면 항목째 지운다 — 쓰레기 키가 쌓이면 나중에 올릴 때 잡음이 된다
  const v = s.items[itemKey]
  if (!v.detail && !v.memo) delete s.items[itemKey]
  write(s)
  return s
}

/** 유저가 직접 추가한 세부요소. ★선택 이력은 규칙 학습 재료라 지우지 않는다(발주). */
export function addCustomDetail(group, name) {
  const label = String(name || '').trim()
  if (!label) return null
  const s = loadDetails()
  const list = s.custom[group] || []
  if (!list.includes(label) && !(BASE_TAXONOMY[group] || []).includes(label)) {
    s.custom[group] = [...list, label]
    write(s)
  }
  return label
}

export const detailsFor = (state, group) => [...(BASE_TAXONOMY[group] || []), ...((state.custom || {})[group] || [])]

/** 계약 v1.3 이 오면 이걸 그대로 배치 전송한다 — 지금은 «대기 중인 것이 몇 건인지»를 세는 데 쓴다. */
export const pendingDetailCount = (state) => Object.keys(state.items || {}).length
