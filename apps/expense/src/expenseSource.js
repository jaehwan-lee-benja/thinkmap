// 데이터 접근 «어댑터» — 화면은 이 파일만 통해 데이터를 만난다.
//
// ★왜 격리했나: 저장처가 «로컬 파일 → TM Edge» 로 옮겨갔다.
//   그 이관이 끝난 지금, 바뀐 건 **이 파일뿐**이고 화면·플로우는 한 줄도 안 바뀌었다. 설계가 값을 했다.
//
// 두 모드:
//   · 로컬 모드 : `apps/expense/server.js`(맥미니 launchd) 의 /api/*.
//   · 원격 모드 : TM Edge — 계약 `asset/spend-edge@1.1`. 공개 호스팅에서 기본.
//
// 계약 요점(응답):
//   큐   : pending / done / total(=pending+done) / items[] / next_cursor(마지막이면 null)
//   판정 : applied / rows_updated / skipped / unknown_keys[]  ← ★unknown_keys 를 조용히 버리지 않는다
import { supabase } from '@thinkmap/core'

const LOCAL_BASE = import.meta.env?.VITE_EXPENSE_API || ''
export const isRemote = import.meta.env?.VITE_EXPENSE_MODE === 'remote'
  || (typeof location !== 'undefined' && /github\.io|pages\.dev/.test(location.hostname))

async function localReq(path, init) {
  const r = await fetch(LOCAL_BASE + path, { headers: { 'content-type': 'application/json' }, ...init })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(body.error || `HTTP ${r.status}`), { status: r.status, body })
  return body
}

/**
 * Edge 호출. ★계약 §4 의 에러 코드를 «그대로» 위로 올린다 — 뭉개면 위성이 대응을 못 고른다.
 *   token_expired → 조용히 갱신 후 1회 재시도(사용자에게 안 묻는다)
 *   not_viewer(403) → 로그인 화면으로 «보내지 않는다»(무한 루프)
 */
async function edge(fn, { method = 'GET', body, query } = {}, retried = false) {
  const { data: s } = await supabase.auth.getSession()
  const token = s?.session?.access_token
  if (!token) throw Object.assign(new Error('로그인이 필요합니다.'), { code: 'no_token' })

  const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fn}`)
  for (const [k, v] of Object.entries(query || {})) if (v != null) url.searchParams.set(k, String(v))

  const r = await fetch(url, {
    method,
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const out = await r.json().catch(() => ({}))
  if (r.ok) return out

  // ★만료는 «사용자에게 묻지 않고» 한 번만 되살린다. 두 번 돌면 그건 다른 문제라 올린다.
  if (out?.code === 'token_expired' && !retried) {
    await supabase.auth.refreshSession()
    return edge(fn, { method, body, query }, true)
  }
  if (out?.code === 'rate_limited') {
    const wait = Number(r.headers.get('Retry-After') || 2)
    throw Object.assign(new Error(`요청이 많습니다. ${wait}초 후 다시 시도하세요.`), { code: out.code, retryAfter: wait })
  }
  throw Object.assign(new Error(out?.message || `HTTP ${r.status}`), { code: out?.code || 'server_error', status: r.status, body: out })
}

/** 큐 — 금액 내림차순. 커서는 서버가 준 next_cursor 를 그대로 되돌려준다(해석하지 않는다). */
export const fetchQueue = (cursor = null, limit = 50) =>
  isRemote ? edge('spend-queue', { query: { limit, cursor } }) : localReq('/api/queue')

/**
 * ★판정 «배치» 전송 — 계약 §5(240/min)에 맞추기 위한 디바운스의 종착점.
 *   품목 1건씩 보내면 «쭉 탭» 흐름에서 분당 상한에 닿는다. 모아서 한 번에 보낸다.
 */
export const putVerdicts = async (batch) => {
  if (!isRemote) {
    // 로컬 서버는 단건 API 라 순차로 푼다(로컬엔 상한이 없다).
    for (const v of batch) {
      await localReq('/api/verdict', { method: 'POST', body: JSON.stringify({ item_key: v.item_key, category: v.button }) })
    }
    return { applied: batch.length, rows_updated: 0, skipped: 0, unknown_keys: [] }
  }
  return edge('spend-verdicts', { method: 'POST', body: { verdicts: batch } })
}

/**
 * 디바운스 큐 — 탭을 모아 한 번에 보낸다.
 * ★같은 item_key 를 여러 번 탭하면 «마지막 것만» 남긴다(중간 판정을 보낼 이유가 없다).
 * ★flush 실패는 삼키지 않는다 — onError 로 올려 화면이 말하게 한다.
 */
// ★`send` 를 주입받는다 — 숨은 import 에 묶어 두면 «전송이 없는 환경»(테스트·노드)에서
//   큐 로직을 잴 수가 없다. 실제로 첫 시험이 전송 부재 때문에 red 였고, 그건 큐의 결함이 아니었다.
//   주입하면 «배치·중복제거·재시도»라는 이 함수의 실제 책임만 격리해서 검증된다.
export function createVerdictQueue({ waitMs = 400, send = putVerdicts, onFlushed, onError } = {}) {
  const pending = new Map()   // item_key → button
  let timer = null

  const flush = async () => {
    timer = null
    if (pending.size === 0) return
    const batch = [...pending.entries()].map(([item_key, button]) => ({ item_key, button }))
    pending.clear()
    try {
      const res = await send(batch)
      // ★unknown_keys 는 «조용히» 넘기지 않는다(계약 §2-2). 값이 있으면 화면이 표시한다.
      onFlushed?.(res, batch)
    } catch (e) {
      // 실패한 판정은 되돌려 넣는다 — 사용자가 다시 탭하지 않아도 다음 flush 에 실린다.
      for (const v of batch) if (!pending.has(v.item_key)) pending.set(v.item_key, v.button)
      onError?.(e, batch)
    }
  }

  return {
    push(item_key, button) {
      pending.set(item_key, button)
      if (timer) clearTimeout(timer)
      timer = setTimeout(flush, waitMs)
    },
    /** 화면을 떠나기 전에 남은 것을 밀어낸다 — «마지막 한 건이 안 날아가는» 창을 막는다. */
    flushNow: flush,
    get size() { return pending.size },
  }
}

export const fetchVerdicts = () => (isRemote ? edge('spend-verdicts', { method: 'GET' }) : localReq('/api/verdicts'))
