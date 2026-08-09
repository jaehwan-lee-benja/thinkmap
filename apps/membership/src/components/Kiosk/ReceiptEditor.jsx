// 영수증 레이아웃 편집기(간단판 — ?role=editor).
// ★접근 = **매장 계정 이상**(로그인 게이트 `is_master() OR is_store()` 그대로 — 별도 잠금 없음).
//   종전 주석은 「마스터 전용」이었으나 코드 게이트가 아니었다(G12 판정 2026-08-09: 현행 유지 채택).
//   유지 사유: 이 화면이 쓰는 건 그 기기의 localStorage 템플릿 1개뿐이고 [기본값]으로 즉시 복원된다.
//   반대로 마스터 전용으로 잠그면 커터·여백 진단을 매장에서 못 만진다(진단 경로가 끊긴다).
// 좌=블록 편집(순서 ↑↓·on/off·문구·정렬·바코드 크기·여백), 우=실물 비율 프리뷰(58/80mm 토글).
// 저장=템플릿 JSON(localStorage + 복사). ★프리뷰·실인쇄가 receiptTemplate 생성기 공유.
import { useState, useMemo } from 'react'
import {
  DEFAULT_TEMPLATE, validateTemplate, previewSequence, buildEscpos, escposToBase64, BLOCK_LABEL, migrateTemplate,
} from '../../receipt/receiptTemplate'
import { openRawbt, LS_KEY } from '../../receipt/print'   // ★저장키·인쇄 호출 = print.js 단일 소스
import { todayStr } from './kioskUtils'
const SAMPLE = { name: '홍*동', date: '2026-08-01 14:30', token: 'SR7K2M9QX4T2', stamp: '3/10' }

function loadTpl() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) { const t = JSON.parse(raw); if (validateTemplate(t).ok) return migrateTemplate(t) }
  } catch (e) { /* noop */ }
  return JSON.parse(JSON.stringify(DEFAULT_TEMPLATE))
}

// 의사 바코드(프리뷰 시각용 — 실인쇄는 프린터 CODE128 명령이라 스캔 정확성 불요).
function FakeBarcode({ token, height, moduleWidth }) {
  const bars = useMemo(() => {
    const out = []
    let seed = 7
    for (const ch of String(token)) seed = (seed * 31 + ch.charCodeAt(0)) % 9973
    for (let i = 0; i < 40; i++) { seed = (seed * 137 + 11) % 9973; out.push((seed % 3) + 1) }
    return out
  }, [token])
  let x = 0
  return (
    <svg width={bars.reduce((a, b) => a + b * moduleWidth + moduleWidth, 0)} height={height} aria-hidden="true">
      {bars.map((w, i) => {
        const rect = <rect key={i} x={x} y={0} width={w * moduleWidth} height={height} fill="#111" />
        x += w * moduleWidth + moduleWidth
        return rect
      })}
    </svg>
  )
}

