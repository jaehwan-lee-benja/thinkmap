import React, { useEffect, useState } from 'react'
import KeyThoughtsSection from './components/KeyThoughts/KeyThoughtsSection'
import KeyThoughtsHistoryModal from './components/Modals/KeyThoughtsHistoryModal'
import GoogleAuthButton from './components/Auth/GoogleAuthButton'
import Header from './components/Navigation/Header'
import { useAuth } from './hooks/useAuth'
import { useKeyThoughts } from './hooks/useKeyThoughts'
import { migrateJSONtoBlocks, rollbackToJSON } from './utils/migration'
import { supabase } from './supabaseClient'
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

  // 마이그레이션 상태 (최적화된 스키마를 사용하므로 항상 'completed')
  const [migrationStatus, setMigrationStatus] = useState('completed')
  const [migrating, setMigrating] = useState(false)

  // 마이그레이션 상태 확인 (최적화된 스키마에서는 불필요)
  useEffect(() => {
    if (!session?.user?.id) return

    // 최적화된 스키마를 사용하므로 항상 completed 상태로 설정
    setMigrationStatus('completed')
  }, [session])

  // 마이그레이션 실행
  const handleMigration = async () => {
    if (!session?.user?.id) return

    const confirmed = window.confirm(
      '⚠️  JSON → 개별 레코드 마이그레이션을 시작하시겠습니까?\n\n' +
      '이 작업은 되돌릴 수 있지만, 한 번만 실행해야 합니다.\n' +
      '진행하시겠습니까?'
    )

    if (!confirmed) return

    setMigrating(true)

    try {
      const result = await migrateJSONtoBlocks(session.user.id)

      if (result.success) {
        alert(`🎉 마이그레이션 완료!\n\n${result.count}개 블록이 성공적으로 변환되었습니다.`)
        setMigrationStatus('completed')
        // 페이지 새로고침
        window.location.reload()
      } else {
        alert('⚠️  마이그레이션이 완료되었으나 검증에서 문제가 발견되었습니다.\n콘솔을 확인하세요.')
      }
    } catch (error) {
      alert(`❌ 마이그레이션 오류:\n${error.message}\n\n롤백하려면 콘솔에서 rollbackToJSON()을 실행하세요.`)
      console.error('마이그레이션 오류:', error)
    } finally {
      setMigrating(false)
    }
  }

  // 롤백 실행
  const handleRollback = async () => {
    if (!session?.user?.id) return

    const confirmed = window.confirm(
      '⚠️  JSON 방식으로 롤백하시겠습니까?\n\n' +
      'blocks 테이블의 모든 데이터가 삭제되고\n' +
      '백업된 JSON 데이터로 복구됩니다.'
    )

    if (!confirmed) return

    setMigrating(true)

    try {
      await rollbackToJSON(session.user.id)
      alert('✅ JSON 방식으로 롤백 완료!')
      setMigrationStatus('pending')
      window.location.reload()
    } catch (error) {
      alert(`❌ 롤백 오류:\n${error.message}`)
      console.error('롤백 오류:', error)
    } finally {
      setMigrating(false)
    }
  }

  // 앱 시작 시 데이터 로드
  useEffect(() => {
    if (!session) return
    if (migrationStatus !== 'completed') return // 마이그레이션 완료 후에만 로드

    fetchKeyThoughtsContent()
  }, [session, migrationStatus])

  // 자동 저장 (5초 debounce)
  useEffect(() => {
    if (!session) return
    if (migrationStatus !== 'completed') return

    const timer = setTimeout(() => {
      handleSaveKeyThoughts()
    }, 5000)

    return () => clearTimeout(timer)
  }, [keyThoughtsBlocks, session, migrationStatus])

  // 인증 화면
  const authScreen = GoogleAuthButton({
    authLoading,
    session,
    handleGoogleLogin
  })
  if (authScreen) return authScreen

  // 마이그레이션 대기 화면
  if (migrationStatus === 'pending') {
    return (
      <div className="app">
        <div className="container">
          <div style={{
            maxWidth: '600px',
            margin: '100px auto',
            padding: '40px',
            backgroundColor: '#f9fafb',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            textAlign: 'center'
          }}>
            <h2 style={{ marginBottom: '20px', color: '#111827' }}>
              🚀 데이터 마이그레이션 필요
            </h2>
            <p style={{ marginBottom: '30px', color: '#6b7280', lineHeight: '1.6' }}>
              새로운 블록 저장 방식으로 전환하려면 마이그레이션이 필요합니다.<br />
              기존 데이터는 자동으로 백업되며, 언제든지 롤백할 수 있습니다.
            </p>

            <div style={{ marginBottom: '20px' }}>
              <button
                onClick={handleMigration}
                disabled={migrating}
                style={{
                  padding: '12px 32px',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#fff',
                  backgroundColor: migrating ? '#9ca3af' : '#6366f1',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: migrating ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (!migrating) e.target.style.backgroundColor = '#4f46e5'
                }}
                onMouseLeave={(e) => {
                  if (!migrating) e.target.style.backgroundColor = '#6366f1'
                }}
              >
                {migrating ? '마이그레이션 중...' : '마이그레이션 시작'}
              </button>
            </div>

            <details style={{ marginTop: '30px', textAlign: 'left' }}>
              <summary style={{ cursor: 'pointer', color: '#6b7280', marginBottom: '10px' }}>
                변경 사항 보기
              </summary>
              <ul style={{ color: '#6b7280', lineHeight: '1.8', paddingLeft: '20px' }}>
                <li>✅ 블록별 검색 가능</li>
                <li>✅ 블록별 수정 이력 추적</li>
                <li>✅ 블록 참조 기능 (같은 블록을 여러 곳에 배치)</li>
                <li>✅ 더 빠른 로딩 및 저장</li>
              </ul>
            </details>
          </div>
        </div>
      </div>
    )
  }

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

        {/* 마이그레이션 완료 알림 (임시) */}
        {migrationStatus === 'completed' && (
          <div style={{
            padding: '12px',
            backgroundColor: '#f0fdf4',
            border: '1px solid #86efac',
            borderRadius: '8px',
            margin: '10px 0',
            fontSize: '14px',
            color: '#166534',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>✅ 새로운 블록 시스템 사용 중</span>
            <button
              onClick={handleRollback}
              style={{
                padding: '4px 12px',
                fontSize: '12px',
                color: '#dc2626',
                backgroundColor: 'transparent',
                border: '1px solid #dc2626',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              롤백
            </button>
          </div>
        )}

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
