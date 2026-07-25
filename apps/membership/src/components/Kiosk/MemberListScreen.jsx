// 회원 리스트 확인(직원용 검색) — 이름+전화 표 + 실시간 부분일치 검색.
// ⚠️★보안: 이 화면은 계약 §5 "목록·부분검색 금지"를 뒤집는 PII 노출면이다. crm membership-list Edge 는
//   유저 결정 게이트(to-conductor) 승인 전엔 미배포 → LIVE 전엔 미리보기(빈 목록/안내)만.
//   전 회원 이름+전화를 매장 태블릿에 다운로드하므로, 배포 시 직원게이트·감사·레이트리밋 필수.
import { useState, useEffect } from 'react'
import { listMembers, CONTRACT_PENDING } from '../../api/membership'

export default function MemberListScreen({ onBack }) {
  const [members, setMembers] = useState([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    let alive = true
    listMembers()
      .then((d) => { if (alive) { setMembers(Array.isArray(d?.members) ? d.members : []); setStatus('ready') } })
      .catch((e) => { if (alive) { setErrMsg(e?.message || '불러오기 실패'); setStatus('error') } })
    return () => { alive = false }
  }, [])

  const term = q.trim()
  const digitsTerm = q.replace(/\D/g, '')
  const filtered = term
    ? members.filter((m) =>
        (m.name || '').includes(term) ||
        (digitsTerm && (m.phone || '').replace(/\D/g, '').includes(digitsTerm)))
    : members

  return (
    <div className="mk-memberlist">
      <div className="mk-ml-head">
        <button className="mk-reset" onClick={onBack}>← 조회로</button>
        <h2>회원 리스트</h2>
      </div>

      <input
        className="mk-ml-search"
        type="search" inputMode="search"
        placeholder="이름 또는 전화번호 검색"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoComplete="off"
      />

      {CONTRACT_PENDING && (
        <div className="mk-note">※ 회원 리스트는 보안 승인 + CRM 연결 후 활성화됩니다(현재 미리보기).</div>
      )}
      {status === 'loading' && !CONTRACT_PENDING && <div className="mk-placeholder">불러오는 중…</div>}
      {status === 'error' && <div className="mk-err">{errMsg}</div>}

      {status === 'ready' && (
        <>
          <div className="mk-ml-count">{filtered.length}명</div>
          <div className="mk-ml-tablewrap">
            <table className="mk-ml-table">
              <thead><tr><th>이름</th><th>전화번호</th></tr></thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.member_id}><td>{m.name}</td><td>{m.phone}</td></tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={2} className="mk-ml-empty">검색 결과 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
