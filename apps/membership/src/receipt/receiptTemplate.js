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
  // ★한글은 프린터 코드페이지(EUC-KR 등) 의존 — Phase2에서 실기기 코드페이지 확정.
  //   생성기는 UTF-8 바이트로 넣고(placeholder), 실기기 확정 시 인코더만 교체(어댑터 포인트).
  if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(str))
  return Array.from(Buffer.from(str, 'utf8'))
}

export function buildEscpos(tpl, data) {
  const v = validateTemplate(tpl)
  if (!v.ok) throw new Error('invalid template: ' + v.errors.join(', '))
  const out = []
  const push = (...b) => out.push(...b)
  push(ESC, 0x40) // init

  for (const b of tpl.blocks) {
    if (!b.on) continue
    push(ESC, 0x61, b.align === 'center' ? 1 : 0) // 정렬
    switch (b.type) {
      case 'logo':
        // 비트맵 로고는 Phase2(실기기 코드페이지·GS v 0 확정 후). 텍스트 대체.
        push(ESC, 0x45, 1); push(...enc('사르르목장')); push(ESC, 0x45, 0, 0x0a)
        break
      case 'text': {
        if (b.bold) push(ESC, 0x45, 1)
        if (b.big) push(GS, 0x21, 0x11) // 2x2
        push(...enc(subst(b.text, data)), 0x0a)
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
      case 'stamp':
        push(...enc('스탬프 ' + (data.stamp || '') + '  (10개 = 아이스크림)'), 0x0a)
        break
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
