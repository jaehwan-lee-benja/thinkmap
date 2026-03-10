import React, { useState } from 'react'
import { HardDrive, Shield } from 'lucide-react'
import BackupModal from '../Backup/BackupModal'
import AdminModal from '../Admin/AdminModal'
import { useAuthContext } from '../../contexts/AuthContext'
import { useProjectContext } from '../../contexts/ProjectContext'
import { usePageContext } from '../../contexts/PageContext'
import { useBackupContext } from '../../contexts/BackupContext'
import './GlobalTopBar.css'

export function GlobalTopBar() {
  const {
    userEmail, userAvatarUrl, handleLogout, isMaster,
    isImpersonating, impersonatedEmail, stopImpersonation,
    users, usersLoading, addUser, updateUserRole, updateUserStatus, deleteUser, fetchUsers,
    startImpersonation,
  } = useAuthContext()

  const { projects, currentProjectId } = useProjectContext()
  const { pages } = usePageContext()
  const { backups, backupLoading, createBackup, restoreBackup, deleteBackup, exportBackup, importBackup, refreshBackups } = useBackupContext()

  const [backupModalOpen, setBackupModalOpen] = useState(false)
  const [adminModalOpen, setAdminModalOpen] = useState(false)

  const currentProject = projects.find(p => p.id === currentProjectId)

  return (
    <>
      <div className="global-topbar">
        <div className="topbar-left">
          <span className="topbar-app-name">ThinkMap</span>
        </div>

        {/* 임퍼소네이션 배너 */}
        {isImpersonating && (
          <div className="topbar-impersonation">
            <span>{impersonatedEmail} 계정으로 활동 중</span>
            <button onClick={stopImpersonation}>돌아가기</button>
          </div>
        )}

        <div className="topbar-right">
          <button
            className="topbar-button"
            onClick={() => setBackupModalOpen(true)}
            title="프로젝트 백업"
          >
            <HardDrive size={15} />
          </button>

          {isMaster && (
            <button
              className="topbar-button topbar-admin"
              onClick={() => setAdminModalOpen(true)}
              title="관리자 패널"
            >
              <Shield size={15} />
            </button>
          )}

          <div className="topbar-user">
            <div className="topbar-avatar">
              {userAvatarUrl ? (
                <img src={userAvatarUrl} alt="" className="topbar-avatar-img" />
              ) : (
                userEmail ? userEmail.charAt(0).toUpperCase() : 'U'
              )}
            </div>
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

      {/* 백업 모달 */}
      <BackupModal
        isOpen={backupModalOpen}
        onClose={() => setBackupModalOpen(false)}
        project={currentProject}
        pages={pages}
        backups={backups}
        isLoading={backupLoading}
        onCreateBackup={createBackup}
        onRestoreBackup={restoreBackup}
        onDeleteBackup={deleteBackup}
        onExportBackup={exportBackup}
        onImportBackup={importBackup}
        onRefresh={refreshBackups}
      />

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
