// 대사 뷰 — 계좌×월 «수집합계 vs 실이동», 차액≠0 강조(오차 0 목표).
// ★지금은 껍데기다. 데이터(`flows.json`, 계약 asset/spend-flows@1)가 아직 없다 —
//   통장 회수가 이카운트 로그인 1회에 막혀 있다(asset ⑧). 모양만 맞춰 둔다.
export default function ReconcileView() {
  return (
    <div className="xp-stub">
      <b>대사 — 계좌 × 월</b>
      <p>수집합계 · 계좌 실이동 · <b>차액</b>을 월별로 대조합니다. 차액이 0이 아니면 강조합니다.</p>
      <p className="xp-hint">
        아직 통장 데이터가 없습니다(이카운트 회수 대기). 도착하면 <code>msg/spend-queue/flows.json</code> 을
        읽어 이 표를 채웁니다.
      </p>
      <p className="xp-hint">
        ★계좌 간 이체(<code>internal_excluded</code>)는 «지출»에 더하지 않습니다 — 더하면 비용이 2배가 됩니다.
      </p>
    </div>
  )
}
