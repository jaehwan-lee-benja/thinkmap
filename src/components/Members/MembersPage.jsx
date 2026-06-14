// 멤버 관리 페이지 (page_type='members') — 마스터 전용 진입.
// docs/MEMBER-SPEC.md §7.1. 기본정보 + 민감정보(member_private) + 인사 이력(member_records).

import React, { useEffect, useMemo, useState } from 'react'
import { Plus, X, Trash2, Pencil, Save } from 'lucide-react'
import {
  useMembers, loadMemberPrivate, saveMemberPrivate, loadAllMemberPrivate,
  loadMemberRecords, saveMemberRecord, deleteMemberRecord,
} from '../../hooks/useMembers'
import {
  WEEKDAYS, MEMBER_STATUS, MEMBER_STATUS_LABEL,
  MEMBER_RECORD_TYPES, MEMBER_RECORD_TYPE_LABEL,
} from '../../utils/rosterPresets'
import './Members.css'

const EMPTY_DRAFT = { name: '', work_days: [], seniority: '', phone: '', status: 'active', note: '' }

export default function MembersPage({ pageId, session, isMaster = false }) {
  const [showInactive, setShowInactive] = useState(true)
  const { members, loading, createMember, updateMember, removeMember } = useMembers({ includeInactive: showInactive })
  const [editing, setEditing] = useState(null) // null | 'new' | memberObject
  const [privById, setPrivById] = useState({})

  const loadPriv = async () => {
    if (!isMaster) return
    const { byId } = await loadAllMemberPrivate()
    setPrivById(byId || {})
  }
  useEffect(() => { loadPriv() }, [isMaster, members.length])

  if (!isMaster) {
    return <div className="members-page"><div className="members-denied">접근 권한이 없습니다. (마스터 전용)</div></div>
  }

  return (
    <div className="members-page">
      <div className="members-header">
        <h2>멤버 관리</h2>
        <div className="members-header-actions">
          <label className="members-toggle">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            비활성·퇴사 포함
          </label>
          <button className="members-add-btn" onClick={() => setEditing('new')}>
            <Plus size={15} /> 새 멤버
          </button>
        </div>
      </div>

      {loading ? (
        <div className="members-empty">불러오는 중…</div>
      ) : members.length === 0 ? (
        <div className="members-empty">등록된 멤버가 없습니다.</div>
      ) : (
        <div className="members-table-wrap">
          <table className="members-table members-table--roster">
            <thead>
              <tr>
                <th>근무일</th><th>이름</th><th>직급</th><th>전화번호</th>
                <th>급여명세서 메일</th><th>급여 계좌</th><th>생일</th><th>gmail</th>
                <th>상태</th><th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const p = privById[m.id] || {}
                return (
                  <tr key={m.id} className={m.status !== 'active' ? 'is-inactive' : ''}>
                    <td className="col-days">{(m.work_days || []).join('·') || '—'}</td>
                    <td className="col-name">{m.name}</td>
                    <td>{m.seniority || '—'}</td>
                    <td className="col-phone">{m.phone || '—'}</td>
                    <td className="col-mail">{p.payslip_email || '—'}</td>
                    <td className="col-bank">{p.bank_account || '—'}</td>
                    <td>{p.birth || '—'}</td>
                    <td className="col-mail">{p.email_gmail || '—'}</td>
                    <td><span className={`members-status members-status--${m.status}`}>{MEMBER_STATUS_LABEL[m.status] || m.status}</span></td>
                    <td className="col-actions">
                      <button className="members-icon-btn" title="편집" onClick={() => setEditing(m)}><Pencil size={14} /></button>
                      <button className="members-icon-btn members-icon-btn--danger" title="삭제" onClick={async () => {
                        if (confirm(`${m.name} 님을 삭제할까요? (기록은 보존됩니다)`)) await removeMember(m.id)
                      }}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <MemberEditModal
          member={editing === 'new' ? null : editing}
          isMaster={isMaster}
          onClose={() => { setEditing(null); loadPriv() }}
          onCreate={createMember}
          onUpdate={updateMember}
        />
      )}
    </div>
  )
}

function MemberEditModal({ member, isMaster, onClose, onCreate, onUpdate }) {
  const isNew = !member
  const [tab, setTab] = useState('basic')
  const [draft, setDraft] = useState(() => member ? {
    name: member.name || '', work_days: member.work_days || [], seniority: member.seniority || '',
    phone: member.phone || '', status: member.status || 'active', note: member.note || '',
  } : { ...EMPTY_DRAFT })
  const [saving, setSaving] = useState(false)

  // 민감정보 / 이력
  const [priv, setPriv] = useState(null)
  const [records, setRecords] = useState([])
  useEffect(() => {
    if (!member?.id || !isMaster) return
    loadMemberPrivate(member.id).then(({ data }) => setPriv(data || {}))
    loadMemberRecords(member.id).then(({ data }) => setRecords(data || []))
  }, [member?.id, isMaster])

  const toggleDay = (d) => setDraft((p) => ({
    ...p,
    work_days: p.work_days.includes(d) ? p.work_days.filter((x) => x !== d) : [...p.work_days, d],
  }))

  const handleSaveBasic = async () => {
    setSaving(true)
    if (isNew) {
      const { error } = await onCreate(draft)
      setSaving(false)
      if (!error) onClose()
      else alert('저장 실패: ' + error.message)
    } else {
      const { error } = await onUpdate(member.id, draft)
      setSaving(false)
      if (!error) onClose()
      else alert('저장 실패: ' + error.message)
    }
  }

  const handleSavePrivate = async () => {
    if (!member?.id) return
    setSaving(true)
    const { error } = await saveMemberPrivate(member.id, priv || {})
    setSaving(false)
    if (error) alert('민감정보 저장 실패: ' + error.message)
    else alert('저장되었습니다.')
  }

  return (
    <div className="members-modal-overlay" onClick={onClose}>
      <div className="members-modal" onClick={(e) => e.stopPropagation()}>
        <div className="members-modal-header">
          <span>{isNew ? '새 멤버' : `${member.name} 편집`}</span>
          <button className="members-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        {!isNew && (
          <div className="members-tabs">
            <button className={tab === 'basic' ? 'active' : ''} onClick={() => setTab('basic')}>기본정보</button>
            <button className={tab === 'private' ? 'active' : ''} onClick={() => setTab('private')}>민감정보</button>
            <button className={tab === 'records' ? 'active' : ''} onClick={() => setTab('records')}>인사 이력</button>
          </div>
        )}

        <div className="members-modal-body">
          {tab === 'basic' && (
            <div className="members-form">
              <label>이름<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="이름" /></label>
              <label>근무요일
                <div className="members-days">
                  {WEEKDAYS.map((d) => (
                    <button key={d} type="button" className={draft.work_days.includes(d) ? 'on' : ''} onClick={() => toggleDay(d)}>{d}</button>
                  ))}
                </div>
              </label>
              <label>직급<input value={draft.seniority} onChange={(e) => setDraft({ ...draft, seniority: e.target.value })} placeholder="매니저 / 시니어 / 주니어 등" /></label>
              <label>연락처<input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="010-0000-0000" /></label>
              <label>상태
                <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                  {MEMBER_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
              <label>메모<textarea value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} rows={2} /></label>
              <button className="members-save-btn" onClick={handleSaveBasic} disabled={saving || !draft.name.trim()}>
                <Save size={14} /> {isNew ? '추가' : '저장'}
              </button>
            </div>
          )}

          {tab === 'private' && !isNew && (
            <div className="members-form">
              <p className="members-hint">민감 개인정보 — 마스터만 열람·편집됩니다.</p>
              {[
                ['birth', '생년월일'], ['resident_no', '주민등록번호'], ['bank_account', '급여 계좌'],
                ['email_gmail', 'gmail'], ['payslip_email', '급여명세서 수신메일'],
                ['hire_date', '입사일 (YYYY-MM-DD)'], ['resign_date', '퇴사일 (YYYY-MM-DD)'],
              ].map(([k, label]) => (
                <label key={k}>{label}
                  <input value={(priv?.[k]) || ''} onChange={(e) => setPriv({ ...priv, [k]: e.target.value })} />
                </label>
              ))}
              <label>메모<textarea value={priv?.memo || ''} onChange={(e) => setPriv({ ...priv, memo: e.target.value })} rows={2} /></label>
              <button className="members-save-btn" onClick={handleSavePrivate} disabled={saving}><Save size={14} /> 저장</button>
            </div>
          )}

          {tab === 'records' && !isNew && (
            <MemberRecords memberId={member.id} records={records} setRecords={setRecords} createdBy={null} />
          )}
        </div>
      </div>
    </div>
  )
}

