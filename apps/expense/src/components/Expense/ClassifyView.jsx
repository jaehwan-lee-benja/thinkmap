// 분류 — ★스크롤 «리스트»형(2026-08-15 유저 실사용 피드백으로 전환).
//
// 이전: 한 건씩 큰 카드 + 판정하면 자동으로 다음. 「원탭 체감」을 노렸다.
// 실사용 판정: **쭉 훑으면서 눈에 띄는 것부터 처리하고 싶다.** 낱개 카드는
//   ⑴다음에 뭐가 오는지 안 보이고 ⑵되돌아가기 어렵고 ⑶「지금 몇 개 남았나」가 몸으로 안 잡힌다.
// ⇒ 카드 전제를 버린다. 목록으로 두고 **각 행에서 바로** 판정한다.
//
// 유지되는 것: 금액 내림차순(상위 10종이 금액의 68.4%) · 각 행의 «N건이 함께 정리됩니다» ·
//   판정 배치 디바운스 · 「보류」는 아무것도 저장하지 않음 · 커서 페이지네이션.
import { useMemo, useState } from 'react'

const won = (n) => (n || 0).toLocaleString('ko-KR')

export default function ClassifyView({ data, progress, busy, onDecide, onLoadMore, loadingMore }) {
  const [showDone, setShowDone] = useState(false)
  const buttons = data.buttons || ['사업-원재료', '사업-운영', '개인', '보류']

  const pending = useMemo(
    () => (data.items || []).filter((i) => !i.verdict).sort((a, b) => (b.amount || 0) - (a.amount || 0)),
    [data.items],
  )
  const done = useMemo(
    () => (data.items || []).filter((i) => i.verdict).sort((a, b) => (b.amount || 0) - (a.amount || 0)),
    [data.items],
  )

  if (pending.length === 0) {
    // ★«아직 안 들어왔다» 와 «다 끝냈다» 를 가른다(유저 첫 열람에서 드러남 — 같은 빈 목록이라도 뜻이 정반대).
    const nothingYet = !(progress?.total)
    return (
      <div className="xp-done-all">
        <b>{nothingYet ? '아직 분류할 항목이 없습니다' : '미분류가 없습니다'}</b>
        <div>
          {nothingYet
            ? '지출 데이터가 아직 올라오지 않았습니다. 올라오면 여기에 금액 큰 것부터 나옵니다.'
            : `${progress.total}종 전부 판정했습니다`}
        </div>
        {done.length > 0 && (
          <>
            <button type="button" className="xp-linkbtn" onClick={() => setShowDone((v) => !v)}>
              {showDone ? '판정 목록 접기' : `판정한 것 보기 (${done.length})`}
            </button>
            {showDone && <ul className="xp-rows">{done.map((r) => (
              <Row key={r.item_key} item={r} buttons={buttons} busy={busy} onDecide={onDecide} />
            ))}</ul>}
          </>
        )}
      </div>
    )
  }

  return (
    <>
      <p className="xp-hint">
        금액이 큰 것부터입니다. <b>확실한 것만</b> 누르고, 애매하면 「보류」로 두세요 —
        보류는 아무것도 저장하지 않고 다음에 다시 나옵니다.
      </p>

      <ul className="xp-rows">
        {pending.map((it) => (
          <Row key={it.item_key} item={it} buttons={buttons} busy={busy} onDecide={onDecide} />
        ))}
      </ul>

      {/* 커서 페이지네이션 — 목록형이라 «더 보기»가 자연스럽다(카드형엔 없던 자리). */}
      {data.next_cursor && (
        <button type="button" className="xp-more" disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? '불러오는 중…' : '더 보기'}
        </button>
      )}

      {done.length > 0 && (
        <>
          <button type="button" className="xp-linkbtn" onClick={() => setShowDone((v) => !v)}>
            {showDone ? '판정한 것 접기' : `판정한 것 보기 (${done.length})`}
          </button>
          {showDone && <ul className="xp-rows">{done.map((r) => (
            <Row key={r.item_key} item={r} buttons={buttons} busy={busy} onDecide={onDecide} />
          ))}</ul>}
        </>
      )}
    </>
  )
}

/** 한 행 = 품목 하나 + 그 자리에서 누르는 판정 버튼 4개.
 *  ★판정한 행도 목록에 남는다(사라지면 «방금 뭘 눌렀지»를 확인할 수 없다) — 눌린 버튼이 표시되고 바꿀 수 있다. */
function Row({ item, buttons, busy, onDecide }) {
  return (
    <li className={`xp-row2${item.verdict ? ' is-done' : ''}`}>
      <div className="xp-row2-head">
        <span className="xp-row2-label">{item.label}</span>
        <span className="xp-row2-amt">{won(item.amount)}원</span>
      </div>
      {/* ★한 번의 탭이 몇 건을 정리하는지 — 이 숫자가 «누를 값어치»를 만든다. */}
      <div className="xp-row2-meta">{item.count}건{item.last_seen ? ` · 최근 ${item.last_seen}` : ''}</div>
      <div className="xp-row2-btns">
        {buttons.map((b) => (
          <button
            key={b}
            type="button"
            className={`xp-b${item.verdict === b ? ' is-on' : ''}${b === '보류' ? ' is-hold' : ''}`}
            disabled={busy}
            onClick={() => onDecide(item.item_key, b)}
          >{b}</button>
        ))}
      </div>
    </li>
  )
}
