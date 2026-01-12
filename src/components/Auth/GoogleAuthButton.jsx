/**
 * Google 로그인 인증 화면 컴포넌트
 * - 로딩 중 화면 (authLoading)
 * - 로그인 화면 (!session)
 */

export default function GoogleAuthButton({ authLoading, session, handleGoogleLogin }) {
  // 인증 로딩 중
  if (authLoading) {
    return (
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔄</div>
          <div>로딩 중...</div>
        </div>
      </div>
    )
  }

  // 로그인 화면
  if (!session) {
    return (
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '16px',
          maxWidth: '400px'
        }}>
          <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>ThinkMap</h1>
          <p style={{ fontSize: '1.1rem', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '2rem' }}>
            생각을 정리하는 공간
          </p>
          <button
            onClick={handleGoogleLogin}
            style={{
              padding: '1rem 2rem',
              fontSize: '1.1rem',
              background: '#646cff',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              margin: '0 auto'
            }}
          >
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