export default function ReceiptEditor() {
  const [tpl, setTpl] = useState(loadTpl)
  const [savedMsg, setSavedMsg] = useState('')
  const val = validateTemplate(tpl)
  const seq = useMemo(() => previewSequence(tpl, { ...SAMPLE, date: todayStr() + ' 14:30' }), [tpl])
  const dots = tpl.width === 58 ? 384 : 576 // 열전사 도트폭(프리뷰 px 비율)

  const upd = (mut) => setTpl((prev) => { const n = JSON.parse(JSON.stringify(prev)); mut(n); return n })
  const move = (i, d) => upd((n) => {
    const j = i + d
    if (j < 0 || j >= n.blocks.length) return
    const t = n.blocks[i]; n.blocks[i] = n.blocks[j]; n.blocks[j] = t
  })

  const save = () => {
    const v = validateTemplate(tpl)
    if (!v.ok) { setSavedMsg('저장 거부: ' + v.errors.join(', ')); return }
    localStorage.setItem(LS_KEY, JSON.stringify(tpl))
    // ESC/POS 생성 확인(프리뷰=실인쇄 공유 생성기 — 생성 실패면 저장도 거부)
    try {
      const bytes = buildEscpos(tpl, SAMPLE)
      setSavedMsg('저장됨 · ESC/POS ' + bytes.length + ' bytes (base64 ' + escposToBase64(bytes).length + '자)')
    } catch (e) { setSavedMsg('저장 거부: 생성기 오류 — ' + e.message) }
  }

  // ★테스트 인쇄 — 저장본이 아니라 **지금 편집 중인 템플릿**으로 쏜다(저장 전에도 실물 확인 가능).
  //   결과는 단정하지 않는다(rawbt 스킴은 성공/실패를 안 알려준다 — print.js 주석).
  const testPrint = () => {
    const v = validateTemplate(tpl)
    if (!v.ok) { setSavedMsg('인쇄 거부: ' + v.errors.join(', ')); return }
    try {
      const b64 = escposToBase64(buildEscpos(tpl, { ...SAMPLE, date: todayStr() + ' 14:30' }))
      const r = openRawbt(b64)
      setSavedMsg(r
        ? '테스트 인쇄 요청됨 — 종이가 안 나오면 RawBT 설치/프린터 선택을 확인하세요.'
        : '인쇄를 시작하지 못했습니다(스킴 차단).')
    } catch (e) { setSavedMsg('인쇄 거부: 생성기 오류 — ' + e.message) }
  }

  return (
    <div className="mk-editor">
      <div className="mk-ed-panel">
        <div className="mk-ed-head">
          <h2>영수증 레이아웃</h2>
          <div className="mk-ed-width">
            <button className={tpl.width === 58 ? 'is-active' : ''} onClick={() => upd((n) => { n.width = 58 })}>58mm</button>
            <button className={tpl.width === 80 ? 'is-active' : ''} onClick={() => upd((n) => { n.width = 80 })}>80mm</button>
          </div>
          {/* ★컷 방언 — 프린터가 «급지 후 부분컷»(표준)을 모르면 여기서 바꿔 테스트한다.
              우리가 컷을 «보내는지»는 이미 확정됐다(페이로드 맨 끝) — 남는 변수는 기종이 아는 방언이다. */}
          <div className="mk-ed-width">
            {[['feed', '급지+부분컷'], ['full', '풀컷'], ['partial', '부분컷']].map(([m, label]) => (
              <button key={m} className={(tpl.cutMode || 'feed') === m ? 'is-active' : ''}
                onClick={() => upd((n) => { n.cutMode = m })}>{label}</button>
            ))}
          </div>
        </div>

        <div className="mk-ed-blocks">
          {tpl.blocks.map((b, i) => (
            <div key={i} className={`mk-ed-block ${b.on ? '' : 'is-off'}`}>
              <div className="mk-ed-row">
                <label className="mk-ed-on">
                  <input type="checkbox" checked={b.on} disabled={b.type === 'barcode'}
                    onChange={(e) => upd((n) => { n.blocks[i].on = e.target.checked })} />
                  <b>{BLOCK_LABEL[b.type] || b.type}</b>
                </label>
                <span className="mk-ed-ctl">
                  {b.type !== 'cut' && b.type !== 'feed' && (
                    <button onClick={() => upd((n) => { n.blocks[i].align = n.blocks[i].align === 'center' ? 'left' : 'center' })}>
                      {b.align === 'center' ? '중앙' : '좌측'}
                    </button>
                  )}
                  <button onClick={() => move(i, -1)}>↑</button>
                  <button onClick={() => move(i, 1)}>↓</button>
                </span>
              </div>
              {b.type === 'text' && (
                <div className="mk-ed-row">
                  <input className="mk-ed-text" type="text" value={b.text}
                    onChange={(e) => upd((n) => { n.blocks[i].text = e.target.value })} />
                  <label><input type="checkbox" checked={!!b.bold} onChange={(e) => upd((n) => { n.blocks[i].bold = e.target.checked })} /> 굵게</label>
                  <label><input type="checkbox" checked={!!b.big} onChange={(e) => upd((n) => { n.blocks[i].big = e.target.checked })} /> 크게</label>
                </div>
              )}
              {b.type === 'barcode' && (
                <div className="mk-ed-row">
                  <label>높이 <input type="number" min="30" max="255" value={b.height}
                    onChange={(e) => upd((n) => { n.blocks[i].height = Number(e.target.value) })} /></label>
                  <label>모듈폭 <input type="number" min="2" max="4" value={b.moduleWidth}
                    onChange={(e) => upd((n) => { n.blocks[i].moduleWidth = Number(e.target.value) })} /></label>
                </div>
              )}
              {b.type === 'qr' && (
                <div className="mk-ed-row">
                  <input className="mk-ed-text" type="text" value={b.url}
                    onChange={(e) => upd((n) => { n.blocks[i].url = e.target.value })} />
                  <label>크기 <input type="number" min="3" max="8" value={b.size}
                    onChange={(e) => upd((n) => { n.blocks[i].size = Number(e.target.value) })} /></label>
                </div>
              )}
              {b.type === 'feed' && (
                <div className="mk-ed-row">
                  <label>줄 수 <input type="number" min="1" max="8" value={b.lines}
                    onChange={(e) => upd((n) => { n.blocks[i].lines = Number(e.target.value) })} /></label>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mk-ed-actions">
          <button className="mk-signup-cta" onClick={save}>저장</button>
          {/* ★현장 프린터 검증용 — 회원·티켓 없이 지금 화면의 템플릿 그대로 실인쇄를 쏜다. */}
          <button className="mk-reset" onClick={testPrint}>테스트 인쇄</button>
          <button className="mk-reset" onClick={() => { setTpl(JSON.parse(JSON.stringify(DEFAULT_TEMPLATE))); setSavedMsg('기본값 복원') }}>기본값</button>
          <button className="mk-reset" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(JSON.stringify(tpl, null, 2)); setSavedMsg('JSON 복사됨') }}>JSON 복사</button>
        </div>
        {!val.ok && <div className="mk-err">{val.errors.join(' · ')}</div>}
        {savedMsg && <div className="mk-note">{savedMsg}</div>}
      </div>

      {/* 실물 비율 프리뷰 — previewSequence(ESC/POS 와 동일 블록 순회) */}
      <div className="mk-ed-preview-wrap">
        <div className="mk-ed-paper" style={{ width: dots / 2 + 'px' }}>
          {seq.map((s, i) => {
            if (s.kind === 'feed') return <div key={i} style={{ height: s.lines * 12 + 'px' }} />
            if (s.kind === 'cut') return <div key={i} className="mk-ed-cutline">✂──────────────</div>
            const style = { textAlign: s.align }
            if (s.kind === 'logo') return <div key={i} style={style}><img className="mk-ed-logo" src={`${import.meta.env.BASE_URL}img/cow-mark-white.png`} alt="" /></div>
            if (s.kind === 'barcode') return <div key={i} style={style}><FakeBarcode token={s.token} height={s.height / 2} moduleWidth={s.moduleWidth} /></div>
            if (s.kind === 'qr') return <div key={i} style={style}><div className="mk-ed-qr" style={{ width: s.size * 10, height: s.size * 10 }}>QR</div></div>
            return (
              <div key={i} style={{ ...style, fontWeight: s.bold ? 700 : 400, fontSize: s.big ? '18px' : '12px', fontFamily: s.mono ? 'monospace' : 'inherit' }}>
                {s.text}
              </div>
            )
          })}
        </div>
        <div className="mk-note">{tpl.width}mm ({dots}dot) · 프리뷰=실인쇄 동일 생성기</div>
      </div>
    </div>
  )
}
