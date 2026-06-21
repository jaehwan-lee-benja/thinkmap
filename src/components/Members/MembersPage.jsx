// 멤버 관리 페이지 (page_type='members') — 마스터 전용 진입.
// docs/MEMBER-SPEC.md §7.1. 기본정보 + 민감정보(member_private) + 인사 이력(member_records).

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, X, Trash2, Pencil, Save } from 'lucide-react'
import {
  useMembers, loadMemberPrivate, saveMemberPrivate, loadAllMemberPrivate,
  loadMemberRecords, saveMemberRecord, deleteMemberRecord,
} from '../../hooks/useMembers'
import { sortMembers } from '../../utils/membersPage'
import {
  WEEKDAYS, MEMBER_STATUS, MEMBER_STATUS_LABEL,
  MEMBER_RECORD_TYPES, MEMBER_RECORD_TYPE_LABEL,
} from '../../utils/rosterPresets'
import './Members.css'

const EMPTY_DRAFT = { name: '', work_days: [], seniority: '', phone: '', status: 'active', note: '' }

// 정렬 가능한 표 헤더 셀. 현재 정렬 칼럼이면 방향을 ▲/▼로 표시.
function SortableTh({ sortKey, sort, onSort, children, className }) {
  const active = sort.key === sortKey
  const arrow = active ? (sort.dir === 'asc' ? '▲' : '▼') : ''
  return (
    <th
      className={`members-th-sort${active ? ' is-sorted' : ''}${className ? ' ' + className : ''}`}
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {children}<span className="members-sort-arrow">{arrow}</span>
    </th>
  )
}

