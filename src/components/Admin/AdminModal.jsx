import React, { useState } from 'react'
import { Users, UserPlus, Shield, Link2, Trash2 } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { useAuthContext } from '../../contexts/AuthContext'
import { Modal, ModalHeader, ModalBody } from '../Common/Modal/Modal'
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
  const { linkedAdmin, isImpersonating, impersonatedEmail, stopImpersonation } = useAuthContext()
  const {
    allLinkedAccounts, loading: linkedLoading,
    fetchAll: refreshLinked,
    addLinkedAccount, updatePermission, deleteLinkedAccount,
  } = linkedAdmin

  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState('user')

  // 연결 계정 추가 폼
  const [linkPrimary, setLinkPrimary] = useState('')
  const [linkLinked, setLinkLinked] = useState('')
  const [linkPermission, setLinkPermission] = useState('editor')

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

    onStartImpersonation(authUid, user.email, true)
    onClose()
  }

  const handleAddLinkedAccount = async (e) => {
    e.preventDefault()
    if (!linkPrimary.trim() || !linkLinked.trim()) return
    if (linkPrimary.trim().toLowerCase() === linkLinked.trim().toLowerCase()) {
      alert('같은 이메일끼리는 연결할 수 없습니다.')
      return
    }

    const result = await addLinkedAccount(linkPrimary.trim(), linkLinked.trim(), linkPermission)
    if (result) {
      setLinkPrimary('')
      setLinkLinked('')
      setLinkPermission('editor')
    }
  }

  const handleDeleteLinked = async (la) => {
    if (window.confirm(`${la.primary_email} → ${la.linked_email} 연결을 삭제하시겠습니까?`)) {
      await deleteLinkedAccount(la.id)
    }
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

  const getPermissionLabel = (perm) => {
    switch (perm) {
      case 'editor': return '편집'
      case 'viewer': return '보기'
      default: return perm
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="admin-modal">
      <ModalHeader icon={Shield} title="관리자 패널" onClose={onClose} className="admin-modal-header" />

      <ModalBody className="admin-modal-content">
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
            <button type="submit" className="add-user-button">추가</button>
          </form>
        </div>

        {/* 사용자 목록 */}
        <div className="admin-section">
          <div className="admin-section-header">
            <Users size={16} />
            <span>사용자 목록</span>
            <button className="refresh-button" onClick={onRefresh}>새로고침</button>
          </div>

          {usersLoading ? (
            <div className="users-loading">로딩 중...</div>
          ) : users.length === 0 ? (
            <div className="users-empty">등록된 사용자가 없습니다.</div>
          ) : (
            <div className="users-list">
              {users.map((user) => {
                const isActing = isImpersonating && impersonatedEmail === user.email
                return (
                <div key={user.id} className={`user-item ${isActing ? 'user-item-acting' : ''}`}>
                  {isActing && (
                    <div className="acting-banner">
                      <span className="acting-banner-indicator">⬇ 이 계정으로 활동하기 중</span>
                      <button className="acting-stop-btn" onClick={() => { stopImpersonation(); onClose() }}>
                        뷰어 종료하기
                      </button>
                    </div>
                  )}
                  <div className="user-info">
                    <div className="user-email">{user.email}</div>
                    <div className="user-meta">
                      <span className={`user-role ${user.role}`}>{getRoleLabel(user.role)}</span>
                      <span className={`user-status ${user.status}`}>{getStatusLabel(user.status)}</span>
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
                          disabled={isActing}
                        >
                          활동하기
                        </button>
                        <button className="user-delete-button" onClick={() => handleDeleteUser(user)}>
                          삭제
                        </button>
                      </>
                    )}
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 연결 계정 관리 */}
        <div className="admin-section">
          <div className="admin-section-header">
            <Link2 size={16} />
            <span>연결 계정</span>
            <button className="refresh-button" onClick={refreshLinked}>새로고침</button>
          </div>

          <p className="admin-section-desc">
            사용자가 다른 계정의 데이터에 접근할 수 있도록 연결합니다.
          </p>

          <form className="linked-add-form" onSubmit={handleAddLinkedAccount}>
            <input
              type="email"
              placeholder="로그인 이메일 (사용자)"
              value={linkPrimary}
              onChange={(e) => setLinkPrimary(e.target.value)}
              className="add-user-input"
            />
            <span className="linked-arrow">→</span>
            <input
              type="email"
              placeholder="대상 이메일 (접근할 계정)"
              value={linkLinked}
              onChange={(e) => setLinkLinked(e.target.value)}
              className="add-user-input"
            />
            <select
              value={linkPermission}
              onChange={(e) => setLinkPermission(e.target.value)}
              className="add-user-role"
            >
              <option value="editor">편집</option>
              <option value="viewer">보기</option>
            </select>
            <button type="submit" className="add-user-button">연결</button>
          </form>

          {linkedLoading ? (
            <div className="users-loading">로딩 중...</div>
          ) : allLinkedAccounts.length === 0 ? (
            <div className="users-empty">등록된 연결 계정이 없습니다.</div>
          ) : (
            <div className="users-list linked-list">
              {allLinkedAccounts.map((la) => (
                <div key={la.id} className="user-item linked-item">
                  <div className="linked-info">
                    <span className="linked-email">{la.primary_email}</span>
                    <span className="linked-arrow-display">→</span>
                    <span className="linked-email">{la.linked_email}</span>
                  </div>
                  <div className="user-actions">
                    <select
                      value={la.permission}
                      onChange={(e) => updatePermission(la.id, e.target.value)}
                      className="user-role-select"
                    >
                      <option value="editor">편집</option>
                      <option value="viewer">보기</option>
                    </select>
                    <button
                      className="user-delete-button"
                      onClick={() => handleDeleteLinked(la)}
                      title="연결 삭제"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ModalBody>
    </Modal>
  )
}

export default AdminModal
