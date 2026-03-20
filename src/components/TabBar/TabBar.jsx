import React, { useState, useRef, useEffect, useCallback } from 'react'
import './TabBar.css'

export function TabBar({
  tabs, activeTabId, onSwitch, onAdd, onRemove, onReorder, onMoveTab,
  paneIndex,
  buildBreadcrumb, getBreadcrumbSiblings, onBreadcrumbNavigate,
}) {
  // 드롭다운 상태: { tabId, partIndex, type, items, anchorRect }
  const [dropdown, setDropdown] = useState(null)
  const dropdownRef = useRef(null)

  // 드래그 앤 드롭 상태
  const [dragIndex, setDragIndex] = useState(null)
  const [dropIndex, setDropIndex] = useState(null)
  const [crossDrop, setCrossDrop] = useState(false) // 다른 패널에서 드래그 중

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    if (!dropdown) return
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [dropdown])

  // breadcrumb 파트 클릭 → 드롭다운 열기 (활성 탭에서만)
  const handlePartClick = useCallback((e, tab, part, partIndex) => {
    e.stopPropagation()
    if (tab.id !== activeTabId) {
      onSwitch(tab.id)
      return
    }
    if (part.type === 'none') return

    const rect = e.currentTarget.getBoundingClientRect()
    const items = getBreadcrumbSiblings(part)

    if (dropdown && dropdown.tabId === tab.id && dropdown.partIndex === partIndex) {
      setDropdown(null)
      return
    }

    setDropdown({
      tabId: tab.id,
      partIndex,
      type: part.type,
      currentId: part.id,
      items,
      anchorRect: rect,
    })
  }, [activeTabId, onSwitch, getBreadcrumbSiblings, dropdown])

  const handleDropdownSelect = useCallback((type, id) => {
    onBreadcrumbNavigate(type, id)
    setDropdown(null)
  }, [onBreadcrumbNavigate])

  const dropdownHeader = dropdown
    ? dropdown.type === 'user' ? '계정' : dropdown.type === 'project' ? '프로젝트' : '페이지'
    : ''

  const renderBreadcrumb = (tab) => {
    if (!buildBreadcrumb) return <span className="tab-bar-label">새 탭</span>
    const parts = buildBreadcrumb(tab)
    const isActive = tab.id === activeTabId
    return (
      <span className="tab-bar-breadcrumb">
        {parts.map((part, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="tab-breadcrumb-sep">/</span>}
            <span
              className={`tab-breadcrumb-part ${i === parts.length - 1 ? 'current' : ''} ${isActive && part.type !== 'none' ? 'clickable' : ''} ${dropdown && dropdown.tabId === tab.id && dropdown.partIndex === i ? 'open' : ''}`}
              onClick={isActive ? (e) => handlePartClick(e, tab, part, i) : undefined}
            >
              {part.name}
              {isActive && part.type !== 'none' && (
                <svg className="breadcrumb-chevron" width="10" height="10" viewBox="0 0 10 10">
                  <path d="M3 4l2 2 2-2" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
                </svg>
              )}
            </span>
          </React.Fragment>
        ))}
      </span>
    )
  }

  return (
    <div className="tab-bar">
      <div
        className={`tab-bar-tabs ${crossDrop && dropIndex === null ? 'tab-bar-cross-drop' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
        }}
        onDrop={(e) => {
          e.preventDefault()
          try {
            const data = JSON.parse(e.dataTransfer.getData('application/tab-drag'))
            if (data.paneIndex !== paneIndex && onMoveTab) {
              onMoveTab(data.paneIndex, data.tabIndex, tabs.length)
            }
          } catch {}
          setDragIndex(null)
          setDropIndex(null)
          setCrossDrop(false)
        }}
      >
        {tabs.map((tab, index) => {
          const isDragging = dragIndex === index && !crossDrop
          const isDropTarget = dropIndex === index
          const dropClass = isDropTarget
            ? (crossDrop || (dragIndex !== null && dragIndex < index) ? 'tab-drop-right' : 'tab-drop-left')
            : ''
          return (
          <div
            key={tab.id}
            className={`tab-bar-tab ${tab.id === activeTabId ? 'active' : ''} ${isDragging ? 'tab-dragging' : ''} ${dropClass}`}
            draggable
            onDragStart={(e) => {
              setDragIndex(index)
              setCrossDrop(false)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('application/tab-drag', JSON.stringify({ paneIndex, tabIndex: index }))
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              // 같은 패널 내 드래그
              if (dragIndex !== null && index !== dragIndex) {
                setDropIndex(index)
              }
              // 다른 패널에서 드래그 들어옴
              if (dragIndex === null) {
                setDropIndex(index)
                setCrossDrop(true)
              }
            }}
            onDragLeave={() => { setDropIndex(null); setCrossDrop(false) }}
            onDrop={(e) => {
              e.preventDefault()
              try {
                const data = JSON.parse(e.dataTransfer.getData('application/tab-drag'))
                if (data.paneIndex !== paneIndex && onMoveTab) {
                  // 크로스 패널 이동
                  onMoveTab(data.paneIndex, data.tabIndex, index)
                } else if (data.paneIndex === paneIndex && data.tabIndex !== index && onReorder) {
                  // 같은 패널 내 순서 변경
                  onReorder(data.tabIndex, index)
                }
              } catch {}
              setDragIndex(null)
              setDropIndex(null)
              setCrossDrop(false)
            }}
            onDragEnd={() => { setDragIndex(null); setDropIndex(null); setCrossDrop(false) }}
            onClick={() => { if (tab.id !== activeTabId) onSwitch(tab.id) }}
          >
            {renderBreadcrumb(tab)}
            <button
              className="tab-bar-close"
              onClick={e => { e.stopPropagation(); onRemove(tab.id) }}
              title="탭 닫기"
            >
              ✕
            </button>
          </div>
          )
        })}
        <button className="tab-bar-add" onClick={onAdd} title="새 탭 추가">
          +
        </button>
      </div>

      {/* Breadcrumb 드롭다운 */}
      {dropdown && (
        <div
          ref={dropdownRef}
          className="breadcrumb-dropdown"
          style={{
            top: dropdown.anchorRect.bottom + 4,
            left: dropdown.anchorRect.left,
          }}
        >
          <div className="breadcrumb-dropdown-header">
            {dropdownHeader}
          </div>
          <div className="breadcrumb-dropdown-list">
            {dropdown.items.map(item => (
              <button
                key={item.id ?? '__self__'}
                className={`breadcrumb-dropdown-item ${item.id === dropdown.currentId ? 'current' : ''}`}
                onClick={() => handleDropdownSelect(dropdown.type, item.id)}
              >
                {item.name}
                {item.id === dropdown.currentId && (
                  <svg width="12" height="12" viewBox="0 0 12 12" className="breadcrumb-dropdown-check">
                    <path d="M2.5 6l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
