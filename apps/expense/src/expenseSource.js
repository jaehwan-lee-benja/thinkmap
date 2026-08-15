// 데이터 접근 «어댑터» — 화면은 이 파일만 통해 데이터를 만난다.
//
// ★왜 격리하나: 저장처가 «로컬 파일 → TM Edge» 로 옮겨가는 중이다.
//   그 이관이 끝나도 **이 파일만** 바뀌고 화면·플로우는 한 줄도 안 바뀐다.
//
// ★2026-08-15 셸 전환 — 두 모드가 공존한다:
//   · 로컬 모드  : `apps/expense/server.js`(맥미니 launchd) 의 /api/*. 지금 실제로 돌고 있는 것.
//   · 원격 모드  : TM Edge 계약(`spend-edge-contract`). **아직 확정 전이라 «의도적으로 미구현»** 이다.
//     확정되면 아래 REMOTE 분기만 채운다. 셸·UI 는 그대로 간다.
//
// ★계약 v1.1 — 응답의 진행률은 pending/done/total(=pending+done) 3필드다.
//   위성은 done/total 로 그린다. 로컬 모드(server.js)는 progress 객체를 주므로 셸이 폴백한다.
// ★미구현을 «빈 데이터»로 위장하지 않는다 — 화면이 «데이터가 없다» 와 «아직 안 붙었다» 를
//   구분해서 말할 수 있어야 한다(오늘 반복해 다룬 형태).

const LOCAL_BASE = import.meta.env?.VITE_EXPENSE_API || ''
// 배포본(공개 호스팅)에서는 로컬 서버에 닿을 수 없다 ⇒ 원격 모드가 기본.
export const isRemote = import.meta.env?.VITE_EXPENSE_MODE === 'remote'
  || (typeof location !== 'undefined' && /github\.io|pages\.dev/.test(location.hostname))

class NotWiredError extends Error {
  constructor() {
    super('데이터 연결이 아직 붙지 않았습니다(Edge 계약 확정 대기)')
    this.body = { hint: '셸만 배포된 상태입니다. 계약이 확정되면 이 화면에 큐가 뜹니다.' }
  }
}

async function localReq(path, init) {
  const r = await fetch(LOCAL_BASE + path, { headers: { 'content-type': 'application/json' }, ...init })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(body.error || `HTTP ${r.status}`), { status: r.status, body })
  return body
}

/** 큐 + 이미 내린 판정이 «합쳐진» 상태로 온다. */
export const fetchQueue = () => {
  if (isRemote) throw new NotWiredError()   // ← 계약 확정 시 여기만 교체
  return localReq('/api/queue')
}

/**
 * 판정 저장. 멱등 — 같은 item_key 에 다른 category 를 다시 보내면 덮어쓴다.
 * ★'보류' 는 «보류라고 저장»이 아니라 **아무것도 남기지 않는다**(asset 계약 §3).
 */
export const putVerdict = (item_key, category, note = '') => {
  if (isRemote) throw new NotWiredError()   // ← 계약 확정 시 여기만 교체
  return localReq('/api/verdict', { method: 'POST', body: JSON.stringify({ item_key, category, note }) })
}

export const fetchVerdicts = () => {
  if (isRemote) throw new NotWiredError()
  return localReq('/api/verdicts')
}
