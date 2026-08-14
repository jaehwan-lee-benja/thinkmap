// 데이터 접근 «어댑터» — 화면은 이 파일만 통해 데이터를 만난다.
//
// ★왜 격리하나: MVP 는 로컬 파일(이 맥의 서버)이지만, 저장 위치 승인이 나면 Edge/DB 로 간다.
//   그때 **이 파일만** 갈아끼우면 화면·플로우는 한 줄도 안 바뀐다.
//   (오늘 우리가 배운 형태 — 바뀔 것을 한 곳에 가둔다.)
//
// 계약: asset/spend-queue@1

const BASE = import.meta.env?.VITE_EXPENSE_API || ''   // 같은 오리진(로컬 서버)이 기본

async function req(path, init) {
  const r = await fetch(BASE + path, { headers: { 'content-type': 'application/json' }, ...init })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(body.error || `HTTP ${r.status}`), { status: r.status, body })
  return body
}

/** 큐 + 이미 내린 판정이 «합쳐진» 상태로 온다. */
export const fetchQueue = () => req('/api/queue')

/**
 * 판정 저장. 멱등 — 같은 item_key 에 다른 category 를 다시 보내면 덮어쓴다.
 * ★'보류' 는 «보류라고 저장»이 아니라 **아무것도 남기지 않는다**(asset 계약 §3).
 */
export const putVerdict = (item_key, category, note = '') =>
  req('/api/verdict', { method: 'POST', body: JSON.stringify({ item_key, category, note }) })

export const fetchVerdicts = () => req('/api/verdicts')
