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

// ★템플릿 버전(2026-08-06 신설): 저장본(localStorage)은 코드를 고쳐도 **옛 내용을 계속 쓴다**.
//   버전이 낮으면 loadTemplate 이 올려준다(아래 migrateTemplate) — 현장 태블릿에 이미 저장된
//   «옛 카피·컷 없는» 판이 조용히 살아남는 것을 막는다.
// v3(2026-08-09 구조 라운드): ⑴`cutMode` 를 템플릿에서 **프린터 설정으로 이관**(printerConfig.js)
//   — 컷 방언은 «이 기기 프린터의 성질»이고 템플릿은 «매장 공통 영수증 모양»이라 수명이 다르다.
//   ⑵저장 형식을 **명시 오버라이드**로 바꿨다(아래 diffFromDefault/mergeWithDefault).
export const TEMPLATE_VERSION = 3

export const DEFAULT_TEMPLATE = {
  version: TEMPLATE_VERSION,
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
    { type: 'text', on: true, align: 'center', text: '사르르목장에 숨은 게임을 경험해보세요!', bold: false, big: false },
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
// trim=true 면 **잉크가 없는 위·아래 행을 잘라낸다**.
// ★이유(2026-08-06): 래스터 전환으로 페이로드가 20KB(=base64 27KB URL)까지 커졌는데,
//   컷 명령(GS V)은 **스트림 맨 끝 4바이트**다. URL 이 어디서든 잘리면 **컷부터 사라진다**
//   — 현장에서 «다시 인쇄 시 컷 안 됨»으로 나타난 것과 정확히 일치하는 실패 모드다.
//   빈 행 제거는 판독 품질을 전혀 건드리지 않으면서 전송량을 크게 줄인다.
function canvasToRaster(ctx, w, h, trim, mode) {
  const img = ctx.getImageData(0, 0, w, h).data
  if (trim) {
    let top = 0, bot = h - 1
    const rowHasInk = (y) => {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        if (img[i] * 0.299 + img[i + 1] * 0.587 + img[i + 2] * 0.114 < 160) return true
      }
      return false
    }
    while (top < h && !rowHasInk(top)) top++
    while (bot > top && !rowHasInk(bot)) bot--
    if (top > 0 || bot < h - 1) {
      const nh = Math.max(1, bot - top + 1)
      const sub = ctx.getImageData(0, top, w, nh)
      return canvasToRaster({ getImageData: () => sub }, w, nh, false, mode)
    }
  }
  const bytesPerRow = Math.ceil(w / 8)
  const out = [GS, 0x76, 0x30, (mode | 0) & 0x03,
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
  // ★가로 여백까지 잘라내고 **위치 명령(ESC $)으로 배치**한다(2026-08-06).
  //   가운데 정렬 텍스트를 용지 전폭 캔버스로 보내면 좌우 빈 여백이 그대로 전송량이 된다.
  //   잉크 폭만 보내고 나머지는 «어디에 찍을지»만 알려주면 된다 — 판독 품질은 동일, 바이트는 급감.
  const measure = document.createElement('canvas').getContext('2d')
  const parts = []
  for (const l of lines) {
    let size = l.big ? 52 : 26
    const font = (px) => `${l.bold ? 'bold ' : ''}${px}px ${RASTER_FONT}`
    measure.font = font(size)
    let tw = measure.measureText(l.text).width
    if (tw > widthDots) {                    // 폭 초과 시 자동 축소(잘림 방지)
      size = Math.max(12, Math.floor(size * (widthDots / tw)))
      measure.font = font(size)
      tw = measure.measureText(l.text).width
    }
    parts.push({ ...l, size, tw: Math.min(widthDots, Math.ceil(tw) + 4) })
  }

  const out = []
  for (const pt of parts) {
    // ★큰 글씨는 **절반 해상도로 그려 프린터가 2배로 확대**해 찍는다(GS v 0 의 m=3).
    //   현장 실물에서 «큰 글씨 두 줄만 자모가 찢겨» 나왔다 = 최대 블록부터 전송이 끊긴 형상.
    //   인쇄 크기는 그대로면서 바이트는 **1/4**로 준다 — 절단 위험을 근본적으로 낮춘다.
    const dbl = !!pt.big
    const drawSize = dbl ? Math.max(12, Math.round(pt.size / 2)) : pt.size
    const scale = dbl ? 2 : 1
    const inkW = Math.max(8, Math.ceil(pt.tw / scale))
    const lh = Math.round(drawSize * 1.34)
    const canvas = document.createElement('canvas')
    canvas.width = inkW; canvas.height = lh
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, inkW, lh)
    ctx.fillStyle = '#000000'; ctx.textBaseline = 'top'
    ctx.font = `${pt.bold ? 'bold ' : ''}${drawSize}px ${RASTER_FONT}`
    ctx.fillText(pt.text, 0, Math.round((lh - drawSize) / 2))
    // 배치: 확대 후의 실제 폭(inkW*scale) 기준으로 가운데를 잡는다
    const printedW = inkW * scale
    const x = pt.align === 'center' ? Math.max(0, Math.round((widthDots - printedW) / 2)) : 0
    out.push(ESC, 0x24, x & 0xff, (x >> 8) & 0xff)      // ESC $ = 절대 위치
    out.push(...canvasToRaster(ctx, inkW, lh, true, dbl ? 3 : 0))   // m=3 → 가로·세로 2배
    out.push(0x0a)
  }
  return out
}