function MemberRecords({ memberId, records, setRecords }) {
  const [draft, setDraft] = useState({ record_type: 'health_cert', title: '', doc_date: '', expires_at: '', body: '' })

  const reload = async () => {
    const { data } = await loadMemberRecords(memberId)
    setRecords(data || [])
  }
  const handleAdd = async () => {
    const rec = {
      member_id: memberId,
      record_type: draft.record_type,
      title: draft.title || null,
      doc_date: draft.doc_date || null,
      expires_at: draft.expires_at || null,
      body: draft.body || null,
    }
    const { error } = await saveMemberRecord(rec)
    if (error) { alert('이력 저장 실패: ' + error.message); return }
    setDraft({ record_type: 'health_cert', title: '', doc_date: '', expires_at: '', body: '' })
    reload()
  }

  return (
    <div className="members-records">
      <ul className="members-records-list">
        {records.length === 0 && <li className="members-empty-sm">이력이 없습니다.</li>}
        {records.map((r) => (
          <li key={r.id}>
            <span className={`members-rec-type members-rec-type--${r.record_type}`}>{MEMBER_RECORD_TYPE_LABEL[r.record_type]}</span>
            <span className="members-rec-title">{r.title || '(제목 없음)'}</span>
            <span className="members-rec-date">{r.doc_date || ''}{r.expires_at ? ` ~ ${r.expires_at}` : ''}</span>
            <button className="members-icon-btn members-icon-btn--danger" onClick={async () => { await deleteMemberRecord(r.id); reload() }}><Trash2 size={13} /></button>
          </li>
        ))}
      </ul>
      <div className="members-rec-add">
        <select value={draft.record_type} onChange={(e) => setDraft({ ...draft, record_type: e.target.value })}>
          {MEMBER_RECORD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input placeholder="제목" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <input placeholder="일자 YYYY-MM-DD" value={draft.doc_date} onChange={(e) => setDraft({ ...draft, doc_date: e.target.value })} />
        <input placeholder="만료 YYYY-MM-DD" value={draft.expires_at} onChange={(e) => setDraft({ ...draft, expires_at: e.target.value })} />
        <button className="members-save-btn" onClick={handleAdd}><Plus size={14} /> 추가</button>
      </div>
    </div>
  )
}
