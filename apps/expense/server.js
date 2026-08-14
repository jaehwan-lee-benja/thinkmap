#!/usr/bin/env node
// 지출 분류 위성 — **로컬 상시 서버**(warroom 과 같은 성질).
//
// ★왜 로컬인가 (2026-08-14):
//   데이터가 «사업 재무»(품목명+금액)라 공유 DB·공개 gh-pages 에 두는 것은 유저 승인 게이트다.
//   그리고 원천이 asset 도메인의 **로컬 SQLite** 라 Edge 로 서빙할 수도 없다.
//   ⇒ 파일은 이 맥에 그대로 두고, 폰은 같은 와이파이에서 **화면만** 본다.
//      승인 게이트 0 · 공유 인프라 0 · asset 계약(파일 교환) 그대로.
//   ⚠제약: 맥미니가 켜져 있고 폰이 같은 와이파이일 때만 열린다(외부 접속 불가).
//
// 계약: asset/spend-queue@1  — `msg/spend-queue/queue.json`(asset 이 씀) / `verdicts.json`(우리가 씀)
// 실행: node apps/expense/server.js   → http://Mac-mini.local:5180
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const HOME = process.env.HOME
const DATA = join(HOME, 'claude-project', 'msg', 'spend-queue')
const QUEUE = join(DATA, 'queue.json')
const VERDICTS = join(DATA, 'verdicts.json')
const DIST = join(HERE, 'dist')
const PORT = Number(process.env.PORT || 5180)

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' }

const json = (res, code, body) => {
  const s = JSON.stringify(body)
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(s)
}

/** 판정 파일. 없으면 빈 계약으로 시작한다(첫 실행에서 죽지 않게). */
async function readVerdicts() {
  try {
    return JSON.parse(await readFile(VERDICTS, 'utf-8'))
  } catch {
    return { contract: 'thinkmap/spend-verdicts@1', updated_at: null, verdicts: {} }
  }
}

// ★쓰기 직렬화 — 폰에서 연타하면 요청이 겹친다. 겹친 채로 read-modify-write 하면
//   나중 것이 앞 것을 덮어써 판정이 «조용히» 사라진다. 큐 하나로 줄 세운다.
let writeChain = Promise.resolve()
const serialize = (fn) => (writeChain = writeChain.then(fn, fn))

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const path = url.pathname.replace(/^\/thinkmap\/expense/, '') || '/'

  try {
    // ── API ──────────────────────────────────────────────────────────────
    if (path === '/api/queue' && req.method === 'GET') {
      if (!existsSync(QUEUE)) return json(res, 503, { error: 'queue_not_ready', hint: `${QUEUE} 가 아직 없습니다(asset 이 생성)` })
      const q = JSON.parse(await readFile(QUEUE, 'utf-8'))
      const v = await readVerdicts()
      // 판정을 큐에 «합쳐서» 준다 — 화면이 두 파일을 맞출 필요가 없다.
      const items = (q.items || []).map((it) => ({ ...it, verdict: v.verdicts?.[it.item_key]?.category ?? null }))
      const decided = items.filter((i) => i.verdict && i.verdict !== '보류')
      const totalAmount = q.total_amount || items.reduce((s, i) => s + (i.amount || 0), 0)
      return json(res, 200, {
        ...q,
        items,
        // ★진행률은 «건수»와 «금액» 둘 다 준다. 건수만 보면 착시가 난다
        //   (1건짜리 100개를 해도 금액은 3%). 화면은 금액을 크게 쓴다.
        progress: {
          decided_count: decided.length,
          total_count: items.length,
          decided_amount: decided.reduce((s, i) => s + (i.amount || 0), 0),
          total_amount: totalAmount,
        },
      })
    }

    if (path === '/api/verdict' && req.method === 'POST') {
      const body = await new Promise((ok, no) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => ok(b)); req.on('error', no) })
      const { item_key, category, note } = JSON.parse(body || '{}')
      if (!item_key || !category) return json(res, 400, { error: 'item_key, category 필수' })
      const out = await serialize(async () => {
        const v = await readVerdicts()
        v.verdicts = v.verdicts || {}
        // ★«보류» 는 아무것도 남기지 않는다(asset 계약 §3): 억지 분류 하나가
        //   틀린 숫자를 조용히 섞고, 그건 나중에 되돌릴 수 없다. 미분류로 남는 게 낫다.
        if (category === '보류') delete v.verdicts[item_key]
        else v.verdicts[item_key] = { category, note: note || '', at: new Date().toISOString() }
        v.updated_at = new Date().toISOString()
        await mkdir(DATA, { recursive: true })
        await writeFile(VERDICTS, JSON.stringify(v, null, 2), 'utf-8')
        return v
      })
      return json(res, 200, { ok: true, item_key, category, decided: Object.keys(out.verdicts).length })
    }

    if (path === '/api/verdicts' && req.method === 'GET') return json(res, 200, await readVerdicts())

    // ── 정적 ─────────────────────────────────────────────────────────────
    const rel = path === '/' ? '/index.html' : path
    const file = join(DIST, rel)
    if (!file.startsWith(DIST)) return json(res, 403, { error: 'forbidden' })  // 경로 탈출 차단
    if (!existsSync(file)) {
      if (!existsSync(join(DIST, 'index.html'))) return json(res, 503, { error: 'not_built', hint: 'cd apps/expense && npm run build' })
      const html = await readFile(join(DIST, 'index.html'))
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-cache' })
      return res.end(html)
    }
    const buf = await readFile(file)
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' })
    res.end(buf)
  } catch (err) {
    console.error('[expense]', err)
    json(res, 500, { error: 'server_error', detail: String(err) })
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[expense] http://localhost:${PORT}  ·  http://Mac-mini.local:${PORT}  (폰은 같은 와이파이)`)
  console.log(`[expense] 큐   ${QUEUE} ${existsSync(QUEUE) ? '✓' : '✗ 없음'}`)
  console.log(`[expense] 판정 ${VERDICTS}`)
})