// ★컷 명령 방언(2026-08-08 현장: 「종이 잘림이 안 되고 있어」).
//   우리가 보내는 바이트는 계속 있었다(실측: 페이로드 **맨 끝** `1d 56 42 00` = GS V 66 0, 이후 0바이트).
//   ⇒ 코드 축은 깨끗하고 남는 변수는 **프린터가 그 방언을 아는지**다. `GS V 66 n`(컷 위치까지 급지 후
//   부분컷)은 현대 기종의 표준이지만 **구형·일부 기종은 `GS V 0/1`(급지 없는 풀/부분컷)만 안다.**
//   그래서 방언을 **값으로** 뺐다 — 현장에서 편집기에서 바꿔 테스트할 수 있고 재배포가 필요 없다.
//   값의 소유자는 «그 기기 프린터 설정»이다(printerConfig.js) — 템플릿(영수증 모양)과 수명이 다르다.
//   'feed'(기본) = GS V 66 0 · 'full' = GS V 0 · 'partial' = GS V 1 · 'none' = **미전송**
// ★'none' 이 필요한 이유(2026-08-09): RawBT/드라이버가 자체 후행 피드+자동컷을 하면
//   우리 컷과 합쳐 **컷 2회** → 사이에 빈 조각이 따로 잘려 나온다(8/08 현장 «빈 여백지 1장»).
//   컷 주체는 **하나여야 한다**. 종전 코드엔 「맡긴다」를 표현할 방법이 아예 없었다 = 구조 결함.
// @returns {boolean} 실제로 컷 바이트를 냈는지
function pushCut(push, cut) {
  if (cut === 'none') return false
  if (cut === 'full') { push(GS, 0x56, 0); return true }
  if (cut === 'partial') { push(GS, 0x56, 1); return true }
  push(GS, 0x56, 66, 0)
  return true
}

/**
 * ESC/POS 바이트 생성.
 * @param {object} tpl  영수증 모양(블록·폭)
 * @param {object} data {name,date,token,stamp}
 * @param {{cut?:string}} [cfg] 그 기기 프린터 설정 — 컷 방언. 생략 시 'feed'(코드 정본 기본값).
 *   ★옛 저장본 호환: cfg 가 없고 tpl.cutMode 가 남아 있으면 그것을 쓴다(마이그레이션 전 1회성 경로).
 */
export function buildEscpos(tpl, data, cfg) {
  const v = validateTemplate(tpl)
  if (!v.ok) throw new Error('invalid template: ' + v.errors.join(', '))
  const cut = (cfg && cfg.cut) || (tpl && tpl.cutMode) || 'feed'
  const out = []
  const push = (...b) => out.push(...b)
  // ★용지폭이 이제 실제 출력에 반영된다(종전엔 58/80 토글이 프리뷰만 바꾸고 바이트엔 미반영이었다).
  const DOTS = RASTER_DOTS[tpl.width] || RASTER_DOTS[80]
  const RASTER = canRaster()   // 브라우저=래스터(한글 안전) / node·구형=텍스트 폴백
  let cutEmitted = false       // ★컷은 아래에서 «구조가 보장»한다(템플릿 선택사항 아님)
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
        cutEmitted = pushCut(push, cut) || cutEmitted
        break
    }
  }
  // ★컷 불변 조항(2026-08-06 현장 결함): 저장된 템플릿에 cut 블록이 없거나 off 여도
  //   **종이는 반드시 잘린다**. validateTemplate 은 폭·바코드만 보므로 컷 없는 옛 저장본이
  //   그대로 통과해 왔다. «있어야 하는 것은 구조가 보장한다».
  //   중복 컷 가드: 템플릿이 이미 컷을 냈으면 추가하지 않는다.
  // ★단 cut='none' 은 예외다 — 그건 «컷을 안 냄»이 **의도**(RawBT 가 컷 주체)이므로
  //   불변 조항이 그 의도를 덮으면 컷 2회 문제를 영원히 못 고친다. 불변 조항은 «사고 방지»용이고,
  //   'none' 은 사고가 아니라 선언이다. 이 구분이 없던 게 이번 라운드의 F1 결함이다.
  if (!cutEmitted && cut !== 'none') { push(0x0a, 0x0a); pushCut(push, cut) }
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
// ★cfg 를 받는 이유: `cut='none'` 이면 우리는 컷을 **안 보낸다**. 그때도 프리뷰가 ✂ 를 그대로 그리면
//   「프리뷰=실인쇄」 규율이 깨진다(화면은 우리가 자른다 하고 실물은 RawBT 가 자른다).
//   ⇒ 컷 줄에 «누가 자르는지»를 실어 보낸다.
export function previewSequence(tpl, data, cfg) {
  const cut = (cfg && cfg.cut) || (tpl && tpl.cutMode) || 'feed'
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
      case 'cut':     seq.push({ kind: 'cut', by: cut === 'none' ? 'rawbt' : 'us', cut }); break
    }
  }
  return seq
}

