// 마케팅 캔버스 페어 생성 모달 (W4)
// 관련: docs/MARKETING-CANVAS-WIREFRAMES.md W4
//
// 동작:
//   - 이름 입력 후 confirm → useCanvasMutations.createPair RPC
//   - 성공 시 새 frame_page_id 로 onCreated 콜백 (보통 페이지 이동)
//
// Props:
//   - isOpen       : boolean
//   - onClose      : () => void
//   - userId       : 페어 소유자 (effectiveSession.user.id)
//   - masterId     : 마스터 (현재 사용자가 마스터일 경우 같음)
//   - onCreated    : (pairId, framePageId) => void

import React, { useState, useCallback } from 'react'
import { supabase } from '../../supabaseClient'
import { useCanvasMutations } from '../../hooks/useCanvasMutations'
import './CreateCanvasModal.css'

export default function CreateCanvasModal({
  isOpen,
  onClose,
  userId,
  masterId,
  onCreated,
}) {
  const [name, setName] = useState('마케팅 캔버스')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const { createPair } = useCanvasMutations()

  const handleSubmit = useCallback(async (e) => {
    e?.preventDefault?.()
    if (!userId || !masterId) {
      setError(new Error('사용자/마스터 정보가 없습니다.'))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const pairId = await createPair({
        userId,
        masterId,
        name: name.trim() || 'Marketing Canvas',
      })

      // 생성된 페어의 frame_page_id 를 조회 (RPC 가 pair_id 만 반환하므로)
      const { data: pair, error: fetchErr } = await supabase
        .from('canvas_pairs')
        .select('id, frame_page_id, engine_page_id')
        .eq('id', pairId)
        .single()
      if (fetchErr) throw fetchErr

      onCreated?.(pair.id, pair.frame_page_id)
      onClose?.()
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }, [userId, masterId, name, createPair, onCreated, onClose])

  if (!isOpen) return null

  return (
    <div className="canvas-modal-backdrop" onClick={onClose}>
      <div className="canvas-modal" onClick={(e) => e.stopPropagation()}>
        <header className="canvas-modal__header">
          <h3>새 마케팅 캔버스 만들기</h3>
          <button className="canvas-modal__close" onClick={onClose}>✕</button>
        </header>

        <form className="canvas-modal__body" onSubmit={handleSubmit}>
          <label className="canvas-modal__field">
            <span>이름</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="마케팅 캔버스"
              autoFocus
              disabled={submitting}
            />
          </label>

          <div className="canvas-modal__info">
            <p>✓ Marketing Frame 페이지 자동 생성</p>
            <p>✓ Marketing Engine 페이지 자동 생성 (페어로 묶음)</p>
            <p>✓ 양식 v7.44 + 기본 워크플로우 적용</p>
          </div>

          {error && (
            <div className="canvas-modal__error">
              생성 실패: {error.message || String(error)}
            </div>
          )}

          <footer className="canvas-modal__footer">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="canvas-modal__btn canvas-modal__btn--ghost"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="canvas-modal__btn canvas-modal__btn--primary"
            >
              {submitting ? '생성 중...' : '생성'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
