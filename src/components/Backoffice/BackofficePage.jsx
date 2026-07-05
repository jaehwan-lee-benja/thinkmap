// 백오피스 — 사이트 구조도(모선+위성) 관리 페이지. page_type='backoffice', 마스터 전용.
// docs/SITE-SPLIT-PLAN.md §4/§5/§10. 이 페이지의 노드 데이터가 곧 "위성 런처"의 소스다.
//
// 화면 = (a) hub-and-spoke 구조도  +  (b) 노드 추가/편집/삭제/정렬 CRUD 표.
// 저장소: site_nodes DB 테이블(런타임 편집 목적). 미적용 시 시드 폴백(로컬 미리보기 배너).
//
// 격리 노트: 나중에 apps/backoffice 위성으로 졸업 가능하도록 이 폴더(Backoffice/) +
// useSiteNodes 훅 + siteNodesSeed 유틸 안에만 로직을 가둔다. 셸/에디터에 의존하지 않음.

import React, { useMemo, useState } from 'react'
import { Plus, X, Trash2, Pencil, ExternalLink } from 'lucide-react'
import { useSiteNodes } from '../../hooks/useSiteNodes'
import SiteMapDiagram from './SiteMapDiagram'
import {
  NODE_KINDS, NODE_KIND_LABEL,
  NODE_STATUSES, NODE_STATUS_LABEL,
  NODE_ROLES, NODE_ROLE_LABEL,
  EMPTY_NODE_DRAFT,
} from '../../utils/siteNodesSeed'
import './Backoffice.css'

