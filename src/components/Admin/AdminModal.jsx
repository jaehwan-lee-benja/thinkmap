import React, { useState } from 'react'
import { Users, UserPlus, Shield, X } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import './AdminModal.css'

function AdminModal({
  isOpen,
  onClose,
  users,
  usersLoading,
  onAddUser,
  onUpdateUserRole,
  onUpdateUserStatus,
  onDeleteUser,
  onRefresh,
  onStartImpersonation,
}) {
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState('user')

  if (!isOpen) return null

  const handleAddUser = async (e) => {
    e.preventDefault()
    if (!newEmail.trim()) return

    const result = await onAddUser(newEmail.trim(), newRole)
    if (result) {
      setNewEmail('')
      setNewRole('user')
    }
  }

  const handleDeleteUser = async (user) => {
    if (window.confirm(`${user.email}을(를) 삭제하시겠습니까?`)) {
      await onDeleteUser(user.id)
    }
  }

  const handleActAsUser = async (user) => {
    const { data: authUid, error } = await supabase
      .rpc('get_user_id_by_email', { email_input: user.email })

    if (error || !authUid) {
      alert('해당 사용자의 인증 정보를 찾을 수 없습니다.\n아직 로그인하지 않은 사용자일 수 있습니다.')
      return
    }

    onStartImpersonation(authUid, user.email)
    onClose()
  }

  const getRoleLabel = (role) => {
    switch (role) {
      case 'master': return '마스터'
      case 'admin': return '관리자'
      case 'user': return '사용자'
      default: return role
    }
  }

  const getStatusLabel = (status) => {
    switch (status) {
      case 'active': return '활성'
      case 'invited': return '초대됨'
      case 'inactive': return '비활성'
      default: return status
    }
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">
            <Shield size={20} />
            <span>관리자 패널</span>
          </div>
          <button className="admin-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="admin-modal-content">
          {/* 사용자 추가 폼 */}
          <div className="admin-section">
            <div className="admin-section-header">
              <UserPlus size={16} />
              <span>사용자 추가</span>
            </div>
            <form className="add-user-form" onSubmit={handleAddUser}>
              <input
                type="email"
                placeholder="이메일 주소"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="add-user-input"
              />
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="add-user-role"
              >
                <option value="user">사용자</option>
                <option value="admin">관리자</option>
              </select>
              <button type="submit" className="add-user-button">
                추가
              </button>
            </form>
          </div>

          {/* 사용자 목록 */}
          <div className="admin-section">
            <div className="admin-section-header">
              <Users size={16} />
              <span>사용자 목록</span>
              <button className="refresh-button" onClick={onRefresh}>
                새로고침
              </button>
            </div>

            {usersLoading ? (
              <div className="users-loading">로딩 중...</div>
            ) : users.length === 0 ? (
              <div className="users-empty">등록된 사용자가 없습니다.</div>
            ) : (
              <div className="users-list">
                {users.map((user) => (
                  <div key={user.id} className="user-item">
                    <div className="user-info">
                      <div className="user-email">{user.email}</div>
                      <div className="user-meta">
                        <span className={`user-role ${user.role}`}>
                          {getRoleLabel(user.role)}
                        </span>
                        <span className={`user-status ${user.status}`}>
                          {getStatusLabel(user.status)}
                        </span>
                      </div>
                    </div>
                    <div className="user-actions">
                      <select
                        value={user.role}
                        onChange={(e) => onUpdateUserRole(user.id, e.target.value)}
                        className="user-role-select"
                        disabled={user.role === 'master'}
                      >
                        <option value="user">사용자</option>
                        <option value="admin">관리자</option>
                      </select>
                      <select
                        value={user.status}
                        onChange={(e) => onUpdateUserStatus(user.id, e.target.value)}
                        className="user-status-select"
                      >
                        <option value="active">활성</option>
                        <option value="inactive">비활성</option>
                      </select>
                      {user.role !== 'master' && (
                        <>
                          <button
                            className="user-impersonate-button"
                            onClick={() => handleActAsUser(user)}
                          >
                            활동하기
                          </button>
                          <button
                            className="user-delete-button"
                            onClick={() => handleDeleteUser(user)}
                          >
                            삭제
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminModal
