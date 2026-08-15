// 분류 플로우 — 원탭 판정 + 자동 다음.
//
// ★설계의 근거는 asset 실측이다: 판정 단위가 «행(441)»이 아니라 «품목(178종)»이고,
//   금액 내림차순으로 놓으면 **상위 10종이 금액의 68.4%** 다.
//   ⇒ 큐를 금액순으로 고정하고, 각 항목에 «몇 건이 함께 정리되는지»를 크게 보여준다.
//     그래야 한 번의 탭이 얼마나 큰 일인지가 화면에서 보인다.
import { useMemo, useState } from 'react'

const won = (n) => (n || 0).toLocaleString('ko-KR')

export default function ClassifyView({ data, progress, busy, onDecide }) {
  const [showDone, setShowDone] = useState(false)

  // 금액 내림차순 고정. 미판정 우선(요건 ⑴) — 판정한 것은 아래 목록에서 본다.
  const pending = useMemo(
    () => (data.items || []).filter((i) => !i.verdict).sort((a, b) => (b.amount || 0) - (a.amount || 0)),
    [data.items],
  )
  const done = useMemo(
    () => (data.items || []).filter((i) => i.verdict).sort((a, b) => (b.amount || 0) - (a.amount || 0)),
    [data.items],
  )
  const cur = pending[0]
  const buttons = data.buttons || ['사업-원재료', '사업-운영', '개인', '보류']

  if (!cur) {
    // ★«아직 안 들어왔다» 와 «다 끝냈다» 를 가른다(2026-08-15 유저 첫 열람에서 드러남).
    //   적재 전에는 total=0 인데 옛 문구가 「0종 전부 판정했습니다」라 «다 끝냈다»로 읽혔다
    //   — 회원님은 그 화면을 «빈 화면»이라 부르셨다. 같은 빈 목록이라도 뜻이 정반대다.
    const nothingYet = !(progress?.total)
    return (
      <div className="xp-done-all">
        <b>{nothingYet ? '아직 분류할 항목이 없습니다' : '미분류가 없습니다'}</b>
        <div>
          {nothingYet
            ? '지출 데이터가 아직 올라오지 않았습니다. 올라오면 여기에 금액 큰 것부터 나옵니다.'
            : `${progress.total}종 전부 판정했습니다 · 금액 ${progress.pct ?? 0}%`}
        </div>
        <button type="button" className="xp-linkbtn" onClick={() => setShowDone((v) => !v)}>
          {showDone ? '판정 목록 접기' : `판정한 것 보기 (${done.length})`}
        </button>
        {showDone && <DoneList rows={done} onDecide={onDecide} buttons={buttons} />}
      </div>
    )
  }

  return (
    <>
      <section className="xp-card">
        <div className="xp-label">{cur.label}</div>
        <div className="xp-amount">{won(cur.amount)}원</div>
        {/* ★한 번의 탭이 몇 건을 정리하는지 — asset 이 count 를 처음부터 넣어준 이유다. */}
        <div className="xp-count">{cur.count}건이 한 번에 정리됩니다</div>
        <div className="xp-meta">{cur.source} · {cur.first_seen} ~ {cur.last_seen}</div>
        <div className="xp-left">남은 {pending.length}종</div>
      </section>

      <section className="xp-btns">
        {buttons.map((b) => (
          <button key={b} type="button" className={`xp-btn${b === '보류' ? ' is-hold' : ''}`} disabled={busy} onClick={() => onDecide(cur.item_key, b)}>
            {b}
          </button>
        ))}
      </section>
      {/* ★«보류» 는 저장이 아니라 «판정 안 함»이다(asset 계약 §3).
          억지 분류 하나가 틀린 숫자를 조용히 섞고, 그건 나중에 되돌릴 수 없다. */}
      <p className="xp-hint">「보류」는 아무것도 저장하지 않고 큐에 남깁니다. 확실할 때만 분류하세요.</p>

      <button type="button" className="xp-linkbtn" onClick={() => setShowDone((v) => !v)}>
        {showDone ? '판정 목록 접기' : `판정한 것 보기 (${done.length})`}
      </button>
      {showDone && <DoneList rows={done} onDecide={onDecide} buttons={buttons} />}
    </>
  )
}

/** 과거 판정 목록 + 수정(요건 ⑷). 같은 item_key 재전송이 덮어쓰기라 수정이 곧 재판정이다. */
function DoneList({ rows, onDecide, buttons }) {
  if (!rows.length) return <p className="xp-hint">아직 판정한 것이 없습니다.</p>
  return (
    <ul className="xp-list">
      {rows.map((r) => (
        <li key={r.item_key} className="xp-row">
          <div className="xp-row-main">
            <span className="xp-row-label">{r.label}</span>
            <span className="xp-row-amt">{won(r.amount)}원 · {r.count}건</span>
          </div>
          <select className="xp-sel" value={r.verdict || ''} onChange={(e) => onDecide(r.item_key, e.target.value)}>
            {buttons.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </li>
      ))}
    </ul>
  )
}
