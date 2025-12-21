// Toast 알림 컴포넌트
function Toast({ message, onUndo, variant = 'default' }) {
  const className = variant === 'success' ? 'undo-toast success-toast' : 'undo-toast'

  return (
    <div className={className}>
      <span>{message}</span>
      {onUndo && (
        <button onClick={onUndo} className="undo-button">
          취소
        </button>
      )}
    </div>
  )
}

export default Toast