export default function BackofficePage({ session, isMaster = false }) {
  const { nodes, loading, mode, error, createNode, updateNode, removeNode } = useSiteNodes()
  const [editing, setEditing] = useState(null) // null | 'new' | nodeObject
  const [draft, setDraft] = useState(EMPTY_NODE_DRAFT)
  const [selectedId, setSelectedId] = useState(null)

  const launchers = useMemo(() => nodes.filter((n) => n.kind === 'satellite'), [nodes])

  if (!isMaster) {
    return <div className="bo-page"><div className="bo-denied">접근 권한이 없습니다. (마스터 전용)</div></div>
  }

  const openNew = () => {
    const nextOrder = nodes.length ? Math.max(...nodes.map((n) => n.sort_order ?? 0)) + 1 : 0
    setDraft({ ...EMPTY_NODE_DRAFT, sort_order: nextOrder })
    setEditing('new')
  }
  const openEdit = (node) => {
    setDraft({ ...EMPTY_NODE_DRAFT, ...node })
    setEditing(node)
  }
  const closeEdit = () => { setEditing(null); setDraft(EMPTY_NODE_DRAFT) }

  const save = async () => {
    if (!draft.name?.trim()) { alert('이름을 입력하세요.'); return }
    if (editing === 'new') await createNode(draft)
    else await updateNode(editing.id, draft)
    closeEdit()
  }

  const del = async (node) => {
    if (!window.confirm(`"${node.name}" 노드를 삭제할까요?`)) return
    await removeNode(node.id)
    if (selectedId === node.id) setSelectedId(null)
  }

  return (
    <div className="bo-page">
      <div className="bo-header">
        <div>
          <h2>백오피스 — 사이트 구조도</h2>
          <p className="bo-sub">모선(Hub) + 위성(Satellite) 레지스트리. 여기서 관리한 노드가 위성 런처의 소스가 된다.</p>
        </div>
        <button className="bo-add-btn" onClick={openNew}><Plus size={15} /> 노드 추가</button>
      </div>

      {/* 저장소 모드 배너 */}
      {mode === 'local' && (
        <div className="bo-banner">
          로컬 미리보기 모드 — <code>site_nodes</code> 테이블이 아직 적용되지 않았습니다.
          편집은 이 세션에서만 유지되며 새로고침하면 시드로 복귀합니다.
          영속하려면 통합 세션이 <code>migrate-create-site-nodes.sql</code> 을 적용해야 합니다.
        </div>
      )}
      {error && <div className="bo-banner bo-banner--err">DB 오류: {error}</div>}

      {loading ? (
        <div className="bo-empty">불러오는 중…</div>
      ) : (
        <>
          {/* (a) 구조도 */}
          <section className="bo-section">
            <div className="bo-section-title">구조도</div>
            <SiteMapDiagram nodes={nodes} selectedId={selectedId} onSelect={setSelectedId} />
          </section>

          {/* (b) CRUD 표 */}
          <section className="bo-section">
            <div className="bo-section-title">노드 목록 ({nodes.length})</div>
            {nodes.length === 0 ? (
              <div className="bo-empty">노드가 없습니다. "노드 추가"로 시작하세요.</div>
            ) : (
              <div className="bo-table-wrap">
                <table className="bo-table">
                  <thead>
                    <tr>
                      <th className="col-order">순서</th>
                      <th className="col-name">이름</th>
                      <th className="col-kind">종류</th>
                      <th className="col-domain">도메인/page_type</th>
                      <th className="col-role">필요역할</th>
                      <th className="col-status">상태</th>
                      <th className="col-url">URL</th>
                      <th className="col-actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {nodes.map((n) => (
                      <tr
                        key={n.id}
                        className={`${selectedId === n.id ? 'is-selected' : ''} bo-status-row--${n.status}`}
                        onClick={() => setSelectedId(n.id)}
                      >
                        <td className="col-order">{n.sort_order}</td>
                        <td className="col-name">{n.name}</td>
                        <td className="col-kind">
                          <span className={`bo-kind bo-kind--${n.kind}`}>{NODE_KIND_LABEL[n.kind] || n.kind}</span>
                        </td>
                        <td className="col-domain"><code>{n.domain || '—'}</code></td>
                        <td className="col-role">{NODE_ROLE_LABEL[n.required_role] || n.required_role}</td>
                        <td className="col-status">
                          <span className={`bo-status bo-status--${n.status}`}>{NODE_STATUS_LABEL[n.status] || n.status}</span>
                        </td>
                        <td className="col-url">
                          {n.url
                            ? <a href={n.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{n.url} <ExternalLink size={11} /></a>
                            : <span className="bo-muted">내부 page_type</span>}
                        </td>
                        <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                          <button className="bo-icon-btn" title="편집" onClick={() => openEdit(n)}><Pencil size={14} /></button>
                          <button className="bo-icon-btn bo-icon-btn--danger" title="삭제" onClick={() => del(n)}><Trash2 size={14} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* (c) 런처 미리보기 — 위성 타일 */}
          <section className="bo-section">
            <div className="bo-section-title">런처 미리보기 (위성 타일)</div>
            <p className="bo-sub">이 노드들이 모선에 뜰 "다른 사이트로 가는 링크 타일"이다.</p>
            <div className="bo-launcher-grid">
              {launchers.map((n) => (
                <a
                  key={n.id}
                  className={`bo-tile bo-status--${n.status}`}
                  href={n.url || undefined}
                  target={n.url ? '_blank' : undefined}
                  rel="noreferrer"
                  onClick={(e) => { if (!n.url) e.preventDefault(); setSelectedId(n.id) }}
                >
                  <div className="bo-tile-name">{n.name}</div>
                  <div className="bo-tile-meta">
                    <code>{n.domain || '—'}</code>
                    <span className={`bo-status bo-status--${n.status}`}>{NODE_STATUS_LABEL[n.status]}</span>
                  </div>
                  <div className="bo-tile-role">{NODE_ROLE_LABEL[n.required_role]}</div>
                </a>
              ))}
              {launchers.length === 0 && <div className="bo-empty">위성 노드가 없습니다.</div>}
            </div>
          </section>
        </>
      )}

      {/* 편집 모달 */}
      {editing && (
        <div className="bo-modal-overlay" onClick={closeEdit}>
          <div className="bo-modal" onClick={(e) => e.stopPropagation()}>
            <div className="bo-modal-head">
              <h3>{editing === 'new' ? '노드 추가' : '노드 편집'}</h3>
              <button className="bo-icon-btn" onClick={closeEdit}><X size={16} /></button>
            </div>
            <div className="bo-form">
              <label className="bo-field">
                <span>이름 *</span>
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
              </label>
              <div className="bo-field-row">
                <label className="bo-field">
                  <span>종류</span>
                  <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                    {NODE_KINDS.map((k) => <option key={k} value={k}>{NODE_KIND_LABEL[k]}</option>)}
                  </select>
                </label>
                <label className="bo-field">
                  <span>상태</span>
                  <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                    {NODE_STATUSES.map((s) => <option key={s} value={s}>{NODE_STATUS_LABEL[s]}</option>)}
                  </select>
                </label>
              </div>
              <div className="bo-field-row">
                <label className="bo-field">
                  <span>도메인 / page_type</span>
                  <input value={draft.domain} onChange={(e) => setDraft({ ...draft, domain: e.target.value })} placeholder="payroll, engine…" />
                </label>
                <label className="bo-field">
                  <span>필요역할</span>
                  <select value={draft.required_role} onChange={(e) => setDraft({ ...draft, required_role: e.target.value })}>
                    {NODE_ROLES.map((r) => <option key={r} value={r}>{NODE_ROLE_LABEL[r]}</option>)}
                  </select>
                </label>
              </div>
              <label className="bo-field">
                <span>URL (비우면 현 모놀리스 내부 page_type)</span>
                <input value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="/thinkmap/ 또는 https://…" />
              </label>
              <label className="bo-field">
                <span>정렬순서</span>
                <input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} />
              </label>
              <label className="bo-field">
                <span>메모</span>
                <textarea rows={3} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
              </label>
            </div>
            <div className="bo-modal-foot">
              <button className="bo-btn-ghost" onClick={closeEdit}>취소</button>
              <button className="bo-btn-primary" onClick={save}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
