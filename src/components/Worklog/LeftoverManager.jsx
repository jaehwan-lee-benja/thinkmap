// 3년 초과 미완료 todo thread 정리 모달. WORKLOG-SPEC.md §6.3.

import React from 'react'
import { Modal, ModalHeader, ModalBody } from '@thinkmap/core'
import { Archive, CheckCircle2, Trash2 } from 'lucide-react'
import { useLeftoverTodos } from '../../hooks/useLeftoverTodos'
import './LeftoverManager.css'

function formatDate(s) {
  if (!s) return '-'
  return s.replaceAll('-', '/').slice(2)  // YY/MM/DD
}

export default function LeftoverManager({ isOpen, onClose, session, onJumpToPage }) {
  const { threads, loading, completeThread, deleteThread, refetch } = useLeftoverTodos(session)

  if (!isOpen) return null

  const handleComplete = async (t) => {
    if (!confirm(`"${t.text_content}" 를 완료 처리할까요? (thread 의 모든 row 체크됨)`)) return
    try { await completeThread(t.thread_id) } catch {}
  }
  const handleDelete = async (t) => {
    if (!confirm(`"${t.text_content}" 를 영구 폐기할까요? (thread 모두 삭제 표시)`)) return
    try { await deleteThread(t.thread_id) } catch {}
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="leftover-manager">
      <ModalHeader icon={Archive} title="오래된 미완료 todo 정리" onClose={onClose} />
      <ModalBody>
        <div className="leftover-desc">
          3년 이상 미완료 상태로 남아 자동 동기화 윈도우 (3년) 를 벗어난 todo 들이에요.
          이 화면에서 일괄 완료 또는 폐기 처리할 수 있어요.
        </div>

        {loading && <div className="leftover-loading">로딩...</div>}
        {!loading && threads.length === 0 && (
          <div className="leftover-empty">정리할 항목이 없습니다.</div>
        )}

        {threads.length > 0 && (
          <div className="leftover-list">
            {threads.map(t => (
              <div key={t.thread_id} className="leftover-item">
                <div className="leftover-text">
                  <div className="leftover-text-main">{t.text_content || '(빈 텍스트)'}</div>
                  <div className="leftover-meta">
                    최초 {formatDate(t.carry_over_from || t.latest_page_date)}
                    {' · '}이월 {t.thread_length}회
                    {' · '}최근 {formatDate(t.latest_page_date)}
                  </div>
                </div>
                <div className="leftover-actions">
                  {onJumpToPage && (
                    <button
                      type="button"
                      className="leftover-action leftover-jump"
                      onClick={() => { onJumpToPage(t.latest_page_id); onClose?.() }}
                      title="해당 페이지로 이동"
                    >
                      이동
                    </button>
                  )}
                  <button
                    type="button"
                    className="leftover-action leftover-complete"
                    onClick={() => handleComplete(t)}
                    title="완료 처리"
                  >
                    <CheckCircle2 size={14} />
                    <span>완료</span>
                  </button>
                  <button
                    type="button"
                    className="leftover-action leftover-delete"
                    onClick={() => handleDelete(t)}
                    title="영구 폐기"
                  >
                    <Trash2 size={14} />
                    <span>폐기</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {threads.length > 0 && (
          <div className="leftover-footer">
            <button type="button" className="leftover-refresh" onClick={refetch}>새로고침</button>
            <span className="leftover-count">{threads.length}건</span>
          </div>
        )}
      </ModalBody>
    </Modal>
  )
}
