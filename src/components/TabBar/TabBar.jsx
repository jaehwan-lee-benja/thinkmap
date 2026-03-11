import React, { useState, useRef, useEffect, useCallback } from 'react'
import './TabBar.css'

export function TabBar({
  tabs, activeTabId, onSwitch, onAdd, onRemove,
  buildBreadcrumb, getBreadcrumbSiblings, onBreadcrumbNavigate,
}) {
  // 드롭다운 상태: { tabId, partIndex, type, items, anchorRect }
  const [dropdown, setDropdown] = useState(null)
  const dropdownRef = useRef(null)

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
      <div className="tab-bar-tabs">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`tab-bar-tab ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => { if (tab.id !== activeTabId) onSwitch(tab.id) }}
          >
            {renderBreadcrumb(tab)}
            {tabs.length > 1 && (
              <button
                className="tab-bar-close"
                onClick={e => { e.stopPropagation(); onRemove(tab.id) }}
                title="탭 닫기"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="tab-bar-actions">
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
