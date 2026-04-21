import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import TipTapEditor from './TipTapEditor'
import { multiSelectPluginKey } from './extensions/ToggleExtension'

// 뷰어 모드: 문서 JSON에서 토글 isOpen 오버라이드 적용/추출
function applyToggleOverrides(docJSON, overrides) {
  if (!docJSON?.content || !overrides || Object.keys(overrides).length === 0) return docJSON
  let idx = 0
  const walk = (node) => {
    if (node.type === 'toggle') {
      const myIdx = idx++
      const children = node.content ? node.content.map(walk) : []
      if (myIdx.toString() in overrides) {
        return { ...node, attrs: { ...node.attrs, isOpen: overrides[myIdx] }, content: children }
      }
      return { ...node, content: children }
    }
    if (node.content) return { ...node, content: node.content.map(walk) }
    return node
  }
  return { ...docJSON, content: docJSON.content.map(walk) }
}

function extractToggleStates(docJSON) {
  if (!docJSON?.content) return {}
  const states = {}
  let idx = 0
  const walk = (node) => {
    if (node.type === 'toggle') {
      states[idx++] = node.attrs?.isOpen ?? true
      if (node.content) node.content.forEach(walk)
    } else if (node.content) {
      node.content.forEach(walk)
    }
  }
  docJSON.content.forEach(walk)
  return states
}
// daily 페이지: h2 섹션만 추출하여 sectionOrder 순서로 정렬
// sectionOrder에 있는 섹션은 그 순서대로, 없는 섹션은 원래 content 순서 유지 (뒤에 붙음)
import { isH2Section } from '../../utils/sectionUtils'

function applySectionOrder(contentArray, sectionOrder) {
  const sections = contentArray.filter(isH2Section)
  if (!sectionOrder?.length) return sections

  // sectionOrder에 있는 것과 없는 것 분리
  const ordered = []
  const unordered = []
  const orderMap = new Map(sectionOrder.map((id, idx) => [id, idx]))

  for (const s of sections) {
    const id = s.attrs?.sectionId || ''
    if (orderMap.has(id)) {
      ordered.push({ section: s, idx: orderMap.get(id) })
    } else {
      unordered.push(s)
    }
  }

  // 순서가 있는 것은 sectionOrder 순서, 없는 것은 원래 순서 유지하여 뒤에
  ordered.sort((a, b) => a.idx - b.idx)
  return [...ordered.map(o => o.section), ...unordered]
}

import ColumnView from './ColumnView'
import MindMapView from './MindMapView'
import { supabase } from '../../supabaseClient'
import { convertFlatBlocksToTiptap } from './utils/convertBlocksToTiptap'
import { tiptapToColumnBlocks, columnBlocksToTiptap } from './utils/columnViewUtils'
import {
  Archive,
  History,
  ChevronRight,
  Table2,
  Heading1,
  Heading2,
  Bold,
  Italic,
  Image,
  Link,
  Code,
  RotateCcw,
  Columns3,
  GitBranch,
  PenLine,
  Settings
} from 'lucide-react'
import { useIsMobile } from '../../hooks/useIsMobile'
import { usePageContext } from '../../contexts/PageContext'
import { useProjectContext } from '../../contexts/ProjectContext'
import { useFavoritesContext } from '../../contexts/FavoritesContext'
import { FileText, Star, ChevronDown, X, CalendarDays } from 'lucide-react'
import { CalendarView } from '../CalendarView/CalendarView'
import { buildDailyPageTemplate } from '../../utils/worklogUtils'
import WorklogHeader from './WorklogHeader'
import WorklogComments from './WorklogComments'
import EmojiPicker from '../Common/EmojiPicker'
import '../Common/EmojiPicker.css'
import { useAuthContext } from '../../contexts/AuthContext'
import { useWorklogComments } from '../../hooks/useWorklogComments'
import { useCalendarCommentCounts } from '../../hooks/useCalendarCommentCounts'
import { useWorklogUserSettings } from '../../hooks/useWorklogUserSettings'
import './TipTapPage.css'

/**
 * TipTap 에디터 페이지
 * 메인 에디터 컴포넌트
 */