export const BLOCK_LABEL = {
  logo: '로고', text: '텍스트', barcode: '★토큰 바코드', token: '토큰 문자열',
  qr: '게임 QR', stamp: '스탬프 현황', feed: '여백', cut: '용지 컷',
}

// ── 저장본 마이그레이션 ──────────────────────────────────────────────────────
// 코드 변경만으로는 기기에 저장된 템플릿이 안 바뀐다. 저장본을 읽는 지점에서 올려준다.
//   v2: ⑴보상 미끼 카피 → 경험·안내 카피(브랜드 보이스) ⑵cut 블록 없으면 주입(현장 결함 대응).
const COPY_MIGRATIONS = [
  { from: /게임\s*5[,，]?000점\s*넘기면\s*팝콘\s*1개\s*더!?/, to: '사르르목장에 숨은 게임을 경험해보세요!' },
]

export function migrateTemplate(tpl) {
  if (!tpl || !Array.isArray(tpl.blocks)) return tpl
  if (tpl.version >= TEMPLATE_VERSION) return tpl
  const t = JSON.parse(JSON.stringify(tpl))
  for (const b of t.blocks) {
    if (b.type !== 'text' || typeof b.text !== 'string') continue
    for (const m of COPY_MIGRATIONS) if (m.from.test(b.text)) b.text = m.to
  }
  if (!t.blocks.some((b) => b.type === 'cut')) t.blocks.push({ type: 'cut', on: true, align: 'left' })
  t.version = TEMPLATE_VERSION
  return t
}

// ── ★저장 = «명시 오버라이드»만 (2026-08-09 구조 라운드) ─────────────────────
// 문제: 종전엔 편집기가 템플릿을 **통째로** 저장했다. 그래서 한 번 저장한 기기는
//   코드에서 블록·문구를 개선해도 **영원히 옛 판**을 썼다(= 같은 코드, 다른 출력).
//   migrateTemplate 은 그 구멍을 사후에 하나씩 막는 붕대였을 뿐 원인은 «통째 저장»이다.
// ⇒ 저장분에는 **기본값과 다른 키만** 남긴다. 없는 키는 언제나 코드 기본값을 쓴다.
//   ⇒ 기본값 개선이 저장분 있는 기기에도 그대로 흘러들고, 막는 것은 «일부러 다르게 둔 것»뿐이다.
// blocks 는 배열이라 키 단위 diff 가 무의미하므로 **통째 오버라이드**로 다룬다(같으면 저장 안 함).
const SCALAR_KEYS = ['width']

function sameJson(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b) } catch (e) { return false }
}

/** 편집 중 템플릿 → 저장할 오버라이드 객체. 기본값과 같은 부분은 빠진다. */
export function diffFromDefault(tpl) {
  const out = { version: TEMPLATE_VERSION }
  for (const k of SCALAR_KEYS) {
    if (tpl && tpl[k] !== undefined && tpl[k] !== DEFAULT_TEMPLATE[k]) out[k] = tpl[k]
  }
  if (tpl && Array.isArray(tpl.blocks) && !sameJson(tpl.blocks, DEFAULT_TEMPLATE.blocks)) {
    out.blocks = JSON.parse(JSON.stringify(tpl.blocks))
  }
  return out
}

/** 저장분(오버라이드) → 실제 사용 템플릿. 저장분이 없거나 깨졌으면 순수 기본값. */
export function mergeWithDefault(saved) {
  const base = JSON.parse(JSON.stringify(DEFAULT_TEMPLATE))
  if (!saved || typeof saved !== 'object') return base
  // 옛 저장본(v2 이하, 통째 저장)은 마이그레이션을 태워 그 내용을 존중한다 —
  // 현장 태블릿이 이미 손으로 맞춘 모양을 이 전환으로 날려버리지 않는다.
  const s = (saved.version || 0) < TEMPLATE_VERSION ? migrateTemplate(saved) : saved
  for (const k of SCALAR_KEYS) if (s[k] !== undefined) base[k] = s[k]
  if (Array.isArray(s.blocks) && s.blocks.length) base.blocks = JSON.parse(JSON.stringify(s.blocks))
  base.version = TEMPLATE_VERSION
  return base
}

/** 저장분이 기본값에서 무엇을 덮고 있는지(화면 표시용). */
export function templateOverrides(saved) {
  if (!saved || typeof saved !== 'object') return []
  const out = []
  for (const k of SCALAR_KEYS) if (saved[k] !== undefined && saved[k] !== DEFAULT_TEMPLATE[k]) out.push(k)
  if (Array.isArray(saved.blocks) && !sameJson(saved.blocks, DEFAULT_TEMPLATE.blocks)) out.push('blocks')
  return out
}
