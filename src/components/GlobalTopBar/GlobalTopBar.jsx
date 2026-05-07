import React, { useState, useRef, useEffect } from 'react'
import { Shield, ChevronDown, Star, X, CalendarDays } from 'lucide-react'
import AdminModal from '../Admin/AdminModal'
import QuickTodo from '../QuickTodo/QuickTodo'
import { useAuthContext } from '../../contexts/AuthContext'
import { DAY_NAMES } from '../../utils/dateUtils'
import './GlobalTopBar.css'

export function GlobalTopBar({ splitMode, onSplitToggle, favorites = [], onFavoriteNavigate, onRemoveFavorite, onTodayWorklog, session }) {
  const {
    userEmail, ownEmail, userAvatarUrl, handleLogout, isMaster,
    isImpersonating, impersonatedEmail, stopImpersonation,
    isLinkedAccountSwitch, linkedAccounts,
    users, usersLoading, addUser, updateUserRole, updateUserStatus, deleteUser, fetchUsers,
    startImpersonation,
  } = useAuthContext()

  const [adminModalOpen, setAdminModalOpen] = useState(false)
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false)
  const [favListOpen, setFavListOpen] = useState(false)
  const dropdownRef = useRef(null)
  const favDropdownRef = useRef(null)

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    if (!accountDropdownOpen && !favListOpen) return
    const handleClick = (e) => {
      if (accountDropdownOpen && dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setAccountDropdownOpen(false)
      }
      if (favListOpen && favDropdownRef.current && !favDropdownRef.current.contains(e.target)) {
        setFavListOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [accountDropdownOpen, favListOpen])

  const now = new Date()
  const todayLabel = `${now.getMonth() + 1}/${now.getDate()}(${DAY_NAMES[now.getDay()]})`

  const hasLinkedAccounts = linkedAccounts && linkedAccounts.length > 0
  // 최상단 바에는 항상 실제 로그인 계정 표시 (탭별 전환 무관)
  const displayEmail = ownEmail || 'User'

  const handleSwitchAccount = (la) => {
    startImpersonation(la.linked_auth_uid, la.linked_email)
    setAccountDropdownOpen(false)
  }

  const handleBackToOwnAccount = () => {
    stopImpersonation()
    setAccountDropdownOpen(false)
  }

  return (
    <>
      {/* 북마크 바 — 크롬 북마크바 스타일, 향후 왼쪽에 검색 기능 추가 예정 */}
      {!isImpersonating && (
        <div className="bookmark-bar">
          <div className="bookmark-bar-left">
            <button
              className="bookmark-item bookmark-today-worklog"
              onClick={() => onTodayWorklog?.()}
              title="오늘 업무일지"
            >
              <CalendarDays size={12} />
              <span>오늘 - {todayLabel}</span>
            </button>
            {/* TODO: 검색 기능 (향후 추가 예정) */}
          </div>

          <div className="bookmark-bar-items">
            {favorites.map(fav => (
              <button
                key={fav.pageId}
                className="bookmark-item"
                onClick={() => onFavoriteNavigate?.(fav)}
                title={fav.pageName}
              >
                <span className="bookmark-item-icon">{fav.pageIcon || '📄'}</span>
                <span className="bookmark-item-name">{fav.pageName}</span>
              </button>
            ))}
          </div>

          <div className="bookmark-bar-right" ref={favDropdownRef}>
            <button
              className={`bookmark-all-btn ${favListOpen ? 'active' : ''}`}
              onClick={() => setFavListOpen(prev => !prev)}
              title="모든 즐겨찾기"
            >
              <Star size={12} fill={favListOpen ? 'currentColor' : 'none'} />
              <span>모든 즐겨찾기</span>
            </button>

            {favListOpen && (
              <div className="bookmark-dropdown">
                <div className="bookmark-dropdown-header">
                  <Star size={12} fill="currentColor" />
                  <span>모든 즐겨찾기</span>
                </div>
                {favorites.length === 0 ? (
                  <div className="bookmark-dropdown-empty">즐겨찾기가 없습니다</div>
                ) : (
                  <div className="bookmark-dropdown-list">
                    {favorites.map(fav => (
                      <div
                        key={fav.pageId}
                        className="bookmark-dropdown-item"
                        onClick={() => { onFavoriteNavigate?.(fav); setFavListOpen(false) }}
                      >
                        <span className="bookmark-dropdown-icon">{fav.pageIcon || '📄'}</span>
                        <div className="bookmark-dropdown-text">
                          <span className="bookmark-dropdown-name">{fav.pageName}</span>
                          {fav.projectName && (
                            <span className="bookmark-dropdown-project">{fav.projectName}</span>
                          )}
                        </div>
                        <button
                          className="bookmark-dropdown-remove"
                          onClick={(e) => { e.stopPropagation(); onRemoveFavorite?.(fav.pageId) }}
                          title="즐겨찾기 해제"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 뷰어 모드일 때: 마스터 전용 상단 바 */}
      {isImpersonating && (
        <div className="global-topbar topbar-admin-bar">
          <div className="topbar-left">
            <span className="topbar-app-name">ThinkMap</span>
            <div className="topbar-impersonation">
              <span className="topbar-viewer-badge">마스터</span>
              <span>{ownEmail}</span>
            </div>
          </div>
          <div className="topbar-right">
            <button
              className="topbar-button topbar-viewer-stop"
              onClick={stopImpersonation}
            >
              뷰어 종료하기
            </button>
          </div>
        </div>
      )}

      {/* 메인 상단 바 */}
      <div className={`global-topbar ${isImpersonating ? 'topbar-viewer-bar' : ''}`}>
        <div className="topbar-left">
          {!isImpersonating && <span className="topbar-app-name">ThinkMap</span>}
          {!isImpersonating && session && <QuickTodo session={session} />}
          {isImpersonating && (
            <div className="topbar-impersonation">
              <span className="topbar-viewer-badge">뷰어 모드</span>
              <span>{impersonatedEmail}</span>
            </div>
          )}
        </div>

        <div className="topbar-right">
          {onSplitToggle && (
            <button
              className={`topbar-button topbar-split ${splitMode ? 'topbar-split-active' : ''}`}
              onClick={onSplitToggle}
              title={splitMode ? '분할 닫기' : '화면 분할'}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <line x1="7" y1="1.5" x2="7" y2="12.5" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <span>분할</span>
            </button>
          )}

          {isMaster && !isImpersonating && (
            <button
              className="topbar-button topbar-admin"
              onClick={() => setAdminModalOpen(true)}
              title="마스터 패널"
            >
              <Shield size={15} />
              <span>마스터</span>
            </button>
          )}

          {/* 계정 전환 드롭다운 (연결 계정이 있을 때, 뷰어 모드 아닐 때) */}
          {!isImpersonating && hasLinkedAccounts ? (
            <div className="topbar-account-switcher" ref={dropdownRef}>
              <button
                className={`topbar-button topbar-account-btn ${isLinkedAccountSwitch ? 'topbar-account-linked' : ''}`}
                onClick={() => setAccountDropdownOpen(prev => !prev)}
                title="계정 전환"
              >
                <span className="topbar-email">{displayEmail}</span>
                <ChevronDown size={12} />
              </button>
              {accountDropdownOpen && (
                <div className="topbar-account-dropdown">
                  {isLinkedAccountSwitch && (
                    <button
                      className="topbar-account-option"
                      onClick={handleBackToOwnAccount}
                    >
                      <span className="account-option-label">내 계정</span>
                      <span className="account-option-email">{ownEmail}</span>
                    </button>
                  )}
                  {!isLinkedAccountSwitch && linkedAccounts.map(la => (
                    <button
                      key={la.linked_email}
                      className="topbar-account-option"
                      onClick={() => handleSwitchAccount(la)}
                    >
                      <span className="account-option-label">공용 계정</span>
                      <span className="account-option-email">{la.linked_email}</span>
                    </button>
                  ))}
                  {isLinkedAccountSwitch && linkedAccounts
                    .filter(la => la.linked_email !== impersonatedEmail)
                    .map(la => (
                      <button
                        key={la.linked_email}
                        className="topbar-account-option"
                        onClick={() => handleSwitchAccount(la)}
                      >
                        <span className="account-option-label">공용 계정</span>
                        <span className="account-option-email">{la.linked_email}</span>
                      </button>
                    ))
                  }
                </div>
              )}
            </div>
          ) : !isImpersonating ? (
            <div className="topbar-user">
              <span className="topbar-email">{displayEmail}</span>
            </div>
          ) : null}

          <button
            className="topbar-button topbar-logout"
            onClick={() => {
              if (window.confirm('로그아웃 하시겠습니까?')) handleLogout()
            }}
            title="로그아웃"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M5.5 2H3a1 1 0 00-1 1v9a1 1 0 001 1h2.5M10 10.5l3-3m0 0l-3-3m3 3H5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* 관리자 모달 */}
      {isMaster && (
        <AdminModal
          isOpen={adminModalOpen}
          onClose={() => setAdminModalOpen(false)}
          users={users}
          usersLoading={usersLoading}
          onAddUser={addUser}
          onUpdateUserRole={updateUserRole}
          onUpdateUserStatus={updateUserStatus}
          onDeleteUser={deleteUser}
          onRefresh={fetchUsers}
          onStartImpersonation={startImpersonation}
        />
      )}
    </>
  )
}
