// 공용 회원 카드 — 인사말 + 팝콘 이벤트 참여/참여완료 + 수령내역. 고객뷰·직원뷰 공용.
// 데이터/액션은 상위(useMemberLookup)에서 주입. 표시 전용.
import { formatClaim, todayStr } from './kioskUtils'

export default function MemberCard({ member, history = [], claiming, errMsg, onClaim, onReset, resetLabel = '새 조회' }) {
  if (!member) return null
  return (
    <div className="mk-card mk-card-member">
      {/* 1. 인사말 */}
      <div className="mk-greeting">안녕하세요, {member.display_name || '회원'} 멤버십 회원님!</div>
      <div className="mk-badge">● 멤버십 회원</div>

      {/* 2. 사르르 팝콘 이벤트 */}
      <div className="mk-event-section">
        <div className="mk-event-label">멤버십 이벤트 참여</div>
        {member.today_event_claimed ? (
          <button className="mk-claim-btn" disabled>오늘({todayStr()}): 참여 완료 ✓</button>
        ) : (
          <button className="mk-claim-btn" onClick={onClaim} disabled={claiming || !onClaim}>
            {claiming ? '적립 중…' : '사르르 팝콘 이벤트 참여'}
          </button>
        )}
        {/* 성공 확인은 이벤트명 비하드코딩(일반화). 실제 이벤트 버튼명은 위에서 유지. */}
        {member._justClaimed && <div className="mk-claimed">참여 완료 🎉</div>}

        {history.length > 0 && (
          <ul className="mk-history">
            {history.map((h, i) => <li key={h.claimed_at || i}>{formatClaim(h.claimed_at)}</li>)}
          </ul>
        )}
      </div>

      {errMsg && <div className="mk-err">{errMsg}</div>}
      {onReset && <button className="mk-reset" onClick={onReset}>{resetLabel}</button>}
    </div>
  )
}
