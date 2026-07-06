import React, { useState, useEffect } from 'react'
import './DeleteToast.css'

function DeleteToast({ pageName, onUndo, onDismiss, duration = 5000 }) {
  const [visible, setVisible] = useState(true)
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    const startTime = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(remaining)
      if (remaining <= 0) clearInterval(interval)
    }, 50)

    const timer = setTimeout(() => {
      setVisible(false)
      onDismiss?.()
    }, duration)

    return () => {
      clearInterval(interval)
      clearTimeout(timer)
    }
  }, [duration, onDismiss])

  if (!visible) return null

  return (
    <div className="delete-toast">
      <div className="delete-toast-content">
        <span className="delete-toast-message">
          "{pageName}" 페이지가 삭제되었습니다
        </span>
        <button className="delete-toast-undo" onClick={onUndo}>
          취소
        </button>
      </div>
      <div className="delete-toast-progress">
        <div
          className="delete-toast-progress-bar"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

export default DeleteToast
