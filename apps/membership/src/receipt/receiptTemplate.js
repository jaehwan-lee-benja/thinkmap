// 영수증 템플릿 — 스키마·검증·ESC/POS 생성기·프리뷰 시퀀스 (단일 소스).
// ★프리뷰와 실인쇄가 같은 블록 순회를 공유한다(미리보기≠실물 어긋남 방지).
//   순수 JS(DOM/브라우저 API 무의존) → 시나리오 러너(node, S10)에서도 그대로 검증.
// 인쇄 어댑터: ESC/POS 우선(RawBT 경로 가정, Phase0 권고 ⓒ). ⓐ폴백은 renderBlocks 로 HTML 렌더.
//
// 템플릿 = { width: 58|80, blocks: [...] }  블록 공통: {type, on, align('left'|'center')}
//   logo   {}                      — 로고(모노). ESC/POS 는 텍스트 대체(비트맵은 Phase2)
//   text   {text, bold, big}      — 텍스트 줄({name}·{date}·{stamp} 치환)
//   barcode{height, moduleWidth}  — ★CODE128 토큰(필수 블록)
//   token  {}                      — 토큰 문자열(리더 실패 시 수기 입력용)
//   qr     {url, size}            — 게임 QR
//   stamp  {}                      — 스탬프 현황 n/10
//   feed   {lines}                 — 여백(줄)
//   cut    {}                      — 용지 컷

export const DEFAULT_TEMPLATE = {
  width: 80, // mm (58|80)
  blocks: [
    { type: 'logo', on: true, align: 'center' },
    { type: 'text', on: true, align: 'center', text: '팝콘 이벤트 참여권', bold: true, big: true },
    { type: 'text', on: true, align: 'center', text: '{name} · {date}', bold: false, big: false },
    { type: 'feed', on: true, lines: 1 },
    { type: 'barcode', on: true, align: 'center', height: 80, moduleWidth: 2 },
    { type: 'token', on: true, align: 'center' },
    { type: 'feed', on: true, lines: 1 },
    { type: 'qr', on: true, align: 'center', url: 'https://jaehwan-lee-benja.github.io/saruru-game/?utm=receipt', size: 5 },
    { type: 'text', on: true, align: 'center', text: '게임 5,000점 넘기면 팝콘 1개 더!', bold: false, big: false },
    { type: 'feed', on: true, lines: 1 },
    { type: 'stamp', on: true, align: 'center' },
    { type: 'text', on: true, align: 'center', text: '유효기간: 발행 당일', bold: false, big: false },
    { type: 'feed', on: true, lines: 3 },
    { type: 'cut', on: true, align: 'left' },
  ],
}

// 문구 치환: {name} {date} {token} {stamp}
function subst(text, data) {
  return String(text)
    .replace(/\{name\}/g, data.name || '')
    .replace(/\{date\}/g, data.date || '')
    .replace(/\{token\}/g, data.token || '')
    .replace(/\{stamp\}/g, data.stamp || '')
}

// ── 검증: 필수 블록(CODE128 토큰 바코드) 누락 시 저장 거부(S10) ─────────────
export function validateTemplate(tpl) {
  const errors = []
  if (!tpl || tpl.width !== 58 && tpl.width !== 80) errors.push('width는 58 또는 80')
  const blocks = (tpl && tpl.blocks) || []
  if (!blocks.some((b) => b.type === 'barcode' && b.on)) errors.push('★토큰 바코드(CODE128) 블록은 끌 수 없습니다')
  return { ok: errors.length === 0, errors }
}

// ── ESC/POS 생성기 ───────────────────────────────────────────────────────────
const ESC = 0x1b, GS = 0x1d
function enc(str) {
  // ASCII 전용 폴백 경로에서만 쓴다(아래 래스터 주석 참조).
  if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(str))
  return Array.from(Buffer.from(str, 'utf8'))
}

