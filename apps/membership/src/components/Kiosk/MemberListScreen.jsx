// 회원 검색(직원용) — ★검색필수(빈 검색=결과 없음, 전체 브라우징 UI 없음, 169).
// 서버측 검색+마스킹: crm 이 원본으로 부분일치 검색 → 마스킹된 매치만 반환(성만 `김○○`·전화 끝4자리·상태).
// 프론트는 원본 미취급. 스토어 계정 열람 허용(161) + Edge 레이트리밋·감사. 고객 화면엔 절대 미노출.
import { useState, useEffect, useRef } from 'react'
import { searchMembers, CONTRACT_PENDING } from '../../api/membership'

const MIN_LEN = 1 // 검색어 최소 길이(이 미만이면 결과 없음).

export default function MemberListScreen({ onBack }) {
  const [q, setQ] = useState('')
  const [members, setMembers] = useState([])
  const [status, setStatus] = useState('empty') // empty | loading | ready | error
  const [errMsg, setErrMsg] = useState('')
  const seqRef = useRef(0)

  // 디바운스 서버검색. 빈/짧은 검색어는 호출 안 함(전체 다운로드 방지).
  useEffect(() => {
    const term = q.trim()
    if (term.length < MIN_LEN) { setMembers([]); setStatus('empty'); return }
    const myseq = ++seqRef.current
    setStatus('loading'); setErrMsg('')
    const t = setTimeout(async () => {
      try {
        const d = await searchMembers(term)
        if (seqRef.current !== myseq) return // 최신 검색만 반영
        setMembers(Array.isArray(d?.members) ? d.members : []); setStatus('ready')
      } catch (e) {
        if (seqRef.current !== myseq) return
        setErrMsg(e?.message || '검색 실패'); setStatus('error')
      }
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="mk-memberlist">
      <div className="mk-ml-head">
        <button className="mk-reset" onClick={onBack}>← 조회로</button>
        <h2>회원 검색</h2>
      </div>

      <input
        className="mk-ml-search"
        type="search" inputMode="search"
        placeholder="이름 또는 전화로 검색"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoComplete="off" name="mk-noauto-search" data-lpignore="true" data-1p-ignore
      />

      {CONTRACT_PENDING && (
        <div className="mk-note">※ 회원 검색은 CRM 연결(마스킹 RPC) 후 활성화됩니다(현재 미리보기).</div>
      )}
      {status === 'empty' && <div className="mk-placeholder">이름 또는 전화로 검색하세요.</div>}
      {status === 'loading' && <div className="mk-placeholder">검색 중…</div>}
      {status === 'error' && <div className="mk-err">{errMsg}</div>}

      {status === 'ready' && (
        <>
          <div className="mk-ml-count">{members.length}명</div>
          <div className="mk-ml-tablewrap">
            <table className="mk-ml-table">
              <thead><tr><th>이름</th><th>전화번호</th><th>상태</th></tr></thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.member_id}>
                    <td>{m.name}</td><td>{m.phone}</td><td>{m.status || '멤버십'}</td>
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr><td colSpan={3} className="mk-ml-empty">검색 결과 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
