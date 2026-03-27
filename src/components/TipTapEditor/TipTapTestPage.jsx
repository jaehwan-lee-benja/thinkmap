import React, { useState, useEffect, useRef, useCallback } from 'react'
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
import { FileText, Star, ChevronDown, X } from 'lucide-react'
import { CalendarView } from '../CalendarView/CalendarView'
import './TipTapPage.css'

/**
 * TipTap 에디터 페이지
 * 메인 에디터 컴포넌트
 */
function TipTapTestPage({ session, currentPageId, currentPageName, onPageRename, isImpersonating = false, sidebarOpen, onToggleSidebar, mobileView = 'editor', onMobileViewChange, viewerToggleOverrides = {}, saveViewerToggleOverrides }) {
  const [content, setContent] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)

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
  const { pages, setCurrentPageId, createPage, goBack, goForward, canGoBack, canGoForward } = usePageContext()
  const { projects, currentProjectId } = useProjectContext()
  const { toggleFavorite, isFavorite } = useFavoritesContext()
  const currentPage = pages.find(p => p.id === currentPageId)
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

  // 현재 페이지의 하위 페이지 목록
  const childPages = pages
    .filter(p => p.parent_id === currentPageId)
    .sort((a, b) => a.position - b.position)

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

  // 페이지 로드 시 데이터 가져오기
  useEffect(() => {
    if (!session || !currentPageId) return

    // 페이지 전환: 이전 콘텐츠가 새 페이지에 저장되지 않도록 즉시 플래그 설정
    isInitialLoadRef.current = true
    setContent(null)

    const loadContent = async () => {
      try {
        // 1. pages 테이블에서 content_tiptap 확인
        const { data, error } = await supabase
          .from('pages')
          .select('content_tiptap')
          .eq('id', currentPageId)
          .single()

        if (error) {
          console.error('콘텐츠 로드 실패:', error)
          return
        }

        // 2. content_tiptap이 있으면 사용
        if (data?.content_tiptap) {
          // 뷰어 모드: 토글 오버라이드 적용
          const finalContent = isImpersonating
            ? applyToggleOverrides(data.content_tiptap, viewerToggleOverrides[currentPageId])
            : data.content_tiptap
          setContent(finalContent)
          lastHistoryContentRef.current = data.content_tiptap
          // 로드 완료 후 prevPageRef를 올바른 페이지+콘텐츠로 설정
          prevPageRef.current = { pageId: currentPageId, content: data.content_tiptap }
          return
        }

        // 3. content_tiptap이 없으면 기존 blocks 테이블에서 마이그레이션 시도
        const { data: blocks, error: blocksError } = await supabase
          .from('blocks')
          .select('*')
          .eq('page_id', currentPageId)
          .eq('user_id', session.user.id)
          .order('position', { ascending: true })

        if (blocksError) {
          console.error('블록 로드 실패:', blocksError)
        }

        if (blocks && blocks.length > 0) {
          const tiptapContent = convertFlatBlocksToTiptap(blocks)
          setContent(tiptapContent)
          lastHistoryContentRef.current = tiptapContent
          prevPageRef.current = { pageId: currentPageId, content: tiptapContent }

          await supabase
            .from('pages')
            .update({ content_tiptap: tiptapContent })
            .eq('id', currentPageId)

          return
        }

        // 4. 블록도 없으면 토글 블록으로 시작
        const emptyContent = {
          type: 'doc',
          content: [{ type: 'toggle', attrs: { isOpen: true, autoGenerated: false }, content: [{ type: 'paragraph', content: [] }] }]
        }
        setContent(emptyContent)
        lastHistoryContentRef.current = emptyContent
        prevPageRef.current = { pageId: currentPageId, content: emptyContent }
      } catch (err) {
        console.error('예상치 못한 오류:', err)
      }
    }

    loadContent()
  }, [session, currentPageId])

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
    // 이 달력 페이지의 하위 페이지(daily) 목록
    const dailyPages = pages.filter(p => p.parent_id === currentPageId)

    const handleCreateDailyPage = async (dateKey) => {
      const newPage = await createPage(dateKey, currentPageId)
      if (newPage) {
        // page_date와 page_type 설정
        await supabase
          .from('pages')
          .update({ page_date: dateKey, page_type: 'daily' })
          .eq('id', newPage.id)

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
          />
        </div>
      </div>
    )
  }

  return (
    <div ref={pageRef} className={`tiptap-page ${isTablet ? 'tiptap-page--mobile' : ''}`}>
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
                    {siblingPages.length === 0 && (
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

        {/* 하위 페이지 목록 */}
        <div className="child-pages-section">
          {childPages.map(page => (
            <button
              key={page.id}
              className="child-page-card"
              onClick={() => setCurrentPageId(page.id)}
            >
              <FileText size={16} />
              <span className="child-page-name">{page.name}</span>
            </button>
          ))}
          {!isImpersonating && <button
            className="child-page-card child-page-add"
            onClick={async () => {
              const newPage = await createPage('새 페이지', currentPageId)
              if (newPage) setCurrentPageId(newPage.id)
            }}
          >
            <span className="child-page-add-icon">+</span>
            <span className="child-page-name">페이지 추가</span>
          </button>}

        </div>

        <div className="tiptap-editor-wrapper">
          {content ? (
            <TipTapEditor
              content={content}
              onUpdate={handleUpdate}
              placeholder="내용을 입력하세요..."
              editorRef={editorRef}
              isViewerMode={isImpersonating}
              onViewerEditAttempt={showViewerToast}
            />
          ) : (
            <div className="tiptap-loading">로딩 중...</div>
          )}
        </div>

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
