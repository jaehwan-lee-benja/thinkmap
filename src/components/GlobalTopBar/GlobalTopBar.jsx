import React, { useState } from 'react'
import { Shield } from 'lucide-react'
import AdminModal from '../Admin/AdminModal'
import { useAuthContext } from '../../contexts/AuthContext'
import './GlobalTopBar.css'

export function GlobalTopBar({ splitMode, onSplitToggle }) {
  const {
    userEmail, userAvatarUrl, handleLogout, isMaster,
    isImpersonating, impersonatedEmail, stopImpersonation,
    users, usersLoading, addUser, updateUserRole, updateUserStatus, deleteUser, fetchUsers,
    startImpersonation,
  } = useAuthContext()

  const [adminModalOpen, setAdminModalOpen] = useState(false)

  return (
    <>
      <div className="global-topbar">
        <div className="topbar-left">
          <span className="topbar-app-name">ThinkMap</span>
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

          {isMaster && (
            <button
              className="topbar-button topbar-admin"
              onClick={() => setAdminModalOpen(true)}
              title="관리자 패널"
            >
              <Shield size={15} />
              <span>관리자</span>
            </button>
          )}

          <div className="topbar-user">
            <span className="topbar-email">{userEmail || 'User'}</span>
          </div>

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
