// 헤더 컴포넌트 (간소화 버전 - KeyThoughts 전용)
function Header({ onLogout, onShowHistory }) {
  return (
    <div className="header-fixed">
      <div className="settings-bar">
        <h1 className="app-title">💡 KeyThoughts</h1>

        <div className="header-actions">
          <button
            onClick={onShowHistory}
            className="history-button"
            title="버전 히스토리"
          >
            🕐 히스토리
          </button>
          <button
            onClick={onLogout}
            className="logout-button"
            title="로그아웃"
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  )
}

export default Header