// ── ★한글 텍스트 = 래스터(GS v 0) — 2026-08-06 현장 실측 대응 ────────────────
// 현장 사실: USB 유선(RawBT USB + ESC/POS general)은 **raw 패스스루**라 프린터 코드페이지에
//   한글이 없으면 그대로 모지바케가 된다(헤더·안내문 전멸. 숫자·날짜·바코드는 정상).
//   BT 경로에선 RawBT 가 비트맵으로 바꿔줘서 이 문제가 가려져 있었다.
// ⇒ **텍스트 블록만** 캔버스에 한글 폰트로 그려 1비트 래스터로 내보낸다 = 코드페이지 의존 0.
// ★바코드(GS k)·QR(GS ( k)은 **프린터 네이티브 그대로 둔다** — 스캐너 판독이 실측 검증된 경로라
//   건드리지 않는다(판독 리스크 > 폰트 통일 이득).
const RASTER_DOTS = { 58: 384, 80: 576 }   // 용지폭 → 인쇄 도트폭
const RASTER_FONT = '"GmarketSansMedium","G마켓 산스",-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif'

function canRaster() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function'
}

// 캔버스 픽셀 → GS v 0 래스터 바이트(1비트, 임계값 이진화)
function canvasToRaster(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h).data
  const bytesPerRow = Math.ceil(w / 8)
  const out = [GS, 0x76, 0x30, 0,
    bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
    h & 0xff, (h >> 8) & 0xff]
  for (let y = 0; y < h; y++) {
    for (let bx = 0; bx < bytesPerRow; bx++) {
      let byte = 0
      for (let bit = 0; bit < 8; bit++) {
        const x = bx * 8 + bit
        if (x >= w) continue
        const i = (y * w + x) * 4
        const lum = img[i] * 0.299 + img[i + 1] * 0.587 + img[i + 2] * 0.114
        if (lum < 160) byte |= 0x80 >> bit      // 어두우면 점을 찍는다
      }
      out.push(byte)
    }
  }
  return out
}

// 한 줄(또는 여러 줄) 텍스트를 용지폭 캔버스에 그려 래스터로.
// 정렬은 **캔버스 안에서** 처리한다(ESC a 에 의존하지 않아 프린터 편차가 없다).
function rasterText(lines, widthDots) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const BASE = 26
  const metrics = lines.map((l) => {
    const size = l.big ? BASE * 2 : BASE
    return { ...l, size, lh: Math.round(size * 1.34) }
  })
  const height = Math.max(1, metrics.reduce((a, m) => a + m.lh, 0))
  canvas.width = widthDots
  canvas.height = height
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, widthDots, height)
  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'top'
  let y = 0
  for (const m of metrics) {
    // ★용지폭 초과 시 자동 축소(2026-08-06): 큰 글씨("팝콘 이벤트 참여권" 2배)가 384dot 을 넘어
    //   **마지막 글자가 잘렸다**(래스터 디코드 육안 검증에서 발견 — 바이트 검사로는 안 잡힌다).
    //   종이 밖으로 나가느니 줄여서 다 보이게 한다.
    let size = m.size
    ctx.font = `${m.bold ? 'bold ' : ''}${size}px ${RASTER_FONT}`
    let tw = ctx.measureText(m.text).width
    if (tw > widthDots) {
      size = Math.max(12, Math.floor(size * (widthDots / tw)))
      ctx.font = `${m.bold ? 'bold ' : ''}${size}px ${RASTER_FONT}`
      tw = ctx.measureText(m.text).width
    }
    const x = m.align === 'center' ? Math.max(0, Math.round((widthDots - tw) / 2)) : 0
    ctx.fillText(m.text, x, y + Math.round((m.lh - size) / 2))
    y += m.lh
  }
  return canvasToRaster(ctx, widthDots, height)
}

