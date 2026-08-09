// 영수증 레이아웃 편집기(간단판 — ?role=editor).
// ★접근 = **매장 계정 이상**(로그인 게이트 `is_master() OR is_store()` 그대로 — 별도 잠금 없음).
//   종전 주석은 「마스터 전용」이었으나 코드 게이트가 아니었다(G12 판정 2026-08-09: 현행 유지 채택).
//   유지 사유: 이 화면이 쓰는 건 그 기기의 localStorage 템플릿 1개뿐이고 [기본값]으로 즉시 복원된다.
//   반대로 마스터 전용으로 잠그면 커터·여백 진단을 매장에서 못 만진다(진단 경로가 끊긴다).
// 좌=블록 편집(순서 ↑↓·on/off·문구·정렬·바코드 크기·여백), 우=실물 비율 프리뷰(58/80mm 토글).
// 저장=템플릿 JSON(localStorage + 복사). ★프리뷰·실인쇄가 receiptTemplate 생성기 공유.
import { useState, useMemo } from 'react'
import {
  DEFAULT_TEMPLATE, validateTemplate, previewSequence, buildEscpos, escposToBase64, BLOCK_LABEL,
  templateOverrides,
} from '../../receipt/receiptTemplate'
// ★인쇄·저장·설정은 전부 어댑터를 지난다(print.js 단일 진입점 — 이 화면도 예외가 아니다).
import { printReceipt, loadTemplate, saveTemplate } from '../../receipt/print'
import { loadConfig, saveConfig, DEFAULT_CONFIG, configOverrides } from '../../receipt/printerConfig'
import { readPrintLog, clearPrintLog } from '../../receipt/printLog'
import { todayStr } from './kioskUtils'
const SAMPLE = { name: '홍*동', date: '2026-08-01 14:30', token: 'SR7K2M9QX4T2', stamp: '3/10' }

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
  const [tpl, setTpl] = useState(loadTemplate)
  // ★프린터 설정 = 템플릿과 **별개 축**(그 기기 프린터의 성질). 저장도 따로 간다.
  const [cfg, setCfg] = useState(loadConfig)
  const [savedMsg, setSavedMsg] = useState('')
  const [log, setLog] = useState(() => readPrintLog())
  const [showLog, setShowLog] = useState(false)
  const val = validateTemplate(tpl)
  const seq = useMemo(() => previewSequence(tpl, { ...SAMPLE, date: todayStr() + ' 14:30' }, cfg), [tpl, cfg])
  const dots = tpl.width === 58 ? 384 : 576 // 열전사 도트폭(프리뷰 px 비율)

  const upd = (mut) => setTpl((prev) => { const n = JSON.parse(JSON.stringify(prev)); mut(n); return n })
  const move = (i, d) => upd((n) => {
    const j = i + d
    if (j < 0 || j >= n.blocks.length) return
    const t = n.blocks[i]; n.blocks[i] = n.blocks[j]; n.blocks[j] = t
  })

  // ★설정 변경은 **즉시 저장**한다 — 현장에서 방언을 바꿔 [테스트 인쇄]로 바로 가르는 흐름이라
  //   «바꿨는데 저장을 안 눌러서 그대로였다»가 그 자체로 진단을 오염시킨다.
  const updCfg = (patch) => setCfg((prev) => saveConfig({ ...prev, ...patch }))

  const save = () => {
    const v = validateTemplate(tpl)
    if (!v.ok) { setSavedMsg('저장 거부: ' + v.errors.join(', ')); return }
    // ★기본값과 **다른 부분만** 저장한다(receiptTemplate.diffFromDefault 주석 — 통째 저장이 «낡은 저장본» 원인).
    const diff = saveTemplate(tpl)
    const ov = templateOverrides(diff)
    // ESC/POS 생성 확인(프리뷰=실인쇄 공유 생성기 — 생성 실패면 저장도 거부)
    try {
      const bytes = buildEscpos(tpl, SAMPLE, cfg)
      setSavedMsg('저장됨 · 기본값과 다른 항목: ' + (ov.length ? ov.join(', ') : '없음(순수 기본값)')
        + ' · ESC/POS ' + bytes.length + ' bytes (base64 ' + escposToBase64(bytes).length + '자)')
    } catch (e) { setSavedMsg('저장 거부: 생성기 오류 — ' + e.message) }
  }

  // ★테스트 인쇄 — 저장본이 아니라 **지금 편집 중인 템플릿·설정**으로 쏜다(저장 전에도 실물 확인 가능).
  //   ★단 호출 경로는 실인쇄와 **완전히 동일**하다(printReceipt) — 경로가 갈리면 「테스트는 되는데
  //     실제는 안 된다」에서 차이를 배제할 수 없다. 기록도 같은 블랙박스에 남는다(source='test').
  //   결과는 단정하지 않는다(rawbt 스킴은 성공/실패를 안 알려준다 — print.js 주석).
  const testPrint = () => {
    const v = validateTemplate(tpl)
    if (!v.ok) { setSavedMsg('인쇄 거부: ' + v.errors.join(', ')); return }
    const r = printReceipt({ ...SAMPLE, date: todayStr() + ' 14:30' }, { source: 'test', template: tpl, config: cfg })
    setLog(readPrintLog())
    if (r.ok) {
      setSavedMsg('테스트 인쇄 요청됨(' + r.bytes + ' bytes · 컷=' + r.cut + ' · 경로=' + r.resolved + ')'
        + ' — 종이가 안 나오면 RawBT 설치/프린터 선택을 확인하세요.')
    } else {
      setSavedMsg('인쇄를 시작하지 못했습니다 — ' + r.reason)
    }
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
        </div>

        {/* ★프린터 설정 — 영수증 «모양»이 아니라 **이 기기에 붙은 프린터의 성질**이다.
            그래서 템플릿과 저장 위치가 다르고(printerConfig), [기본값] 복원에도 안 딸려간다. */}
        <div className="mk-ed-cfg">
          <div className="mk-ed-cfg-row">
            <b>컷 방식</b>
            <div className="mk-ed-width">
              {[['feed', '급지+부분컷'], ['full', '풀컷'], ['partial', '부분컷'], ['none', '컷 안 보냄']].map(([m, label]) => (
                <button key={m} className={cfg.cut === m ? 'is-active' : ''}
                  onClick={() => updCfg({ cut: m })}>{label}</button>
              ))}
            </div>
          </div>
          {/* «컷 안 보냄»의 용도를 화면에서 알려준다 — 이 선택지가 없어서 컷 2회 문제를 못 고쳤다. */}
          <div className="mk-note">
            {cfg.cut === 'none'
              ? '컷을 우리가 보내지 않습니다 — RawBT/드라이버의 자동 컷이 자릅니다. 「컷 뒤에 빈 종이가 한 장 더 나온다」거나 「하단에 V 글자가 찍힌다」면 이쪽입니다(컷 주체를 하나로).'
              : '종이가 안 잘리면 방식을 바꿔 [테스트 인쇄]로 가릅니다. 컷 뒤에 빈 조각이 따로 나오면 = 컷이 두 번(우리+RawBT) → 「컷 안 보냄」.'}
          </div>
          {/* ★영수증 하단 글자 = 컷 명령이 «글자로 새는» 신호(유저 신고 2026-08-09: 「아래에 브이가 하나」).
              컷 시퀀스는 GS V n 이고 **0x56 = 'V'** 다. 프린터가 이 방언을 모르면 GS 를 무시하고
              인자를 문자로 흘려 찍는다 ⇒ 글자 수가 방언을 특정한다. 현장에서 바로 읽히게 화면에 둔다. */}
          {cfg.cut !== 'none' && (
            <div className="mk-note">
              지금 설정에서 컷 명령이 글자로 새면 하단에{' '}
              <b>{cfg.cut === 'feed' ? 'VB 두 글자' : 'V 한 글자'}</b>가 찍힙니다
              {' '}— 그건 이 프린터가 «{cfg.cut === 'feed' ? '급지+부분컷' : cfg.cut === 'full' ? '풀컷' : '부분컷'}»을 모른다는 뜻입니다.
              {' '}<b>「컷 안 보냄」</b>으로 두면 그 글자가 사라집니다.
            </div>
          )}
          <div className="mk-ed-cfg-row">
            <b>스킴 호출</b>
            <div className="mk-ed-width">
              {[['auto', '자동'], ['iframe', 'iframe(화면 안전)'], ['href', '주소 이동']].map(([m, label]) => (
                <button key={m} className={cfg.scheme === m ? 'is-active' : ''}
                  onClick={() => updCfg({ scheme: m })}>{label}</button>
              ))}
            </div>
          </div>
          <div className="mk-note">
            iframe = RawBT 가 응답하지 않아도 키오스크 화면이 살아남습니다(주소 이동은 오류 화면으로 바뀔 수 있음).
            인쇄가 아예 안 되면 «자동»/«주소 이동»으로 되돌리세요.
          </div>
          <div className="mk-note">
            이 기기에서 기본값과 다른 설정: <b>{Object.keys(configOverrides(cfg)).length
              ? JSON.stringify(configOverrides(cfg))
              : '없음'}</b>
            {Object.keys(configOverrides(cfg)).length > 0 && (
              <button className="mk-reset" style={{ marginLeft: 8 }}
                onClick={() => { setCfg(saveConfig({ ...DEFAULT_CONFIG })); setSavedMsg('프린터 설정을 기본값으로') }}>설정 초기화</button>
            )}
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
          <button className="mk-reset" onClick={() => { setLog(readPrintLog()); setShowLog((s) => !s) }}>
            인쇄 기록 {showLog ? '닫기' : `(${log.length})`}
          </button>
        </div>
        {!val.ok && <div className="mk-err">{val.errors.join(' · ')}</div>}
        {savedMsg && <div className="mk-note">{savedMsg}</div>}

        {/* ★블랙박스 — 「불안정」 신고가 오면 이 표가 «어느 기기·어느 설정·어느 페이로드»를 되살린다.
            스킴은 결과를 안 알려주므로 결과 열은 «시도»까지다(그 한계도 화면에 적어 둔다). */}
        {showLog && (
          <div className="mk-ed-log">
            <div className="mk-note">
              최근 {log.length}건(이 기기). ok = «호출을 시도함»이지 종이가 나왔다는 뜻이 아닙니다 — RawBT 는 결과를 알려주지 않습니다.
              토큰은 끝 4자만 남깁니다.
            </div>
            {log.length === 0 ? (
              <div className="mk-note">아직 기록이 없습니다.</div>
            ) : (
              <div className="mk-ed-log-table">
                <div className="mk-ed-log-row mk-ed-log-head">
                  <span>시각</span><span>경로</span><span>컷</span><span>스킴</span><span>bytes</span><span>템플릿</span><span>결과</span>
                </div>
                {log.map((r, i) => (
                  <div className="mk-ed-log-row" key={i}>
                    <span>{String(r.at || '').slice(5, 19).replace('T', ' ')}</span>
                    <span>{r.source}{r.tok ? `·${r.tok}` : ''}</span>
                    <span>{r.cut}</span>
                    <span>{r.scheme}{r.resolved && r.resolved !== r.scheme ? `→${r.resolved}` : ''}</span>
                    <span>{r.bytes ?? '-'}</span>
                    <span>{r.tpl}</span>
                    <span>{r.ok ? '시도' : (r.reason || '실패')}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mk-ed-actions">
              <button className="mk-reset" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(JSON.stringify(log, null, 2)); setSavedMsg('인쇄 기록 JSON 복사됨') }}>기록 JSON 복사</button>
              <button className="mk-reset" onClick={() => { clearPrintLog(); setLog([]); setSavedMsg('인쇄 기록 지움') }}>기록 지우기</button>
            </div>
          </div>
        )}
      </div>

      {/* 실물 비율 프리뷰 — previewSequence(ESC/POS 와 동일 블록 순회) */}
      <div className="mk-ed-preview-wrap">
        <div className="mk-ed-paper" style={{ width: dots / 2 + 'px' }}>
          {seq.map((s, i) => {
            if (s.kind === 'feed') return <div key={i} style={{ height: s.lines * 12 + 'px' }} />
            if (s.kind === 'cut') return (
              <div key={i} className="mk-ed-cutline">
                ✂──────────────{s.by === 'rawbt' ? ' (RawBT가 자름)' : ''}
              </div>
            )
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