export default function MembersPage({ pageId, session, isMaster = false }) {
  const [showInactive, setShowInactive] = useState(true)
  const { members, loading, createMember, updateMember, removeMember } = useMembers({ includeInactive: showInactive })
  const [editing, setEditing] = useState(null) // null | 'new' | memberObject
  const [privById, setPrivById] = useState({})
  const [mode, setMode] = useState('read') // 'read'(한 명씩 모달) | 'edit'(엑셀식 표 편집)
  // 칼럼 정렬: key=null이면 기본 순서(display_order→name). 헤더 클릭: asc→desc→기본.
  const [sort, setSort] = useState({ key: null, dir: 'asc' })
  const toggleSort = (key) => setSort((s) => {
    if (s.key !== key) return { key, dir: 'asc' }
    if (s.dir === 'asc') return { key, dir: 'desc' }
    return { key: null, dir: 'asc' } // 3번째 클릭 → 기본 복귀
  })
  const sortedMembers = useMemo(() => sortMembers(members, privById, sort), [members, privById, sort])

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
          <div className="members-mode-toggle" role="tablist" aria-label="편집 방식">
            <button className={mode === 'read' ? 'active' : ''} onClick={() => setMode('read')} aria-selected={mode === 'read'}>읽기</button>
            <button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')} aria-selected={mode === 'edit'}>표 편집</button>
          </div>
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
      ) : mode === 'edit' ? (
        <EditableMembersTable
          members={sortedMembers}
          privById={privById}
          updateMember={updateMember}
          createMember={createMember}
          onReloadPriv={loadPriv}
          sort={sort}
          onSort={toggleSort}
        />
      ) : members.length === 0 ? (
        <div className="members-empty">등록된 멤버가 없습니다.</div>
      ) : (
        <div className="members-table-wrap">
          <table className="members-table members-table--roster">
            <thead>
              <tr>
                <SortableTh sortKey="work_days" sort={sort} onSort={toggleSort}>근무일</SortableTh>
                <SortableTh sortKey="name" sort={sort} onSort={toggleSort}>이름</SortableTh>
                <SortableTh sortKey="seniority" sort={sort} onSort={toggleSort}>직급</SortableTh>
                <SortableTh sortKey="phone" sort={sort} onSort={toggleSort}>전화번호</SortableTh>
                <SortableTh sortKey="payslip_email" sort={sort} onSort={toggleSort}>급여명세서 메일</SortableTh>
                <SortableTh sortKey="bank_account" sort={sort} onSort={toggleSort}>급여 계좌</SortableTh>
                <SortableTh sortKey="birth" sort={sort} onSort={toggleSort}>생일</SortableTh>
                <SortableTh sortKey="email_gmail" sort={sort} onSort={toggleSort}>gmail</SortableTh>
                <SortableTh sortKey="status" sort={sort} onSort={toggleSort}>상태</SortableTh>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedMembers.map((m) => {
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

// 엑셀식 표 편집 — 셀을 직접 고치고 칸을 벗어나면(blur)/Enter 시 해당 필드만 저장.
// 기본정보는 updateMember, 민감정보는 saveMemberPrivate. 하단 빈 행으로 빠른 추가.
// 입력은 uncontrolled(defaultValue) — 저장 후 내부 refetch 재렌더가 입력 중 텍스트를 건드리지 않게 함.
function EditableMembersTable({ members, privById, updateMember, createMember, onReloadPriv, sort, onSort }) {
  const [status, setStatus] = useState('idle') // idle | saving | saved | error
  const [newName, setNewName] = useState('')
  const addingRef = useRef(false)

  // 표시 컬럼(기본/민감 혼합). priv = 민감정보(member_private) 행.
  const COLS = [
    { k: 'display_order', label: '순서', kind: 'basic', ph: '0', cls: 'members-cell--num', get: (m) => (m.display_order ?? '') },
    { k: 'work_days', label: '근무일', kind: 'basic', ph: '월·화', get: (m) => (m.work_days || []).join('·') },
    { k: 'name', label: '이름', kind: 'basic', get: (m) => m.name || '' },
    { k: 'seniority', label: '직급', kind: 'basic', get: (m) => m.seniority || '' },
    { k: 'phone', label: '전화번호', kind: 'basic', get: (m) => m.phone || '' },
    { k: 'payslip_email', label: '급여명세서 메일', kind: 'priv', get: (m, p) => p.payslip_email || '' },
    { k: 'bank_account', label: '급여 계좌', kind: 'priv', get: (m, p) => p.bank_account || '' },
    { k: 'birth', label: '생일', kind: 'priv', ph: 'YYYY-MM-DD', get: (m, p) => p.birth || '' },
    { k: 'email_gmail', label: 'gmail', kind: 'priv', get: (m, p) => p.email_gmail || '' },
  ]

  const saveBasic = async (m, field, raw) => {
    let val
    if (field === 'work_days') val = WEEKDAYS.filter((d) => raw.includes(d))
    else if (field === 'display_order') {
      const n = parseInt(raw, 10)
      if (!Number.isFinite(n)) return // 빈칸/비숫자는 무시 (NOT NULL 보호)
      val = n
    } else val = (raw ?? '').trim() || null
    const cur = field === 'work_days' ? (m.work_days || []) : (m[field] ?? null)
    const unchanged = field === 'work_days' ? (val.join() === cur.join()) : (val === cur)
    if (unchanged) return
    setStatus('saving')
    const { error } = await updateMember(m.id, { [field]: val })
    if (error) { setStatus('error'); alert('저장 실패: ' + error.message) } else setStatus('saved')
  }

  const savePriv = async (m, field, raw) => {
    const val = (raw ?? '').trim() || null
    const cur = (privById[m.id]?.[field]) ?? null
    if (val === cur) return
    setStatus('saving')
    const { error } = await saveMemberPrivate(m.id, { [field]: val })
    if (error) { setStatus('error'); alert('민감정보 저장 실패: ' + error.message); return }
    setStatus('saved')
    await onReloadPriv()
  }

  const enterBlurs = (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }

  const addNew = async () => {
    const name = newName.trim()
    if (!name || addingRef.current) return
    addingRef.current = true
    setStatus('saving')
    const { error } = await createMember({ name })
    addingRef.current = false
    if (error) { setStatus('error'); alert('추가 실패: ' + error.message); return }
    setStatus('saved'); setNewName('')
  }

  return (
    <>
      <div className="members-edit-bar">
        <span className="members-edit-hint">셀을 클릭해 바로 수정 · Tab/Enter로 이동 · 칸을 벗어나면 자동 저장</span>
        <span className={`members-save-state members-save-state--${status}`}>
          {status === 'saving' ? '저장 중…' : status === 'saved' ? '저장됨' : status === 'error' ? '저장 오류' : ''}
        </span>
      </div>
      <div className="members-table-wrap">
        <table className="members-table members-table--edit">
          <thead>
            <tr>
              {COLS.map((c) => (
                <SortableTh key={c.k} sortKey={c.k} sort={sort} onSort={onSort}>{c.label}</SortableTh>
              ))}
              <SortableTh sortKey="status" sort={sort} onSort={onSort}>상태</SortableTh>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const p = privById[m.id] || {}
              return (
                <tr key={m.id} className={m.status !== 'active' ? 'is-inactive' : ''}>
                  {COLS.map((c) => (
                    <td key={c.k}>
                      <input
                        className={`members-cell ${c.cls || ''}`}
                        defaultValue={c.get(m, p)}
                        placeholder={c.ph || ''}
                        inputMode={c.k === 'display_order' ? 'numeric' : undefined}
                        onKeyDown={enterBlurs}
                        onBlur={(e) => {
                          if (c.k === 'name' && !e.target.value.trim()) { e.target.value = m.name; return }
                          if (c.kind === 'priv') savePriv(m, c.k, e.target.value)
                          else saveBasic(m, c.k, e.target.value)
                        }}
                      />
                    </td>
                  ))}
                  <td>
                    <select className="members-cell" defaultValue={m.status} onChange={(e) => saveBasic(m, 'status', e.target.value)}>
                      {MEMBER_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </td>
                </tr>
              )
            })}
            <tr className="members-row-new">
              <td colSpan={COLS.length + 1}>
                <input
                  className="members-cell members-cell--new"
                  value={newName}
                  placeholder="＋ 새 멤버 이름 입력 후 Enter (추가 뒤 셀을 채우세요)"
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNew() } }}
                  onBlur={addNew}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
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