export function buildEscpos(tpl, data) {
  const v = validateTemplate(tpl)
  if (!v.ok) throw new Error('invalid template: ' + v.errors.join(', '))
  const out = []
  const push = (...b) => out.push(...b)
  // ★용지폭이 이제 실제 출력에 반영된다(종전엔 58/80 토글이 프리뷰만 바꾸고 바이트엔 미반영이었다).
  const DOTS = RASTER_DOTS[tpl.width] || RASTER_DOTS[80]
  const RASTER = canRaster()   // 브라우저=래스터(한글 안전) / node·구형=텍스트 폴백
  push(ESC, 0x40) // init

  for (const b of tpl.blocks) {
    if (!b.on) continue
    push(ESC, 0x61, b.align === 'center' ? 1 : 0) // 정렬
    switch (b.type) {
      case 'logo':
        if (RASTER) { push(ESC, 0x61, 0); push(...rasterText([{ text: '사르르목장', bold: true, big: true, align: b.align }], DOTS)); push(0x0a) }
        else { push(ESC, 0x45, 1); push(...enc('사르르목장')); push(ESC, 0x45, 0, 0x0a) }
        break
      case 'text': {
        const line = subst(b.text, data)
        if (RASTER) {
          // ★래스터 = 한글 안전. 정렬을 캔버스에서 처리하므로 ESC a 는 0(왼쪽)으로 되돌린다.
          push(ESC, 0x61, 0)
          push(...rasterText([{ text: line, bold: !!b.bold, big: !!b.big, align: b.align }], DOTS))
          push(0x0a)
          break
        }
        if (b.bold) push(ESC, 0x45, 1)
        if (b.big) push(GS, 0x21, 0x11) // 2x2
        push(...enc(line), 0x0a)
        if (b.big) push(GS, 0x21, 0x00)
        if (b.bold) push(ESC, 0x45, 0)
        break
      }
      case 'barcode': {
        const h = Math.max(30, Math.min(255, b.height | 0 || 80))
        const w = Math.max(2, Math.min(4, b.moduleWidth | 0 || 2))
        push(GS, 0x68, h)          // 높이
        push(GS, 0x77, w)          // 모듈폭
        push(GS, 0x48, 0)          // HRI 미표시(토큰 줄 별도)
        const payload = enc('{B' + data.token) // CODE128 code B
        push(GS, 0x6b, 73, payload.length, ...payload) // GS k 73(CODE128)
        push(0x0a)
        break
      }
      case 'token':
        push(...enc(data.token || ''), 0x0a)
        break
      case 'qr': {
        const size = Math.max(3, Math.min(8, b.size | 0 || 5))
        const url = enc(b.url || '')
        const len = url.length + 3
        push(GS, 0x28, 0x6b, 4, 0, 49, 65, 50, 0)                    // 모델2
        push(GS, 0x28, 0x6b, 3, 0, 49, 67, size)                     // 크기
        push(GS, 0x28, 0x6b, 3, 0, 49, 69, 48)                       // 오류정정 L
        push(GS, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 49, 80, 48, ...url) // 데이터
        push(GS, 0x28, 0x6b, 3, 0, 49, 81, 48)                       // 인쇄
        push(0x0a)
        break
      }
      case 'stamp': {
        const st = '스탬프 ' + (data.stamp || '')
        if (RASTER) { push(ESC, 0x61, 0); push(...rasterText([{ text: st, bold: false, big: false, align: b.align }], DOTS)); push(0x0a) }
        else push(...enc(st), 0x0a)
        break
      }
      case 'feed':
        for (let i = 0; i < (b.lines | 0 || 1); i++) push(0x0a)
        break
      case 'cut':
        push(GS, 0x56, 66, 0) // partial cut
        break
    }
  }
  return Uint8Array.from(out)
}

// base64 (RawBT rawbt:base64,... 스킴용) — node·브라우저 겸용
export function escposToBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64')
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

// ── 프리뷰 시퀀스 — ESC/POS 와 같은 블록 순회를 UI 렌더용으로 변환 ──────────
export function previewSequence(tpl, data) {
  const seq = []
  for (const b of tpl.blocks) {
    if (!b.on) continue
    const align = b.align === 'center' ? 'center' : 'left'
    switch (b.type) {
      case 'logo':    seq.push({ kind: 'logo', align }); break
      case 'text':    seq.push({ kind: 'text', align, text: subst(b.text, data), bold: !!b.bold, big: !!b.big }); break
      case 'barcode': seq.push({ kind: 'barcode', align, height: b.height || 80, moduleWidth: b.moduleWidth || 2, token: data.token }); break
      case 'token':   seq.push({ kind: 'text', align, text: data.token || '', bold: false, big: false, mono: true }); break
      case 'qr':      seq.push({ kind: 'qr', align, size: b.size || 5, url: b.url }); break
      case 'stamp':   seq.push({ kind: 'text', align, text: '스탬프 ' + (data.stamp || '') + '  (10개 = 아이스크림)', bold: false, big: false }); break
      case 'feed':    seq.push({ kind: 'feed', lines: b.lines || 1 }); break
      case 'cut':     seq.push({ kind: 'cut' }); break
    }
  }
  return seq
}

export const BLOCK_LABEL = {
  logo: '로고', text: '텍스트', barcode: '★토큰 바코드', token: '토큰 문자열',
  qr: '게임 QR', stamp: '스탬프 현황', feed: '여백', cut: '용지 컷',
}
