import React from 'react'
import { X } from 'lucide-react'
import './Modal.css'

/**
 * 공통 모달 래퍼
 * 오버레이 클릭으로 닫기, stopPropagation 내장
 */
export function Modal({ isOpen, onClose, children, className = '' }) {
  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${className}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

/**
 * 모달 헤더 (아이콘 + 제목 + 닫기 버튼)
 */
export function ModalHeader({ icon: Icon, title, onClose, className = '' }) {
  return (
    <div className={`modal-header ${className}`}>
      <div className="modal-title">
        {Icon && <Icon size={20} />}
        <span>{title}</span>
      </div>
      <button className="modal-close-btn" onClick={onClose}>
        <X size={20} />
      </button>
    </div>
  )
}

/**
 * 모달 본문
 */
export function ModalBody({ children, className = '' }) {
  return (
    <div className={`modal-body ${className}`}>
      {children}
    </div>
  )
}

/**
 * 모달 하단 정보 영역
 */
export function ModalFooter({ children, className = '' }) {
  return (
    <div className={`modal-footer ${className}`}>
      {children}
    </div>
  )
}
