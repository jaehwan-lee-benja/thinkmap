/**
 * Google 로그인 인증 화면 컴포넌트
 * - 로딩 중 화면 (authLoading)
 * - 로그인 화면 (!session)
 */
import './GoogleAuthButton.css'

export default function GoogleAuthButton({ authLoading, session, handleGoogleLogin }) {
  // 인증 로딩 중
  if (authLoading) {
    return (
      <div className="app auth-screen">
        <div className="auth-loading">
          <div className="auth-loading-icon">🔄</div>
          <div>로딩 중...</div>
        </div>
      </div>
    )
  }

  // 로그인 화면
  if (!session) {
    return (
      <div className="app auth-screen">
        <div className="auth-login-card">
          <h1 className="auth-login-title">ThinkMap</h1>
          <p className="auth-login-subtitle">
            생각을 정리하는 공간
          </p>
          <button onClick={handleGoogleLogin} className="auth-login-button">
            <span>🔐</span>
            Google로 로그인
          </button>
        </div>
      </div>
    )
  }

  // 로그인 완료 시에는 null 반환 (메인 앱 표시)
  return null
}