function TipTapTestPage({ session, currentPageId, currentPageName, onPageRename, isImpersonating = false, sidebarOpen, onToggleSidebar, mobileView = 'editor', onMobileViewChange, viewerToggleOverrides = {}, saveViewerToggleOverrides }) {
  const [content, setContent] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [commentTarget, setCommentTarget] = useState(null) // null=전체, { type, id } = 섹션/todo
  const [commentAnchorEl, setCommentAnchorEl] = useState(null) // 코멘트 패널 위치 기준 DOM
  const [showIconPicker, setShowIconPicker] = useState(false)

  // 뷰어 모드 토스트
  const [viewerToast, setViewerToast] = useState(false)
  const viewerToastTimer = useRef(null)
  const showViewerToast = useCallback(() => {
    setViewerToast(true)
    if (viewerToastTimer.current) clearTimeout(viewerToastTimer.current)
    viewerToastTimer.current = setTimeout(() => setViewerToast(false), 2000)
  }, [])
  const editorRef = useRef(null)
  const imageInputRef = useRef(null)
  const pageRef = useRef(null)
  const { isTablet } = useIsMobile()
  const authCtx = useAuthContext()
  const isMaster = authCtx?.isMaster ?? false
  const { pages, setCurrentPageId, createPage, deletePage, updatePageIcon, goBack, goForward, canGoBack, canGoForward } = usePageContext()
  const { projects, currentProjectId } = useProjectContext()
  const { toggleFavorite, isFavorite } = useFavoritesContext()
  const currentPage = pages.find(p => p.id === currentPageId)
  const { comments, mentionableUsers, addComment, toggleResolved, deleteComment } = useWorklogComments(
    session,
    currentPage?.page_type === 'daily' ? currentPageId : null,
    currentProjectId
  )

  // 캘린더 뷰용 코멘트 수 배치 조회
  const isCalendar = currentPage?.page_type === 'calendar'
  const calendarDailyPages = useMemo(
    () => isCalendar ? pages.filter(p => p.parent_id === currentPageId) : [],
    [isCalendar, pages, currentPageId]
  )
  const calendarPageIds = useMemo(() => calendarDailyPages.map(p => p.id), [calendarDailyPages])
  const { commentCounts } = useCalendarCommentCounts(session, calendarPageIds)

  // 업무일지 계정별 섹션 순서
  const { sectionOrder, updateSectionOrder } = useWorklogUserSettings(session)

  // 형제 페이지 드롭다운
  const [showPageNav, setShowPageNav] = useState(false)
  const pageNavRef = useRef(null)

  const siblingPages = pages
    .filter(p => p.parent_id === (currentPage?.parent_id ?? null) && p.id !== currentPageId)
    .sort((a, b) => a.position - b.position)

  useEffect(() => {
    if (!showPageNav) return
    const handleClick = (e) => {
      if (pageNavRef.current && !pageNavRef.current.contains(e.target)) {
        setShowPageNav(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showPageNav])

  // 페이지 전환 시 드롭다운 닫기
  useEffect(() => { setShowPageNav(false) }, [currentPageId])

  // 현재 페이지의 하위 페이지 목록 (콘텐츠 내 page 블록 삽입용)
  const childPages = useMemo(() =>
    pages.filter(p => p.parent_id === currentPageId).sort((a, b) => a.position - b.position),
    [pages, currentPageId]
  )

  // 모바일 뷰 전환: mobileView prop 변경 시 뷰 열기/닫기
  const viewHandlersRef = useRef({})
  const prevMobileViewRef = useRef(mobileView)

  // 최신 content와 pageId를 ref로 추적 (cleanup 함수에서 사용)
  const contentRef = useRef(null)
  const pageIdRef = useRef(null)
  const hasUnsavedChanges = useRef(false)
  // 이전 페이지 정보 (페이지 전환 시 저장용)
  const prevPageRef = useRef({ pageId: null, content: null })
  // 마지막 자동 히스토리 저장 시간
  const lastAutoHistoryRef = useRef(null)
  // 마지막 히스토리에 저장된 content (중복 방지용)
  const lastHistoryContentRef = useRef(null)
  // 초기 로드 완료 여부 (초기 로드 시 불필요한 저장 방지)
  const isInitialLoadRef = useRef(true)

  // 히스토리 관련 상태
  const [showHistory, setShowHistory] = useState(false)
  const [historyList, setHistoryList] = useState([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // 칼럼 모드 상태
  const [showColumnView, setShowColumnView] = useState(false)
  const [columnBlocks, setColumnBlocks] = useState([])

  // 마인드맵 모드 상태
  const [showMindMap, setShowMindMap] = useState(false)
  const [mindMapBlocks, setMindMapBlocks] = useState([])

  // 히스토리 불러오기
  const fetchHistory = async () => {
    if (!session?.user?.id || !currentPageId) return

    setIsLoadingHistory(true)
    try {
      const { data, error } = await supabase
        .from('block_history')
        .select('*')
        .eq('page_id', currentPageId)
        .eq('action', 'tiptap_snapshot')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        console.error('히스토리 불러오기 오류:', error)
        return
      }

      setHistoryList(data || [])
    } catch (err) {
      console.error('히스토리 불러오기 오류:', err)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  // 히스토리 저장 (수동)
  const saveHistory = async (description = '수동 저장') => {
    if (!session?.user?.id || !currentPageId || !content || isImpersonating) return false

    try {
      const { error } = await supabase
        .from('block_history')
        .insert([{
          block_id: null,
          user_id: session.user.id,
          page_id: currentPageId,
          content_before: null,
          content_after: content,
          action: 'tiptap_snapshot',
          description
        }])

      if (error) {
        console.error('히스토리 저장 오류:', error)
        return false
      }

      return true
    } catch (err) {
      console.error('히스토리 저장 오류:', err)
      return false
    }
  }

  // 버전 복구
  const restoreVersion = async (versionId) => {
    try {
      const { data, error } = await supabase
        .from('block_history')
        .select('*')
        .eq('id', versionId)
        .single()

      if (error || !data) {
        alert('버전 데이터를 불러오는데 실패했습니다.')
        return
      }

      const confirmRestore = window.confirm(
        `이 버전으로 복구하시겠습니까?\n\n` +
        `저장 시각: ${new Date(data.created_at).toLocaleString('ko-KR')}\n` +
        `설명: ${data.description || '(설명 없음)'}\n\n` +
        `현재 내용이 대체됩니다. 복구 전 현재 버전이 자동 저장됩니다.`
      )

      if (!confirmRestore) return

      // 현재 버전 자동 저장
      await saveHistory('복구 전 자동 저장')

      // 복구할 콘텐츠
      let restoredContent = data.content_after
      if (typeof restoredContent === 'string') {
        restoredContent = JSON.parse(restoredContent)
      }

      // 에디터에 직접 적용
      if (editorRef.current) {
        editorRef.current.commands.setContent(restoredContent)
      }
      setContent(restoredContent)
      setShowHistory(false)

      alert('버전이 복구되었습니다.')
    } catch (err) {
      console.error('버전 복구 오류:', err)
      alert('버전 복구 중 오류가 발생했습니다.')
    }
  }

  // 히스토리 모달 열기
  const openHistory = () => {
    fetchHistory()
    setShowHistory(true)
  }

  // 칼럼 모드 열기
  const openColumnView = () => {
    if (!content) return
    const blocks = tiptapToColumnBlocks(content)
    setColumnBlocks(blocks)
    setShowColumnView(true)
  }

  // 칼럼 모드 닫기 (변경사항 적용)
  const closeColumnView = () => {
    // 칼럼 블록을 TipTap JSON으로 변환
    const newContent = columnBlocksToTiptap(columnBlocks)

    // 에디터에 적용
    if (editorRef.current) {
      editorRef.current.commands.setContent(newContent)
    }
    setContent(newContent)
    setShowColumnView(false)
  }

  // 칼럼 모드에서 저장
  const handleColumnSave = () => {
    const newContent = columnBlocksToTiptap(columnBlocks)
    setContent(newContent)
    // 자동 저장이 트리거됨
  }

  // 마인드맵 모드 열기
  const openMindMap = () => {
    if (!content) return
    const blocks = tiptapToColumnBlocks(content)
    setMindMapBlocks(blocks)
    setShowMindMap(true)
  }

  // 마인드맵 모드 닫기 (변경사항 적용)
  const closeMindMap = () => {
    const newContent = columnBlocksToTiptap(mindMapBlocks)
    if (editorRef.current) {
      editorRef.current.commands.setContent(newContent)
    }
    setContent(newContent)
    setShowMindMap(false)
  }

  // 마인드맵 모드에서 저장
  const handleMindMapSave = () => {
    const newContent = columnBlocksToTiptap(mindMapBlocks)
    setContent(newContent)
  }

  // 이미지 파일 업로드 핸들러
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file || !editorRef.current) return

    const reader = new FileReader()
    reader.onload = () => {
      editorRef.current.chain().focus().setImage({ src: reader.result }).run()
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // 링크 삽입 핸들러
  const handleInsertLink = () => {
    if (!editorRef.current) return
    const url = prompt('링크 URL을 입력하세요:')
    if (url) {
      editorRef.current.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }

  // 하위 페이지를 content_tiptap에 page 블록으로 삽입 (노션 스타일)
  // content_tiptap에 이미 page 블록으로 존재하는 페이지는 그 위치 유지,
  // 없는 페이지는 콘텐츠 최상단에 삽입
  const injectChildPageBlocks = useCallback((contentDoc, children) => {
    if (!contentDoc?.content || !children?.length) return contentDoc

    // content_tiptap에 이미 존재하는 pageId 수집
    const existingPageIds = new Set()
    const walk = (nodes) => {
      for (const node of nodes) {
        if (node.type === 'toggle' && node.attrs?.blockType === 'page' && node.attrs?.pageId) {
          existingPageIds.add(node.attrs.pageId)
        }
        if (node.content) walk(node.content)
      }
    }
    walk(contentDoc.content)

    // content에 없는 하위 페이지 → page 블록 생성
    const missing = children.filter(p => !existingPageIds.has(p.id))
    if (missing.length === 0) return contentDoc

    const newBlocks = missing.map(p => ({
      type: 'toggle',
      attrs: {
        isOpen: false, isTodo: false, pageId: p.id, blockType: 'page',
        todoStatus: null, todoChecked: false, autoGenerated: false,
        backgroundColor: null, isFixedSection: false, isPinned: false,
        isCarryOver: false, carryOverFrom: null,
      },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: p.name }] }],
    }))

    return { ...contentDoc, content: [...newBlocks, ...contentDoc.content] }
  }, [])

  /**
   * 중복 블록 마킹: 같은 텍스트가 2개 이상이면 maybeDuplicate 표시
   * 첫 번째 = 'original', 나머지 = true, 중복 아닌 것 = false
   */
  /**
   * 중복 블록 마킹: 같은 섹션 내에서 같은 텍스트가 2개 이상이면 표시
   * 원본(첫 번째) = 'original', 나머지 = true
   * 원본을 섹션 최상단으로 정렬
   */
  function markDuplicateBlocks(content) {
    if (!content?.content) return content

    return { ...content, content: content.content.map(section => {
      if (!isH2Section(section) || !section.content) return clearFlags(section)

      // 섹션 내 블록의 텍스트 카운트
      const textCount = {}
      const blocks = section.content.filter(n => n.type === 'toggle' && n.attrs?.blockType !== 'h3')
      for (const b of blocks) {
        const text = b.content?.[0]?.content?.[0]?.text
        if (text) textCount[text] = (textCount[text] || 0) + 1
      }

      const dupTexts = new Set(Object.keys(textCount).filter(t => textCount[t] > 1))
      if (dupTexts.size === 0) return clearFlags(section)

      // 마킹: isCarryOver가 아닌 것 = 원본, isCarryOver인 것 = 중복
      const marked = section.content.map(n => {
        if (n.type !== 'toggle' || n.attrs?.blockType === 'h3') return n
        const text = n.content?.[0]?.content?.[0]?.text
        if (text && dupTexts.has(text)) {
          const flag = n.attrs?.isCarryOver ? true : 'original'
          return { ...n, attrs: { ...n.attrs, maybeDuplicate: flag } }
        }
        return n.attrs?.maybeDuplicate ? { ...n, attrs: { ...n.attrs, maybeDuplicate: false } } : n
      })

      // 원본을 중복본 위로 정렬: 헤더(0번) 유지, 나머지에서 original을 해당 텍스트 그룹 최상단으로
      const header = marked[0] // 헤더 paragraph
      const rest = marked.slice(1)
      const sorted = []
      const processed = new Set()
      for (const item of rest) {
        const text = item.content?.[0]?.content?.[0]?.text
        if (text && dupTexts.has(text) && !processed.has(text)) {
          processed.add(text)
          // 원본 먼저, 나머지 순서대로
          const group = rest.filter(r => r.content?.[0]?.content?.[0]?.text === text)
          const original = group.find(r => r.attrs?.maybeDuplicate === 'original')
          const others = group.filter(r => r !== original)
          if (original) sorted.push(original)
          sorted.push(...others)
        } else if (!text || !dupTexts.has(text)) {
          sorted.push(item)
        }
      }

      return { ...section, content: [header, ...sorted] }
    })}
  }

  function clearFlags(node) {
    if (!node.content) return node
    return { ...node, content: node.content.map(n => {
      const cleared = n.attrs?.maybeDuplicate ? { ...n, attrs: { ...n.attrs, maybeDuplicate: false } } : n
      return cleared.content ? clearFlags(cleared) : cleared
    })}
  }

  /**
   * 이월 동기화: daily 페이지 로드 시 이전 날짜의 미이월 todo를 자동 삽입
   * blockId로 중복 방지 — 이미 존재하는 blockId/originBlockId는 건너뜀
   */
  const syncCarryOver = useCallback(async (pageId, contentTiptap) => {
    const page = pages.find(p => p.id === pageId)
    if (!page || page.page_type !== 'daily' || !page.parent_id) return contentTiptap

    // 이전 daily 페이지에서 이월 대상 추출
    const { data: prevPages } = await supabase
      .from('pages')
      .select('id, page_date, content_tiptap')
      .eq('parent_id', page.parent_id)
      .eq('page_type', 'daily')
      .is('deleted_at', null)
      .lt('page_date', page.page_date)
      .order('page_date', { ascending: false })
      .limit(1)

    if (!prevPages?.length || !prevPages[0].content_tiptap) return contentTiptap

    // 이전 페이지에 blockId가 없는 블록이 있으면 backfill (1회)
    const prevContent = prevPages[0].content_tiptap
    let prevChanged = false
    const backfillIds = (nodes) => {
      if (!nodes) return nodes
      return nodes.map(n => {
        let node = n
        if (n.type === 'toggle' && !n.attrs?.blockId && n.attrs?.blockType !== 'h2' && n.attrs?.blockType !== 'h3') {
          prevChanged = true
          node = { ...n, attrs: { ...n.attrs, blockId: 'blk_' + Math.random().toString(36).slice(2, 10) } }
        }
        if (node.content) return { ...node, content: backfillIds(node.content) }
        return node
      })
    }
    const backfilledPrev = { ...prevContent, content: backfillIds(prevContent.content) }
    if (prevChanged && prevPages[0].id) {
      await supabase.from('pages').update({ content_tiptap: backfilledPrev }).eq('id', prevPages[0].id)
    }

    const { extractCarryOverData } = await import('../../utils/worklogUtils')
    const { carryOverTodos } = extractCarryOverData(backfilledPrev, prevPages[0].page_date)
    if (carryOverTodos.length === 0) return contentTiptap

    const dismissedIds = new Set(contentTiptap._dismissed || [])

    // 현재 페이지의 모든 blockId/originBlockId + 텍스트 수집
    const existingIds = new Set()
    const existingTexts = new Set()
    const collectIds = (nodes) => {
      if (!nodes) return
      for (const n of nodes) {
        if (n.attrs?.blockId) existingIds.add(n.attrs.blockId)
        if (n.attrs?.originBlockId) existingIds.add(n.attrs.originBlockId)
        const text = n.content?.[0]?.content?.[0]?.text || ''
        if (text) existingTexts.add(text)
        if (n.content) collectIds(n.content)
      }
    }
    collectIds(contentTiptap.content)

    const newItems = carryOverTodos
      .filter(t => {
        const origId = t.node?.attrs?.blockId
        // blockId 기반 중복 → 확실히 건너뜀
        if (origId && existingIds.has(origId)) return false
        // 의도적으로 삭제된 항목 → 건너뜀
        if (origId && dismissedIds.has(origId)) return false
        // blockId가 없는 레거시 데이터 → 텍스트로 차단 (중복 삽입 방지)
        if (!origId) {
          const text = t.node?.content?.[0]?.content?.[0]?.text || ''
          if (text && existingTexts.has(text)) return false
        }
        return true
      })
      .map(t => {
        const text = t.node?.content?.[0]?.content?.[0]?.text || ''
        return { ...t, maybeDuplicate: text && existingTexts.has(text) }
      })

    if (newItems.length === 0) return contentTiptap

    // sectionId별로 그룹핑하여 해당 섹션에 삽입
    const { SECTION_IDS } = await import('../../utils/worklogConstants')
    const bySection = {}
    for (const item of newItems) {
      const key = item.sectionId || SECTION_IDS.TODO
      if (!bySection[key]) bySection[key] = []

      // 이월 노드 생성 (deep clone + carryOver 속성)
      const node = JSON.parse(JSON.stringify(item.node))
      const origTodoId = node.attrs?.blockId
      node.attrs = {
        ...node.attrs,
        isCarryOver: true,
        carryOverFrom: item.fromDate,
        todoChecked: item.type === 'todo-with-unfinished' ? node.attrs.todoChecked : false,
        blockId: 'blk_' + Math.random().toString(36).slice(2, 10),
        originBlockId: origTodoId,
        maybeDuplicate: item.maybeDuplicate || false,
      }
      bySection[key].push(node)
    }

    // 각 섹션에 삽입
    let changed = false
    const updatedContent = { ...contentTiptap, content: contentTiptap.content.map(section => {
      if (!isH2Section(section) || !section.attrs?.sectionId) return section
      const items = bySection[section.attrs.sectionId]
      if (!items?.length) return section
      changed = true
      const children = [...(section.content || [])]
      // 헤더 paragraph(0번) 다음에 삽입
      children.splice(1, 0, ...items)
      return { ...section, content: children }
    })}

    if (changed) {
      await supabase.from('pages').update({ content_tiptap: updatedContent }).eq('id', pageId)
    }

    return changed ? updatedContent : contentTiptap
  }, [pages])

  // 페이지 콘텐츠 로드 (유일한 진입점 — 모든 트리거가 이 함수를 호출)
  const loadContent = useCallback(async (targetPageId) => {
    const pid = targetPageId || currentPageId
    if (!session || !pid) return

    try {
      const { data, error } = await supabase
        .from('pages')
        .select('content_tiptap')
        .eq('id', pid)
        .single()

      if (error) { console.error('콘텐츠 로드 실패:', error); return }

      if (data?.content_tiptap) {
        const pageType = pages.find(p => p.id === pid)?.page_type
        const injected = pageType !== 'calendar'
          ? injectChildPageBlocks(data.content_tiptap, childPages)
          : data.content_tiptap

        // daily 페이지: 이월 동기화
        const synced = pageType === 'daily'
          ? await syncCarryOver(pid, injected)
          : injected

        const filtered = (!isMaster && pageType === 'daily' && synced?.content)
          ? { ...synced, content: synced.content.filter(n =>
              !(isH2Section(n) && n.attrs?.visibility === 'master')
            )}
          : synced
        const ordered = (pageType === 'daily' && filtered?.content)
          ? { ...filtered, content: applySectionOrder(filtered.content, sectionOrder) }
          : filtered
        // daily 페이지: 중복 블록 마킹
        const marked = pageType === 'daily' ? markDuplicateBlocks(ordered) : ordered
        const finalContent = isImpersonating
          ? applyToggleOverrides(marked, viewerToggleOverrides[pid])
          : marked
        setContent(finalContent)
        lastHistoryContentRef.current = data.content_tiptap
        prevPageRef.current = { pageId: pid, content: data.content_tiptap }
        return
      }

      // legacy: blocks 테이블 마이그레이션
      const { data: blocks, error: blocksError } = await supabase
        .from('blocks')
        .select('*')
        .eq('page_id', pid)
        .eq('user_id', session.user.id)
        .order('position', { ascending: true })

      if (blocksError) console.error('블록 로드 실패:', blocksError)

      if (blocks && blocks.length > 0) {
        const tiptapContent = convertFlatBlocksToTiptap(blocks)
        setContent(tiptapContent)
        lastHistoryContentRef.current = tiptapContent
          prevPageRef.current = { pageId: pid, content: tiptapContent }
          await supabase.from('pages').update({ content_tiptap: tiptapContent }).eq('id', pid)
          return
        }

        // 4. 블록도 없으면 토글 블록으로 시작
        const emptyContent = {
          type: 'doc',
          content: [{ type: 'toggle', attrs: { isOpen: true, autoGenerated: false }, content: [{ type: 'paragraph', content: [] }] }]
        }
        setContent(emptyContent)
        lastHistoryContentRef.current = emptyContent
        prevPageRef.current = { pageId: pid, content: emptyContent }
    } catch (err) {
      console.error('예상치 못한 오류:', err)
    }
  }, [session, currentPageId, pages, childPages, isMaster, sectionOrder, isImpersonating, syncCarryOver])

  // ── 트리거 A: 페이지 전환 시 로드 ──
  useEffect(() => {
    if (!session || !currentPageId) return
    isInitialLoadRef.current = true
    setContent(null)
    loadContent()
  }, [session, currentPageId, sectionOrder])

  // ── 트리거 B: 브라우저 탭 복귀 시 DB에서 최신 로드 ──
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible' && currentPageId) {
        loadContent()
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [loadContent, currentPageId])

  // ── 트리거 C: Quick Todo 삽입 / Todo 동기화 이벤트 ──
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.pageId === currentPageId) loadContent()
    }
    window.addEventListener('quicktodo-inserted', handler)
    return () => window.removeEventListener('quicktodo-inserted', handler)
  }, [loadContent, currentPageId])

  // 블록 수 변경 감지용 ref
  const blockCountRef = useRef(0)

  // 에디터 내용 변경 시 (사용자 편집)
  const handleUpdate = (newContent) => {
    if (isImpersonating) {
      // 뷰어 모드: 토글 isOpen 변경만 로컬 반영 + 오버라이드 저장
      setContent(newContent)
      if (saveViewerToggleOverrides && currentPageId) {
        const states = extractToggleStates(newContent)
        saveViewerToggleOverrides(currentPageId, states)
      }
      return
    }
    isInitialLoadRef.current = false  // 사용자가 편집 시작

    // daily 페이지: 블록 수 변경 시 중복 마킹 재계산 (삭제 즉시 반영)
    if (currentPage?.page_type === 'daily' && newContent?.content) {
      let count = 0
      const countBlocks = (nodes) => { for (const n of nodes) { if (n.type === 'toggle') count++; if (n.content) countBlocks(n.content) } }
      countBlocks(newContent.content)
      if (count !== blockCountRef.current) {
        blockCountRef.current = count
        setContent(markDuplicateBlocks(newContent))
        return
      }
    }

    setContent(newContent)
  }


  // 즉시 저장 함수 (동기적으로 호출 가능)
  const saveImmediately = useCallback(async (contentToSave, pageIdToSave) => {
    if (!contentToSave || !pageIdToSave || !session) return false

    try {
      const { error } = await supabase
        .from('pages')
        .update({
          content_tiptap: contentToSave,
          updated_at: new Date().toISOString()
        })
        .eq('id', pageIdToSave)

      if (error) {
        console.error('저장 실패:', error)
        return false
      }
      return true
    } catch (err) {
      console.error('저장 오류:', err)
      return false
    }
  }, [session])

  // content가 변경될 때마다 ref 업데이트
  useEffect(() => {
    contentRef.current = content
    if (content && content.content && content.content.length > 0) {
      hasUnsavedChanges.current = true
      // 초기 로드 중에는 prevPageRef를 업데이트하지 않음
      // (이전 페이지 콘텐츠가 새 페이지 ID로 잘못 매핑되는 것 방지)
      // loadContent에서 올바르게 설정됨
      if (currentPageId && !isInitialLoadRef.current) {
        prevPageRef.current = { pageId: currentPageId, content: content }
      }
    }
  }, [content, currentPageId])

  useEffect(() => {
    pageIdRef.current = currentPageId
    // isInitialLoadRef는 loadContent effect에서 먼저 설정됨
  }, [currentPageId])

  // content 비교 함수 (JSON 문자열로 비교)
  const isContentChanged = useCallback((newContent, oldContent) => {
    if (!oldContent) return true
    if (!newContent) return false
    return JSON.stringify(newContent) !== JSON.stringify(oldContent)
  }, [])

  // 자동 히스토리 저장 (5분마다, 변경된 경우에만)
  const saveAutoHistory = useCallback(async (contentToSave, pageIdToSave) => {
    if (!contentToSave || !pageIdToSave || !session?.user?.id || isImpersonating) return

    const now = Date.now()
    const fiveMinutes = 5 * 60 * 1000

    // 마지막 자동 히스토리 저장 후 5분이 지났는지 확인
    if (lastAutoHistoryRef.current && (now - lastAutoHistoryRef.current) < fiveMinutes) {
      return
    }

    // 마지막 저장된 content와 비교 - 변경 없으면 저장 안 함
    if (!isContentChanged(contentToSave, lastHistoryContentRef.current)) {
      return
    }

    try {
      const { error } = await supabase
        .from('block_history')
        .insert([{
          block_id: null,
          user_id: session.user.id,
          page_id: pageIdToSave,
          content_before: null,
          content_after: contentToSave,
          action: 'tiptap_snapshot',
          description: '자동 백업'
        }])

      if (!error) {
        lastAutoHistoryRef.current = now
        lastHistoryContentRef.current = contentToSave
      }
    } catch (err) {
      console.error('자동 히스토리 저장 오류:', err)
    }
  }, [session?.user?.id, isContentChanged, isImpersonating])

  // 자동 저장 (500ms debounce) - 사용자 편집 시에만
  useEffect(() => {
    if (!content || !session || !currentPageId) return
    // 뷰어 모드: 문서 저장 완전 차단
    if (isImpersonating) return

    // 초기 로드 시에는 저장하지 않음
    if (isInitialLoadRef.current) {
      return
    }

    const timer = setTimeout(async () => {
      setIsSaving(true)
      const success = await saveImmediately(content, currentPageId)
      if (success) {
        setLastSaved(new Date())
        hasUnsavedChanges.current = false
        // 5분마다 자동 히스토리 백업
        saveAutoHistory(content, currentPageId)
        // daily 페이지: 섹션 타이틀이 변경되었으면 worklog_sections DB에 동기화
        if (currentPage?.page_type === 'daily' && content?.content) {
          for (const node of content.content) {
            if (node.type === 'toggle' && node.attrs?.blockType === 'h2' && node.attrs?.sectionId) {
              const title = node.content?.[0]?.content?.[0]?.text
              if (title) {
                supabase.from('worklog_sections')
                  .update({ title })
                  .eq('id', node.attrs.sectionId)
                  .then(({ error }) => {
                    if (error) console.warn('섹션 타이틀 동기화 실패:', node.attrs.sectionId, error.message)
                  })
              }
            }
          }
        }
      }
      setIsSaving(false)
    }, 500)

    return () => clearTimeout(timer)
  }, [content, session, currentPageId, saveImmediately, saveAutoHistory])

  // 페이지 변경 시 이전 페이지 내용 저장 + 히스토리 백업
  useEffect(() => {
    return () => {
      // cleanup 실행 시점의 최신 prevPageRef 사용 (캡처 시점 X)
      // loadContent에서 올바른 pageId+content로 설정해두므로 안전
      const prevPage = { ...prevPageRef.current }
      const lastHistoryContent = lastHistoryContentRef.current
      // 페이지 전환 시 이전 페이지의 유효한 content 저장
      if (prevPage.content && prevPage.pageId) {
        // 빈 문서가 아닌 경우에만 저장
        const hasContent = prevPage.content.content &&
                          prevPage.content.content.length > 0 &&
                          !(prevPage.content.content.length === 1 &&
                            prevPage.content.content[0].type === 'paragraph' &&
                            (!prevPage.content.content[0].content || prevPage.content.content[0].content.length === 0))

        if (hasContent) {
          // content 저장
          saveImmediately(prevPage.content, prevPage.pageId)

          // 히스토리에도 백업 (변경된 경우에만)
          const contentChanged = !lastHistoryContent ||
            JSON.stringify(prevPage.content) !== JSON.stringify(lastHistoryContent)

          if (contentChanged && session?.user?.id && !isImpersonating) {
            supabase
              .from('block_history')
              .insert([{
                block_id: null,
                user_id: session.user.id,
                page_id: prevPage.pageId,
                content_before: null,
                content_after: prevPage.content,
                action: 'tiptap_snapshot',
                description: '페이지 이동 시 자동 백업'
              }])
              .then(() => {
                lastHistoryContentRef.current = prevPage.content
              })
          }
        }
      }
      // 페이지 변경 시 히스토리 ref 리셋
      lastHistoryContentRef.current = null
    }
  }, [currentPageId, saveImmediately, session?.user?.id])

  // 브라우저 닫기/새로고침 시 저장
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges.current && contentRef.current && pageIdRef.current) {
        // 동기적으로 저장 시도 (navigator.sendBeacon 사용)
        const data = JSON.stringify({
          content_tiptap: contentRef.current,
          updated_at: new Date().toISOString()
        })

        // sendBeacon은 페이지가 닫혀도 전송을 보장
        navigator.sendBeacon(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/pages?id=eq.${pageIdRef.current}`,
          new Blob([data], { type: 'application/json' })
        )
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // mobileView prop 변경 감지 → 뷰 전환 처리
  viewHandlersRef.current = { openColumnView, closeColumnView, openMindMap, closeMindMap, showColumnView, showMindMap }

  useEffect(() => {
    const prev = prevMobileViewRef.current
    prevMobileViewRef.current = mobileView
    if (prev === mobileView) return

    const h = viewHandlersRef.current
    // 이전 뷰 닫기
    if (prev === 'column' && h.showColumnView) h.closeColumnView()
    if (prev === 'mindmap' && h.showMindMap) h.closeMindMap()
    // 새 뷰 열기
    if (mobileView === 'column') h.openColumnView()
    else if (mobileView === 'mindmap') h.openMindMap()
    else {
      if (h.showColumnView) h.closeColumnView()
      if (h.showMindMap) h.closeMindMap()
    }
  }, [mobileView])

  // 모바일 더보기 메뉴
  // 설정 드롭다운
  const [showSettings, setShowSettings] = useState(false)
  const [showToolbar, setShowToolbar] = useState(false)
  const settingsRef = useRef(null)

  // 마키(사각형) 드래그 선택 + Cmd/Ctrl 추가 선택
  // Google Sheets 모델: Mac=Cmd, Win=Ctrl 누르며 클릭/드래그 → 기존 선택에 추가
  useEffect(() => {
    const page = pageRef.current
    if (!page) return

    // 절대 제외 UI
    const isExcludedUI = (target) =>
      !!target.closest('.tiptap-page-header, .tiptap-toolbar, .tiptap-modal-overlay, .mobile-bottom-bar, .multi-select-toolbar, .table-toolbar, .block-context-menu, button, input, a, .tiptap-btn')

    // 여백(빈 공간)인지 판별
    const isEmptySpace = (target) => {
      if (isExcludedUI(target)) return false
      if (target.closest('p, h1, h2, h3, pre, td, th, li, img')) return false
      if (target.closest('.toggle-todo-checkbox, .toggle-button, .toggle-drag-handle')) return false
      return true
    }

    // 마키에 걸리는 토글 블록 위치 수집
    const collectMarqueeHits = (editor, left, top, width, height) => {
      const marqueeRect = { left, top, right: left + width, bottom: top + height }
      let editorViewDom
      try { editorViewDom = editor.view.dom } catch { return [] }
      const toggleBlocks = editorViewDom.querySelectorAll('.toggle-block')
      const positions = []

      toggleBlocks.forEach(block => {
        const blockRect = block.getBoundingClientRect()
        const headerBottom = Math.min(blockRect.bottom, blockRect.top + 32)

        if (
          blockRect.left < marqueeRect.right &&
          blockRect.right > marqueeRect.left &&
          blockRect.top < marqueeRect.bottom &&
          headerBottom > marqueeRect.top
        ) {
          try {
            const pos = editor.view.posAtDOM(block, 0)
            const nodeAtPos = editor.state.doc.nodeAt(pos)
            if (nodeAtPos && nodeAtPos.type.name === 'toggle') {
              if (!positions.includes(pos)) positions.push(pos)
            } else {
              const $pos = editor.state.doc.resolve(pos)
              for (let d = $pos.depth; d > 0; d--) {
                if ($pos.node(d).type.name === 'toggle') {
                  const tPos = $pos.before(d)
                  if (!positions.includes(tPos)) positions.push(tPos)
                  break
                }
              }
            }
          } catch (err) { /* ignore */ }
        }
      })
      return positions
    }

    // 클릭 좌표에서 가장 가까운 토글 위치 찾기
    const findToggleAtCoords = (editor, x, y) => {
      const pos = editor.view.posAtCoords({ left: x, top: y })
      if (!pos) return null
      const $pos = editor.state.doc.resolve(pos.pos)
      for (let d = $pos.depth; d > 0; d--) {
        if ($pos.node(d).type.name === 'toggle') return $pos.before(d)
      }
      return null
    }

    // capture: true → Cmd/Ctrl+클릭 시 ProseMirror보다 먼저 가로챔
    const handleMouseDown = (e) => {
      if (e.button !== 0) return
      if (isExcludedUI(e.target)) return

      const editor = editorRef.current
      if (!editor) return

      const hasModifier = e.metaKey || e.ctrlKey

      // 수식키 없음: 여백에서만 시작
      if (!hasModifier && !isEmptySpace(e.target)) return

      // 수식키 있음: 토글 자체 컨트롤(핸들/버튼/체크박스)은 자체 처리에 맡김
      if (hasModifier && e.target.closest('.toggle-drag-handle, .toggle-button, .toggle-todo-checkbox')) return

      // 수식키 + 콘텐츠 영역 → ProseMirror 기본 동작(커서 이동) 방지
      if (hasModifier && !isEmptySpace(e.target)) {
        e.preventDefault()
        e.stopPropagation()
      }

      const startX = e.clientX
      const startY = e.clientY
      let marqueeActive = false
      let overlay = null
      let rafId = null

      // 수식키 시 기존 선택 보존 (마키 축소 시에도 원래 선택 유지)
      const basePositions = hasModifier
        ? [...(multiSelectPluginKey.getState(editor.state)?.selectedPositions || [])]
        : []

      const updateMarquee = (left, top, width, height) => {
        const marqueeHits = collectMarqueeHits(editor, left, top, width, height)
        // 수식키: XOR 토글 — 기존 선택 ↔ 마키 히트를 반전
        // 마키에 걸린 기존 선택 블록은 해제, 미선택 블록은 추가
        const finalPositions = hasModifier
          ? [
              ...basePositions.filter(p => !marqueeHits.includes(p)),
              ...marqueeHits.filter(p => !basePositions.includes(p))
            ]
          : marqueeHits

        editor.view.dispatch(
          editor.state.tr.setMeta(multiSelectPluginKey, {
            type: 'set',
            positions: finalPositions,
            lastClickedPos: marqueeHits[marqueeHits.length - 1] ?? null
          })
        )
      }

      const handleMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX
        const dy = moveEvent.clientY - startY

        if (!marqueeActive && (dx * dx + dy * dy) > 25) {
          marqueeActive = true
          window.getSelection()?.removeAllRanges()
          overlay = document.createElement('div')
          overlay.className = 'marquee-selection'
          overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:999'
          document.body.appendChild(overlay)
        }

        if (!marqueeActive) return

        moveEvent.preventDefault()
        window.getSelection()?.removeAllRanges()

        const left = Math.min(startX, moveEvent.clientX)
        const top = Math.min(startY, moveEvent.clientY)
        const width = Math.abs(moveEvent.clientX - startX)
        const height = Math.abs(moveEvent.clientY - startY)

        overlay.style.left = left + 'px'
        overlay.style.top = top + 'px'
        overlay.style.width = width + 'px'
        overlay.style.height = height + 'px'

        if (rafId) cancelAnimationFrame(rafId)
        rafId = requestAnimationFrame(() => updateMarquee(left, top, width, height))
      }

      const handleUp = () => {
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleUp)
        if (rafId) cancelAnimationFrame(rafId)
        if (overlay?.parentNode) overlay.parentNode.removeChild(overlay)

        if (!marqueeActive) {
          if (hasModifier) {
            // Cmd/Ctrl+클릭(드래그 없이) → 해당 블록 토글 선택
            const togglePos = findToggleAtCoords(editor, startX, startY)
            if (togglePos !== null) {
              editor.view.dispatch(
                editor.state.tr.setMeta(multiSelectPluginKey, { type: 'toggle', pos: togglePos })
              )
            }
          } else {
            // 여백 클릭 → 멀티셀렉트 해제 + 에디터 blur (포커스 음영 제거)
            const pluginState = multiSelectPluginKey.getState(editor.state)
            if (pluginState?.selectedPositions.length > 0) {
              editor.view.dispatch(
                editor.state.tr.setMeta(multiSelectPluginKey, { type: 'clear' })
              )
            }
            editor.commands.blur()
          }
        }
      }

      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleUp)
    }

    page.addEventListener('mousedown', handleMouseDown, { capture: true })
    return () => page.removeEventListener('mousedown', handleMouseDown, { capture: true })
  }, [])

  /*
   * 달력 뷰 분기: page_type === 'calendar'이면 CalendarView 렌더링
   * [향후] 계정별 개인 업무일지 분리 시, dailyPages를 owner_id로 필터링
   */
  if (currentPage?.page_type === 'calendar') {
    // calendarDailyPages는 상단에서 이미 계산됨
    const dailyPages = calendarDailyPages

    const handleCreateDailyPage = async (dateKey) => {
      // DB에서 최신 daily 페이지를 직접 조회 (메모리의 pages 배열은 stale할 수 있음)
      const { data: freshPages } = await supabase
        .from('pages')
        .select('page_date, content_tiptap')
        .eq('parent_id', currentPageId)
        .eq('page_type', 'daily')
        .is('deleted_at', null)
        .order('page_date', { ascending: false })
        .limit(3)
      const template = await buildDailyPageTemplate(freshPages || [], supabase)
      const { dailyPageName } = await import('../../utils/dateUtils')
      const newPage = await createPage(dailyPageName(dateKey), currentPageId, template, {
        page_type: 'daily',
        page_date: dateKey,
        project_id: null,
      })
      if (newPage) {
        setCurrentPageId(newPage.id)
      }
    }

    return (
      <div className={`tiptap-page ${isTablet ? 'tiptap-page--mobile' : ''}`}>
        <div className="tiptap-page-inner">
          <div className="tiptap-page-header">
            <div className="tiptap-page-header-left">
              {onToggleSidebar && (
                <button
                  className="content-sidebar-toggle"
                  onMouseDown={e => e.stopPropagation()}
                  onClick={onToggleSidebar}
                  title={sidebarOpen ? '사이드바 닫기' : '사이드바 열기'}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
            <h2 className="tiptap-page-title">{currentPageName || '업무일지'}</h2>
            <div className="tiptap-header-actions" />
          </div>

          <CalendarView
            dailyPages={dailyPages}
            onPageSelect={(pageId) => setCurrentPageId(pageId)}
            onCreateDailyPage={handleCreateDailyPage}
            commentCounts={commentCounts}
          />

          {/* ── 이월 테스트 패널 (개발용) ──
              활성화: 아래 주석의 {false &&를 {isMaster &&로 변경
              사용법: WORKLOG-SPEC.md 섹션 "이월 디버깅 도구" 참조
          */}
          {false && isMaster && (
            <div style={{ margin: '1rem 0', padding: '1rem', background: 'rgba(255,200,0,0.06)', border: '1px solid rgba(255,200,0,0.2)', borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'rgba(255,200,0,0.8)' }}>이월 테스트 패널 (개발용)</div>

              {/* 1. 더미 어제 페이지 생성 */}
              <button
                style={{ padding: '6px 12px', marginRight: 6, fontSize: 12, borderRadius: 4, border: 'none', background: 'rgba(100,108,255,0.2)', color: '#818cf8', cursor: 'pointer' }}
                onClick={async () => {
                  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

                  // calendar 페이지 ID
                  const calId = currentPageId

                  // 기존 어제 페이지 삭제
                  const { data: existing } = await supabase.from('pages').select('id')
                    .eq('parent_id', calId).eq('page_date', yesterday).eq('page_type', 'daily').is('deleted_at', null)
                  if (existing?.length) {
                    for (const p of existing) await supabase.from('pages').delete().eq('id', p.id)
                  }

                  // 섹션 정의 가져오기
                  const { data: sectionsData } = await supabase.from('worklog_sections').select('*').eq('is_default', true).order('sort_order')
                  const { SECTION_IDS } = await import('../../utils/worklogConstants')
                  const { sectionToggle, emptyToggle } = await import('../../utils/toggleNodeFactory')

                  const topSections = (sectionsData || []).filter(s => !s.parent_id)
                  const childSections = (sectionsData || []).filter(s => s.parent_id)

                  const makeTodo = (text, checked = false) => ({
                    type: 'toggle',
                    attrs: {
                      isOpen: true, isTodo: true, todoChecked: checked,
                      blockType: 'paragraph', pageId: null, todoStatus: null,
                      autoGenerated: false, backgroundColor: null,
                      isFixedSection: false, isPinned: false,
                      isCarryOver: false, carryOverFrom: null, visibility: 'all',
                      sectionId: null,
                    },
                    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
                  })

                  const sectionNodes = topSections.map(section => {
                    const children = childSections.filter(c => c.parent_id === section.id).map(child =>
                      sectionToggle(child.title, 'h3', [
                        makeTodo(`[${child.title}] 미완료 하위`, false),
                        makeTodo(`[${child.title}] 완료됨 하위`, true),
                      ], { isFixed: true, sectionId: child.id })
                    )

                    let todos = []
                    if (section.id === SECTION_IDS.TODO) {
                      todos = [
                        makeTodo('할일 미완료 A', false),
                        makeTodo('할일 미완료 B', false),
                        makeTodo('할일 완료됨 C', true),
                      ]
                    } else if (section.id === SECTION_IDS.NOTICE) {
                      todos = [
                        makeTodo('전달사항 미완료 D', false),
                        makeTodo('전달사항 완료됨 E', true),
                      ]
                    } else if (section.id === SECTION_IDS.WRAPUP) {
                      todos = [
                        makeTodo('마무리 미완료 F', false),
                      ]
                    }

                    return sectionToggle(section.title, 'h2', [
                      ...todos, ...children, emptyToggle(section.id === SECTION_IDS.TODO),
                    ], { isFixed: true, sectionId: section.id, visibility: section.visibility || 'all' })
                  })

                  const dummyContent = { type: 'doc', content: sectionNodes }

                  const { generateUUID } = await import('../../utils/uuid')
                  await supabase.from('pages').insert([{
                    id: generateUUID(),
                    user_id: session.user.id,
                    name: yesterday,
                    parent_id: calId,
                    content_tiptap: dummyContent,
                    project_id: null,
                    page_type: 'daily',
                    page_date: yesterday,
                    position: 0,
                  }])

                  alert(`어제(${yesterday}) 더미 페이지 생성 완료!\n\n미완료 todo:\n- 할일: A, B\n- 전달사항: D\n- 마무리: F\n- 하위 섹션: 각 1개`)
                }}
              >
                1. 어제 더미 데이터 생성
              </button>

              {/* 2. 이월 테스트 (오늘 페이지 생성) */}
              <button
                style={{ padding: '6px 12px', marginRight: 6, fontSize: 12, borderRadius: 4, border: 'none', background: 'rgba(34,197,94,0.2)', color: '#22c55e', cursor: 'pointer' }}
                onClick={async () => {
                  const todayStr = new Date().toISOString().slice(0, 10)
                  const calId = currentPageId

                  // 기존 오늘 페이지 삭제
                  const { data: existing } = await supabase.from('pages').select('id')
                    .eq('parent_id', calId).eq('page_date', todayStr).eq('page_type', 'daily').is('deleted_at', null)
                  if (existing?.length) {
                    for (const p of existing) await supabase.from('pages').delete().eq('id', p.id)
                  }

                  // 이월 포함 오늘 페이지 생성
                  const template = await buildDailyPageTemplate(dailyPages, supabase)

                  const { generateUUID } = await import('../../utils/uuid')
                  const newId = generateUUID()
                  await supabase.from('pages').insert([{
                    id: newId,
                    user_id: session.user.id,
                    name: '업무일지_' + todayStr,
                    parent_id: calId,
                    content_tiptap: template,
                    project_id: null,
                    page_type: 'daily',
                    page_date: todayStr,
                    position: 0,
                  }])

                  // 결과 분석
                  const { extractCarryOverData } = await import('../../utils/worklogUtils')
                  const { data: yesterdayPages } = await supabase.from('pages')
                    .select('content_tiptap, page_date')
                    .eq('parent_id', calId).eq('page_type', 'daily').is('deleted_at', null)
                    .order('page_date', { ascending: false }).limit(2)

                  const prevPage = yesterdayPages?.find(p => p.page_date !== todayStr)
                  const extracted = prevPage ? extractCarryOverData(prevPage.content_tiptap, prevPage.page_date) : { carryOverTodos: [] }

                  const todosBySec = {}
                  for (const t of extracted.carryOverTodos) {
                    const key = t.sectionId || '(없음)'
                    if (!todosBySec[key]) todosBySec[key] = []
                    todosBySec[key].push(t.text)
                  }

                  let msg = `오늘(${todayStr}) 이월 페이지 생성 완료!\n\n추출된 이월 대상:\n`
                  for (const [sec, texts] of Object.entries(todosBySec)) {
                    msg += `\n[${sec}]\n${texts.map(t => '  - ' + t).join('\n')}`
                  }
                  if (extracted.carryOverTodos.length === 0) msg += '(이월 대상 없음)'

                  alert(msg)
                  setCurrentPageId(newId)
                }}
              >
                2. 이월 실행 (오늘 페이지 생성)
              </button>

              {/* 3. 추출 결과만 확인 */}
              <button
                style={{ padding: '6px 12px', fontSize: 12, borderRadius: 4, border: 'none', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}
                onClick={async () => {
                  const { extractCarryOverData } = await import('../../utils/worklogUtils')
                  const sorted = [...dailyPages].sort((a, b) => b.page_date.localeCompare(a.page_date))
                  if (!sorted.length) { alert('daily 페이지 없음'); return }

                  const latest = sorted[0]
                  const result = extractCarryOverData(latest.content_tiptap, latest.page_date)

                  let msg = `최신 daily: ${latest.page_date}\n\n`
                  msg += `pinned 섹션: ${result.pinnedSections.length}개\n`
                  for (const s of result.pinnedSections) msg += `  - ${s.title} (${s.sectionId})\n`

                  msg += `\n이월 대상 todo: ${result.carryOverTodos.length}개\n`
                  for (const t of result.carryOverTodos) {
                    msg += `  - [${t.sectionId || '?'}] ${t.text} (from ${t.fromDate})\n`
                  }

                  alert(msg)
                }}
              >
                3. 추출 결과 확인
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // 섹션/todo 코멘트 이벤트 리스너 (DOM 이벤트 — 타이밍/클로저 문제 없음)
  useEffect(() => {
    const el = pageRef.current
    if (!el) return
    const handler = (e) => {
      const { sectionTitle, targetType = 'section', toggleDom } = e.detail
      const newTarget = { type: targetType, id: sectionTitle }
      setCommentTarget(prev => {
        if (prev && prev.type === newTarget.type && prev.id === newTarget.id) {
          setCommentAnchorEl(null)
          return null
        }
        setCommentAnchorEl(toggleDom)
        return newTarget
      })
    }
    el.addEventListener('section-comment-click', handler)
    return () => el.removeEventListener('section-comment-click', handler)
  }, [])

  // 섹션 이동 이벤트 핸들러
  useEffect(() => {
    const el = pageRef.current
    if (!el) return
    const handler = (e) => {
      const { sectionId, direction } = e.detail
      if (!sectionId || !content?.content) return

      // 현재 h2 섹션 순서 추출
      const currentIds = content.content
        .filter(isH2Section)
        .map(n => n.attrs?.sectionId)
        .filter(Boolean)

      const idx = currentIds.indexOf(sectionId)
      if (idx === -1) return
      if (direction === 'up' && idx === 0) return
      if (direction === 'down' && idx === currentIds.length - 1) return

      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      const newOrder = [...currentIds]
      ;[newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]]

      updateSectionOrder(newOrder)
    }
    el.addEventListener('section-move', handler)
    return () => el.removeEventListener('section-move', handler)
  }, [content, updateSectionOrder])

  // daily 페이지 전날/다음날 이동 (DB 확인 → 없으면 생성)
  const navigateToDailyPage = useCallback(async (dateKey) => {
    if (!currentPage?.parent_id) return
    // DB에서 해당 날짜 페이지 확인
    const { data: existing } = await supabase.from('pages')
      .select('id').eq('parent_id', currentPage.parent_id)
      .eq('page_date', dateKey).eq('page_type', 'daily').is('deleted_at', null).limit(1)
    if (existing?.length) {
      setCurrentPageId(existing[0].id)
      return
    }
    // 없으면 생성
    const { dailyPageName } = await import('../../utils/dateUtils')
    const { data: freshPages } = await supabase.from('pages').select('page_date, content_tiptap')
      .eq('parent_id', currentPage.parent_id).eq('page_type', 'daily').is('deleted_at', null)
      .order('page_date', { ascending: false }).limit(3)
    const template = await buildDailyPageTemplate(freshPages || [], supabase)
    const newPage = await createPage(dailyPageName(dateKey), currentPage.parent_id, template, {
      page_type: 'daily', page_date: dateKey, project_id: null,
    })
    if (newPage) {
      window.dispatchEvent(new CustomEvent('pages-refresh'))
      setCurrentPageId(newPage.id)
    }
  }, [currentPage?.parent_id, createPage, setCurrentPageId])

  // 블록 삭제 시 _dismissed에 기록 (이월 재삽입 방지)
  useEffect(() => {
    const el = pageRef.current
    if (!el || currentPage?.page_type !== 'daily') return
    const handler = async (e) => {
      const { blockId, originBlockId } = e.detail
      if (!blockId || !currentPageId) return
      const { data } = await supabase
        .from('pages')
        .select('content_tiptap')
        .eq('id', currentPageId)
        .single()
      if (!data?.content_tiptap) return
      const dismissed = new Set(data.content_tiptap._dismissed || [])
      dismissed.add(blockId)
      if (originBlockId) dismissed.add(originBlockId)
      const updated = { ...data.content_tiptap, _dismissed: [...dismissed] }
      await supabase.from('pages').update({ content_tiptap: updated }).eq('id', currentPageId)
    }
    el.addEventListener('block-dismissed', handler)
    return () => el.removeEventListener('block-dismissed', handler)
  }, [currentPageId, currentPage?.page_type])

  return (
    <div ref={pageRef} className={`tiptap-page ${isTablet ? 'tiptap-page--mobile' : ''} ${currentPage?.page_type === 'daily' ? 'tiptap-page--daily' : ''}`}>
      <div className="tiptap-page-inner">
        {/* 페이지 헤더 */}
        <div className="tiptap-page-header">
          <div className="tiptap-page-header-left">
            {onToggleSidebar && (
              <button
                className="content-sidebar-toggle"
                onMouseDown={e => e.stopPropagation()}
                onClick={onToggleSidebar}
                title={sidebarOpen ? '사이드바 닫기' : '사이드바 열기'}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
            <div className="page-nav-buttons">
              <button
                className="page-nav-btn"
                onClick={goBack}
                disabled={!canGoBack}
                title="뒤로 가기"
              >
                <ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} />
              </button>
              <button
                className="page-nav-btn"
                onClick={goForward}
                disabled={!canGoForward}
                title="앞으로 가기"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="tiptap-page-title-row">
            <div className="tiptap-page-icon-wrapper">
              <button
                className="tiptap-page-icon-btn"
                onClick={() => !isImpersonating && setShowIconPicker(prev => !prev)}
                title={currentPage?.icon ? '아이콘 변경' : '아이콘 추가'}
              >
                {currentPage?.icon || '📄'}
              </button>
              {showIconPicker && (
                <EmojiPicker
                  currentIcon={currentPage?.icon}
                  onSelect={(emoji) => { updatePageIcon(currentPageId, emoji); setShowIconPicker(false) }}
                  onRemove={() => { updatePageIcon(currentPageId, null); setShowIconPicker(false) }}
                  onClose={() => setShowIconPicker(false)}
                />
              )}
            </div>
            <h2
              className="tiptap-page-title"
              contentEditable={!isImpersonating}
              suppressContentEditableWarning
              spellCheck={false}
              onBlur={(e) => {
                const newName = e.target.textContent.trim()
                if (newName && newName !== currentPageName && onPageRename) {
                  onPageRename(currentPageId, newName)
                } else {
                  e.target.textContent = currentPageName || '페이지'
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); e.target.blur() }
                if (e.key === 'Escape') { e.target.textContent = currentPageName || '페이지'; e.target.blur() }
              }}
            >{currentPageName || '페이지'}</h2>
          </div>
          <div className="tiptap-header-actions">
            <div className="page-nav-dropdown-wrapper" ref={pageNavRef}>
              <button
                className={`tiptap-btn tiptap-btn-secondary page-nav-chevron ${showPageNav ? 'open' : ''}`}
                onClick={() => setShowPageNav(prev => !prev)}
                title="다른 페이지로 이동"
              >
                <ChevronDown size={16} />
                <span className="tiptap-btn-label">페이지 이동</span>
              </button>
              {showPageNav && (
                <div className="page-nav-dropdown">
                  <div className="page-nav-dropdown-header">페이지</div>
                  <div className="page-nav-dropdown-list">
                    {/* 업무일지 캘린더 (daily 페이지에서 부모로 이동) */}
                    {currentPage?.page_type === 'daily' && currentPage.parent_id && (
                      <button
                        className="page-nav-dropdown-item"
                        onClick={() => setCurrentPageId(currentPage.parent_id)}
                      >
                        <CalendarDays size={14} />
                        <span>업무일지</span>
                      </button>
                    )}
                    {/* 현재 페이지 (강조) */}
                    <button className="page-nav-dropdown-item current">
                      <FileText size={14} />
                      <span>{currentPageName || '페이지'}</span>
                      <svg width="12" height="12" viewBox="0 0 12 12" className="page-nav-dropdown-check">
                        <path d="M2.5 6l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {siblingPages.map(page => (
                      <button
                        key={page.id}
                        className="page-nav-dropdown-item"
                        onClick={() => setCurrentPageId(page.id)}
                      >
                        <FileText size={14} />
                        <span>{page.name}</span>
                      </button>
                    ))}
                    {siblingPages.length === 0 && !currentPage?.parent_id && (
                      <div className="page-nav-dropdown-empty">다른 페이지가 없습니다</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => {
                const projectName = projects?.find(p => p.id === currentProjectId)?.name || ''
                toggleFavorite(currentPageId, currentProjectId, currentPageName, projectName)
              }}
              className={`tiptap-btn tiptap-btn-icon favorite-btn ${isFavorite(currentPageId) ? 'is-favorite' : ''}`}
              title={isFavorite(currentPageId) ? '즐겨찾기 해제' : '즐겨찾기 추가'}
            >
              <Star size={18} fill={isFavorite(currentPageId) ? 'currentColor' : 'none'} />
            </button>
            {!isImpersonating && <button
              onClick={async () => {
                if (!confirm('현재 버전을 저장하시겠습니까?\n\n저장된 내용은 히스토리에서 확인할 수 있습니다.')) return
                const success = await saveHistory('수동 버전 저장')
                if (success) alert('버전이 저장되었습니다.')
                else alert('버전 저장에 실패했습니다.')
              }}
              className="tiptap-btn tiptap-btn-success"
              title="현재 상태를 버전으로 저장"
            >
              <Archive />
              <span className="tiptap-btn-label">저장</span>
            </button>}
            <div className="settings-wrapper" ref={settingsRef}>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="tiptap-btn tiptap-btn-secondary tiptap-btn-icon"
                title="설정"
              >
                <Settings />
              </button>
              {showSettings && (
                <>
                  <div className="settings-overlay" onClick={() => setShowSettings(false)} />
                  <div className="settings-menu">
                    <button onClick={() => { openHistory(); setShowSettings(false) }}>
                      <History size={16} /> 히스토리
                    </button>
                    <div className="settings-menu-divider" />
                    <button onClick={() => { openColumnView(); setShowSettings(false) }}>
                      <Columns3 size={16} /> 칼럼모드
                    </button>
                    <button onClick={() => { openMindMap(); setShowSettings(false) }}>
                      <GitBranch size={16} /> 마인드맵
                    </button>
                    <button onClick={() => { setShowToolbar(prev => !prev); setShowSettings(false) }}>
                      <PenLine size={16} /> {showToolbar ? '툴바 숨기기' : '툴바 보기'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {currentPage?.page_type === 'daily' && (
          <WorklogHeader
            pageDate={currentPage.page_date}
            onGoToCalendar={currentPage.parent_id ? () => setCurrentPageId(currentPage.parent_id) : null}
            onPrevDay={async () => {
              const d = new Date(currentPage.page_date + 'T00:00:00')
              d.setDate(d.getDate() - 1)
              const dateKey = d.toISOString().slice(0, 10)
              await navigateToDailyPage(dateKey)
            }}
            onNextDay={async () => {
              const d = new Date(currentPage.page_date + 'T00:00:00')
              d.setDate(d.getDate() + 1)
              const dateKey = d.toISOString().slice(0, 10)
              await navigateToDailyPage(dateKey)
            }}
            onDelete={!isImpersonating ? async () => {
              if (!confirm(`${currentPage.page_date} 업무일지를 삭제하시겠습니까?`)) return
              const parentId = currentPage.parent_id
              await deletePage(currentPageId)
              if (parentId) setCurrentPageId(parentId)
            } : null}
          />
        )}

        {/* 툴바 (뷰어 모드에서 숨김) */}
        {!isImpersonating && showToolbar && <div className="tiptap-toolbar">
          <button
            onClick={() => editorRef.current?.commands.setToggle()}
            className="tiptap-btn tiptap-btn-secondary"
            title="토글 블록 생성 (Cmd+Shift+T)"
          >
            <ChevronRight />
            <span className="tiptap-btn-label">토글</span>
          </button>
          <button
            onClick={() => editorRef.current?.commands.convertAllToToggle()}
            className="tiptap-btn tiptap-btn-secondary desktop-only"
            title="전체 내용을 토글로 변환 (paragraph, 넘버링, 점찍힌거)"
          >
            <ChevronRight />
            전체 토글화
          </button>
          <button
            onClick={() => editorRef.current?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run()}
            className="tiptap-btn tiptap-btn-secondary"
            title="3x3 표 삽입"
          >
            <Table2 />
            <span className="tiptap-btn-label">표</span>
          </button>
          <button
            onClick={() => editorRef.current?.chain().focus().toggleHeading({ level: 1 }).run()}
            className="tiptap-btn tiptap-btn-secondary tiptap-btn-icon"
            title="제목 1"
          >
            <Heading1 />
          </button>
          <button
            onClick={() => editorRef.current?.chain().focus().toggleHeading({ level: 2 }).run()}
            className="tiptap-btn tiptap-btn-secondary tiptap-btn-icon"
            title="제목 2"
          >
            <Heading2 />
          </button>
          <button
            onClick={() => editorRef.current?.chain().focus().toggleBold().run()}
            className="tiptap-btn tiptap-btn-secondary tiptap-btn-icon"
            title="굵게"
          >
            <Bold />
          </button>
          <button
            onClick={() => editorRef.current?.chain().focus().toggleItalic().run()}
            className="tiptap-btn tiptap-btn-secondary tiptap-btn-icon"
            title="기울임"
          >
            <Italic />
          </button>

          <div className="tiptap-toolbar-divider" />

          {/* 숨겨진 파일 input */}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => imageInputRef.current?.click()}
            className="tiptap-btn tiptap-btn-secondary tiptap-btn-icon"
            title="이미지 업로드"
          >
            <Image />
          </button>
          <button
            onClick={handleInsertLink}
            className="tiptap-btn tiptap-btn-secondary tiptap-btn-icon"
            title="링크 삽입"
          >
            <Link />
          </button>
          <button
            onClick={() => editorRef.current?.chain().focus().toggleCodeBlock().run()}
            className="tiptap-btn tiptap-btn-secondary tiptap-btn-icon"
            title="코드 블록"
          >
            <Code />
          </button>
        </div>}

        {/* 하위 페이지는 콘텐츠 내 page 블록으로 인라인 표시 (노션 스타일) */}

        <div className={`tiptap-editor-wrapper ${currentPage?.page_type === 'daily' ? 'tiptap-editor-wrapper--daily' : ''}`}>
          {content ? (
            <TipTapEditor
              content={content}
              onUpdate={handleUpdate}
              placeholder="내용을 입력하세요..."
              editorRef={editorRef}
              isViewerMode={isImpersonating}
              onViewerEditAttempt={showViewerToast}
              isMaster={isMaster}
              isDailyPage={currentPage?.page_type === 'daily'}
            />
          ) : (
            <div className="tiptap-loading">로딩 중...</div>
          )}
        </div>

        {/* 업무일지: 섹션 추가 버튼 */}
        {currentPage?.page_type === 'daily' && !isImpersonating && editorRef.current && (
          <button
            className="worklog-add-section-btn"
            onClick={() => {
              const editor = editorRef.current
              if (!editor) return
              const { doc } = editor.state
              const endPos = doc.content.size
              const sectionNode = editor.schema.nodes.toggle.create(
                { isOpen: true, blockType: 'h2', isTodo: false, todoChecked: false, autoGenerated: false, backgroundColor: null, isFixedSection: false },
                [
                  editor.schema.nodes.paragraph.create(null, [editor.schema.text('새 섹션')]),
                  editor.schema.nodes.toggle.create(
                    { isOpen: true, isTodo: false, blockType: 'paragraph', todoChecked: false, autoGenerated: false, backgroundColor: null },
                    [editor.schema.nodes.paragraph.create()]
                  ),
                ]
              )
              editor.chain().focus().insertContentAt(endPos, sectionNode.toJSON()).run()
            }}
          >
            + 섹션 추가
          </button>
        )}

        {/* 업무일지: 섹션 인라인 코멘트 (Portal로 섹션 DOM에 붙임) */}
        {currentPage?.page_type === 'daily' && commentTarget && commentAnchorEl && createPortal(
          <div className="worklog-inline-comments">
            <WorklogComments
              comments={comments.filter(c => c.target_type === commentTarget.type && c.target_id === commentTarget.id)}
              mentionableUsers={mentionableUsers}
              currentUserEmail={session?.user?.email}
              onAdd={(content, mentions) => addComment(content, mentions, commentTarget.type, commentTarget.id)}
              onToggleResolved={toggleResolved}
              onDelete={deleteComment}
              commentTarget={commentTarget.id}
              onClearTarget={() => { setCommentTarget(null); setCommentAnchorEl(null) }}
              defaultOpen
            />
          </div>,
          commentAnchorEl
        )}

        {/* 업무일지: 하단 전체 코멘트 */}
        {currentPage?.page_type === 'daily' && (
          <WorklogComments
            comments={comments}
            mentionableUsers={mentionableUsers}
            currentUserEmail={session?.user?.email}
            onAdd={addComment}
            onToggleResolved={toggleResolved}
            onDelete={deleteComment}
          />
        )}

        {/* 뷰어 모드 토스트 */}
        {viewerToast && (
          <div className="viewer-toast">뷰어모드입니다</div>
        )}
      </div>

      {/* 히스토리 모달 */}
      {showHistory && (
        <div className="tiptap-modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="tiptap-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tiptap-modal-header">
              <h3 className="tiptap-modal-title">버전 히스토리</h3>
              <button className="tiptap-modal-close" onClick={() => setShowHistory(false)}>
                ✕
              </button>
            </div>

            <div className="tiptap-modal-body">
              {isLoadingHistory ? (
                <p className="tiptap-history-empty">로딩 중...</p>
              ) : historyList.length === 0 ? (
                <p className="tiptap-history-empty">저장된 버전이 없습니다.</p>
              ) : (
                <div className="tiptap-history-list">
                  {historyList.map((version) => (
                    <div key={version.id} className="tiptap-history-item">
                      <div className="tiptap-history-item-header">
                        <div className="tiptap-history-item-info">
                          <div className="tiptap-history-date">
                            {new Date(version.created_at).toLocaleString('ko-KR')}
                          </div>
                          <div className="tiptap-history-desc">
                            {version.description || '(설명 없음)'}
                          </div>
                        </div>
                        <button
                          onClick={() => restoreVersion(version.id)}
                          className="tiptap-btn tiptap-btn-secondary"
                        >
                          <RotateCcw />
                          복구
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 칼럼 뷰 모드 */}
      {showColumnView && (
        <ColumnView
          blocks={columnBlocks}
          setBlocks={setColumnBlocks}
          onSave={handleColumnSave}
          onClose={closeColumnView}
          pageName={currentPageName}
        />
      )}

      {/* 마인드맵 뷰 모드 */}
      {showMindMap && (
        <MindMapView
          blocks={mindMapBlocks}
          setBlocks={setMindMapBlocks}
          onSave={handleMindMapSave}
          onClose={closeMindMap}
          pageName={currentPageName}
        />
      )}

    </div>
  )
}

export default TipTapTestPage
