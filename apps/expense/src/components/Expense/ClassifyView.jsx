// 분류 — ★«엑셀형» 표(2026-08-15 유저 3연속 정련의 최종형).
//
// 정련 이력(무효화된 전제를 남겨 둔다 — 다음 사람이 되돌리지 않게):
//   ⑴ 한 건씩 큰 카드 → 폐기(다음이 안 보이고 되돌아가기 어렵다)
//   ⑵ 리스트 + 행 아래 버튼 세로 적층 → 폐기(유저: «눈이 어지럽다»)
//   ⑶ ★최종: 한 항목의 «모든» 요소가 한 행에 가로로 쭉 — 품목·금액·판정4·세부·메모.
//      행 높이 낮게, 밀도 있게, 스크롤은 세로.
//
// ★한 가지 물리적 제약을 숨기지 않는다: 요소 8개를 한 행에 가로로 놓으면 최소폭이 약 720px 다.
//   360px 폰에서는 «가로 1행»과 «가로 스크롤 없음»이 동시에 성립하지 않는다.
//   페이지 전체가 밀리는 건 막고(표 자체에만 가로 스크롤), 세로 적층으로는 되돌아가지 않는다.
//
// 유지: 금액 내림차순 · 커서 페이지네이션 · 디바운스 배치 · 보류=미저장 · 빈 상태 문구.
import { useMemo, useState } from 'react'
import { loadDetails, saveDetail, isPendingId } from '../../detailStore.js'

const won = (n) => (n || 0).toLocaleString('ko-KR')

export default function ClassifyView({ data, progress, busy, onDecide, onLoadMore, loadingMore, taxonomy = [], carriedOver = 0, pendingDetails = 0 }) {
  const [showDone, setShowDone] = useState(false)
  const [details, setDetails] = useState(loadDetails)
  const buttons = data.buttons || ['사업-원재료', '사업-운영', '개인', '보류']

  const pending = useMemo(
    () => (data.items || []).filter((i) => !i.verdict).sort((a, b) => (b.amount || 0) - (a.amount || 0)),
    [data.items],
  )
  const done = useMemo(
    () => (data.items || []).filter((i) => i.verdict).sort((a, b) => (b.amount || 0) - (a.amount || 0)),
    [data.items],
  )

  const table = (rows) => (
    // ★표에만 가로 스크롤 — 페이지 본문은 절대 안 밀린다(모바일 규율의 실질을 지키는 지점).
    <div className="xp-tw">
      <div className="xp-tb">
        <div className="xp-tr xp-th">
          <span className="c-item">품목</span>
          <span className="c-amt">금액</span>
          <span className="c-btn">판정 (빠른 기본값)</span>
          <span className="c-det">세부</span>
          <span className="c-memo">메모</span>
        </div>
        {rows.map((it) => (
          <Row key={it.item_key} item={it} buttons={buttons} busy={busy} onDecide={onDecide}
               details={details} setDetails={setDetails} taxonomy={taxonomy} />
        ))}
      </div>
      {/* ★이제 세부·메모도 서버에 저장된다. «준비 중» 문구는 사실이 아니게 되어 지웠다.
          다만 승계 못 한 건이 남아 있으면 그건 여전히 기기에만 있으므로 «그때만» 말한다. */}
      {pendingDetails > 0 && (
        <div className="xp-note">직접 추가하신 세부 {pendingDetails}건은 아직 서버에 없어 이 기기에만 있습니다 · 목록에 추가되면 자동으로 이어집니다</div>
      )}
    </div>
  )

  if (pending.length === 0) {
    // ★«아직 안 들어왔다» 와 «다 끝냈다» 를 가른다 — 같은 빈 목록이라도 뜻이 정반대다.
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
            {showDone && table(done)}
          </>
        )}
      </div>
    )
  }

  return (
    <>
      <p className="xp-hint">
        금액이 큰 것부터입니다. <b>확실한 것만</b> 누르고, 애매하면 「보류」로 두세요.
        판정 버튼은 <b>빠른 기본값</b>이라 세부를 고르면 세부가 우선합니다.
      </p>

      {table(pending)}

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
          {showDone && table(done)}
        </>
      )}
    </>
  )
}

/** 표의 한 «행» — 품목·금액·판정4·세부·메모가 전부 가로로 늘어선다. 세로 적층 0(발주 명시). */
function Row({ item, buttons, busy, onDecide, details, setDetails, taxonomy }) {
  const saved = details.items[item.item_key] || {}
  const chosen = taxonomy.find((t) => t.id === saved.detail) || null
  // ★세부가 대분류를 이긴다 — 화면에 «실효 대분류»를 그대로 비춘다(버튼과 다르면 그게 보여야 한다).
  const effective = chosen ? chosen.category : item.verdict

  // ★기기 보관과 서버 전송을 «둘 다» 한다. 보관은 오프라인·전송 실패 때의 안전망이고,
  //   전송이 진짜 저장이다. 보관만 하면 예전처럼 조용히 사라지고, 전송만 하면 실패가 곧 손실이다.
  const put = (patch) => {
    const next = saveDetail(item.item_key, patch)
    setDetails({ ...next })
    const cur = next.items[item.item_key] || {}
    if (item.verdict && item.verdict !== '보류') {
      onDecide(item.item_key, item.verdict, {
        subcategory_id: isPendingId(taxonomy, cur.detail) ? undefined : (cur.detail || undefined),
        note: cur.memo || undefined,
      })
    }
  }
  const onSelect = (v) => put({ detail: v })

  return (
    <div className={`xp-tr${item.verdict ? ' is-done' : ''}`}>
      <span className="c-item" title={item.label}>
        {item.label}
        <em>{item.count}건</em>
      </span>
      <span className="c-amt">{won(item.amount)}</span>
      <span className="c-btn">
        {buttons.map((b) => (
          <button
            key={b}
            type="button"
            className={`xp-b${item.verdict === b ? ' is-on' : ''}${b === '보류' ? ' is-hold' : ''}`}
            disabled={busy}
            onClick={() => onDecide(item.item_key, b)}
          >{b.replace('사업-', '')}</button>
        ))}
      </span>
      <span className="c-det">
        <select
          value={saved.detail || ''}
          disabled={!item.verdict || item.verdict === '보류'}
          onChange={(e) => onSelect(e.target.value)}
        >
          <option value="">—</option>
          {taxonomy.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        {/* 버튼과 실효 대분류가 갈리면 조용히 두지 않는다 — 그게 계약이 말한 «세부 우선»의 눈에 보이는 형태다. */}
        {effective && effective !== item.verdict && <em className="xp-override">→ {effective}</em>}
      </span>
      <span className="c-memo">
        <input
          value={saved.memo || ''}
          disabled={!item.verdict || item.verdict === '보류'}
          placeholder="이 품목 메모"
          onChange={(e) => put({ memo: e.target.value })}
        />
      </span>
    </div>
  )
}
