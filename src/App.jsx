import React, { useEffect } from 'react'
import KeyThoughtsSection from './components/KeyThoughts/KeyThoughtsSection'
import KeyThoughtsHistoryModal from './components/Modals/KeyThoughtsHistoryModal'
import GoogleAuthButton from './components/Auth/GoogleAuthButton'
import Header from './components/Navigation/Header'
import { useAuth } from './hooks/useAuth'
import { useKeyThoughts } from './hooks/useKeyThoughts'
import './App.css'

function App() {
  const { session, authLoading, handleGoogleLogin, handleLogout } = useAuth()

  const {
    keyThoughtsBlocks,
    setKeyThoughtsBlocks,
    focusedBlockId,
    setFocusedBlockId,
    keyThoughtsHistory,
    showKeyThoughtsHistory,
    setShowKeyThoughtsHistory,
    fetchKeyThoughtsContent,
    handleSaveKeyThoughts,
    fetchKeyThoughtsHistory,
    restoreKeyThoughtsVersion,
  } = useKeyThoughts(session)

  // 앱 시작 시 데이터 로드
  useEffect(() => {
    if (!session) return
    fetchKeyThoughtsContent()
  }, [session])

  // 자동 저장 (5초 debounce)
  useEffect(() => {
    if (!session) return

    const timer = setTimeout(() => {
      handleSaveKeyThoughts()
    }, 5000)

    return () => clearTimeout(timer)
  }, [keyThoughtsBlocks, session])

  // 인증 화면
  const authScreen = GoogleAuthButton({
    authLoading,
    session,
    handleGoogleLogin
  })
  if (authScreen) return authScreen

  // 메인 화면
  return (
    <div className="app">
      <div className="container">
        <Header
          onLogout={handleLogout}
          onShowHistory={() => {
            fetchKeyThoughtsHistory()
            setShowKeyThoughtsHistory(true)
          }}
        />

        <div className="content-scrollable">
          <KeyThoughtsSection
            blocks={keyThoughtsBlocks}
            setBlocks={setKeyThoughtsBlocks}
            focusedBlockId={focusedBlockId}
            setFocusedBlockId={setFocusedBlockId}
            onShowHistory={() => {
              fetchKeyThoughtsHistory()
              setShowKeyThoughtsHistory(true)
            }}
          />
        </div>

        <KeyThoughtsHistoryModal
          showKeyThoughtsHistory={showKeyThoughtsHistory}
          onClose={() => setShowKeyThoughtsHistory(false)}
          keyThoughtsHistory={keyThoughtsHistory}
          onRestoreVersion={restoreKeyThoughtsVersion}
        />
      </div>
    </div>
  )
}

export default App
