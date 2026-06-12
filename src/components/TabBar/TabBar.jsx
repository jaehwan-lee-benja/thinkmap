import React, { useState, useRef, useEffect, useCallback } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, List } from 'lucide-react'
import { isCalendarPage } from '../../utils/pageTypes'
import './TabBar.css'

export function TabBar({
  tabs, activeTabId, onSwitch, onAdd, onRemove, onReorder, onMoveTab,
  paneIndex,
  buildBreadcrumb, getBreadcrumbSiblings, onBreadcrumbNavigate,
  highlightedTabId,
}) {
  const [dropdown, setDropdown] = useState(null)
  const dropdownRef = useRef(null)
  const [tabListOpen, setTabListOpen] = useState(false)
  const tabListRef = useRef(null)
  const tabListBtnRef = useRef(null)
  const [tabListRect, setTabListRect] = useState(null)

  // 가로 스크롤
  const scrollRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 1)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateScrollState()
    el.addEventListener('scroll', updateScrollState)
    const ro = new ResizeObserver(updateScrollState)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', updateScrollState)
      ro.disconnect()
    }
  }, [updateScrollState, tabs.length])

  // 활성 탭이 바뀌면 해당 탭으로 스크롤
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const activeEl = el.querySelector('.tab-bar-tab.active')
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }
  }, [activeTabId])

  const scrollBy = (dir) => {
    scrollRef.current?.scrollBy({ left: dir * 150, behavior: 'smooth' })
  }

  // 드래그 앤 드롭
  const [dragIndex, setDragIndex] = useState(null)
  const [dropIndex, setDropIndex] = useState(null)
  const [crossDrop, setCrossDrop] = useState(false)

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    if (!dropdown && !tabListOpen) return
    const handleClick = (e) => {
      if (dropdown && dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdown(null)
      }
      if (tabListOpen) {
        const inList = tabListRef.current?.contains(e.target)
        const inBtn = tabListBtnRef.current?.contains(e.target)
        if (!inList && !inBtn) setTabListOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [dropdown, tabListOpen])

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

  const getTabInfo = (tab) => {
    if (!buildBreadcrumb) return { label: '새 탭', icon: null }
    const parts = buildBreadcrumb(tab)
    const last = parts[parts.length - 1]
    const label = isCalendarPage(last?.pageType) ? '업무일지' : (last?.name || '새 탭')
    const icon = last?.icon || null
    return { label, icon }
  }

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
              {part.icon
                ? <span style={{ marginRight: 3, flexShrink: 0, fontSize: 12 }}>{part.icon}</span>
                : isCalendarPage(part.pageType)
                  ? <CalendarDays size={12} style={{ marginRight: 3, verticalAlign: -1, flexShrink: 0 }} />
                  : null
              }
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
      {/* 탭 리스트 드롭다운 버튼 */}
      <button
        ref={tabListBtnRef}
        className={`tab-bar-list-btn ${tabListOpen ? 'active' : ''}`}
        onClick={() => {
          if (!tabListOpen && tabListBtnRef.current) {
            setTabListRect(tabListBtnRef.current.getBoundingClientRect())
          }
          setTabListOpen(prev => !prev)
        }}
        title="탭 목록"
      >
        <List size={14} />
      </button>

      {/* 왼쪽 스크롤 화살표 */}
      {canScrollLeft && (
        <button className="tab-scroll-btn tab-scroll-left" onClick={() => scrollBy(-1)}>
          <ChevronLeft size={14} />
        </button>
      )}

      {/* 탭 영역 (가로 스크롤) */}
      <div
        ref={scrollRef}
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
            className={`tab-bar-tab ${tab.id === activeTabId ? 'active' : ''} ${tab.id === highlightedTabId ? 'tab-highlighted' : ''} ${isDragging ? 'tab-dragging' : ''} ${dropClass}`}
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
              if (dragIndex !== null && index !== dragIndex) setDropIndex(index)
              if (dragIndex === null) { setDropIndex(index); setCrossDrop(true) }
            }}
            onDragLeave={() => { setDropIndex(null); setCrossDrop(false) }}
            onDrop={(e) => {
              e.preventDefault()
              try {
                const data = JSON.parse(e.dataTransfer.getData('application/tab-drag'))
                if (data.paneIndex !== paneIndex && onMoveTab) {
                  onMoveTab(data.paneIndex, data.tabIndex, index)
                } else if (data.paneIndex === paneIndex && data.tabIndex !== index && onReorder) {
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

      {/* 오른쪽 스크롤 화살표 */}
      {canScrollRight && (
        <button className="tab-scroll-btn tab-scroll-right" onClick={() => scrollBy(1)}>
          <ChevronRight size={14} />
        </button>
      )}

      {/* 전체 탭 리스트 드롭다운 */}
      {tabListOpen && tabListRect && (
        <div
          ref={tabListRef}
          className="tab-list-dropdown"
          style={{
            top: tabListRect.bottom + 4,
            left: tabListRect.left,
          }}
        >
          <div className="tab-list-dropdown-header">
            탭 목록 ({tabs.length})
          </div>
          <div className="tab-list-dropdown-list">
            {tabs.map(tab => (
              <div
                key={tab.id}
                className={`tab-list-item ${tab.id === activeTabId ? 'active' : ''}`}
                onClick={() => { onSwitch(tab.id); setTabListOpen(false) }}
              >
                <span className="tab-list-item-icon">{getTabInfo(tab).icon || '📄'}</span>
                <span className="tab-list-item-name">{getTabInfo(tab).label}</span>
                <button
                  className="tab-list-item-close"
                  onClick={(e) => { e.stopPropagation(); onRemove(tab.id) }}
                  title="탭 닫기"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0 }}>
                  {isCalendarPage(item.pageType) && <CalendarDays size={12} style={{ flexShrink: 0 }} />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isCalendarPage(item.pageType) ? '업무일지(개발중)' : item.name}</span>
                </span>
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
