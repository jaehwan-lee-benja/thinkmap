import React, { useState, useEffect, useRef, useCallback } from 'react'
import TipTapEditor from './TipTapEditor'
import ColumnView from './ColumnView'
import MindMapView from './MindMapView'
import { supabase } from '../../supabaseClient'
import { convertFlatBlocksToTiptap } from './utils/convertBlocksToTiptap'
import { tiptapToColumnBlocks, columnBlocksToTiptap } from './utils/columnViewUtils'
import {
  Save,
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
  GitBranch
} from 'lucide-react'
import './TipTapPage.css'

/**
 * TipTap 에디터 페이지
 * 메인 에디터 컴포넌트
 */
function TipTapTestPage({ session, currentPageId, currentPageName, onPageRename }) {
  const [content, setContent] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const editorRef = useRef(null)
  const imageInputRef = useRef(null)

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
    if (!session?.user?.id || !currentPageId || !content) return false

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
    if (!editorRef.current) return

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

      // 에디터에 적용
      editorRef.current.commands.setContent(restoredContent)
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
          setContent(data.content_tiptap)
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
    isInitialLoadRef.current = false  // 사용자가 편집 시작
    setContent(newContent)
  }

  // 저장 함수
  const handleSave = async () => {
    if (!session || !currentPageId || !content) return

    setIsSaving(true)
    try {
      const { error } = await supabase
        .from('pages')
        .update({
          content_tiptap: content,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentPageId)

      if (error) {
        console.error('저장 실패:', error)
        alert('저장에 실패했습니다: ' + error.message)
      } else {
        setLastSaved(new Date())
      }
    } catch (err) {
      console.error('예상치 못한 오류:', err)
      alert('저장 중 오류가 발생했습니다')
    } finally {
      setIsSaving(false)
    }
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
    if (!contentToSave || !pageIdToSave || !session?.user?.id) return

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
  }, [session?.user?.id, isContentChanged])

  // 자동 저장 (500ms debounce) - 사용자 편집 시에만
  useEffect(() => {
    if (!content || !session || !currentPageId) return

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

          if (contentChanged && session?.user?.id) {
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

  return (
    <div className="tiptap-page">
      <div className="tiptap-page-inner">
        {/* 페이지 헤더 */}
        <div className="tiptap-page-header">
          <h2 className="tiptap-page-title">{currentPageName || '페이지'}</h2>
          <div className="tiptap-header-actions">
            <button
              onClick={handleSave}
              className="tiptap-btn tiptap-btn-primary"
              title={lastSaved ? `마지막 저장: ${lastSaved.toLocaleTimeString()}` : '저장'}
            >
              <Save />
              저장
            </button>
            <button
              onClick={async () => {
                const success = await saveHistory('수동 버전 저장')
                if (success) alert('버전이 저장되었습니다.')
                else alert('버전 저장에 실패했습니다.')
              }}
              className="tiptap-btn tiptap-btn-success"
              title="현재 상태를 버전으로 저장"
            >
              <Archive />
              버전 저장
            </button>
            <button
              onClick={openHistory}
              className="tiptap-btn tiptap-btn-purple"
              title="버전 히스토리 보기"
            >
              <History />
              히스토리
            </button>
            <button
              onClick={openColumnView}
              className="tiptap-btn tiptap-btn-secondary"
              title="칼럼 모드로 보기"
            >
              <Columns3 />
              칼럼모드
            </button>
            <button
              onClick={openMindMap}
              className="tiptap-btn tiptap-btn-secondary"
              title="마인드맵 모드로 보기"
            >
              <GitBranch />
              마인드맵
            </button>
          </div>
        </div>

        {/* 툴바 */}
        <div className="tiptap-toolbar">
          <button
            onClick={() => editorRef.current?.commands.setToggle()}
            className="tiptap-btn tiptap-btn-secondary"
            title="토글 블록 생성 (Cmd+Shift+T)"
          >
            <ChevronRight />
            토글
          </button>
          <button
            onClick={() => editorRef.current?.commands.convertAllToToggle()}
            className="tiptap-btn tiptap-btn-secondary"
            title="전체 내용을 토글로 변환 (paragraph, 넘버링, 점찍힌거)"
          >
            <ChevronRight />
            전체 토글화
          </button>
          <button
            onClick={() => editorRef.current?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            className="tiptap-btn tiptap-btn-secondary"
            title="3x3 표 삽입"
          >
            <Table2 />
            표
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
        </div>

        {/* 에디터 */}
        <div className="tiptap-editor-wrapper">
          {content ? (
            <TipTapEditor
              content={content}
              onUpdate={handleUpdate}
              placeholder="내용을 입력하세요..."
              editorRef={editorRef}
            />
          ) : (
            <div className="tiptap-loading">로딩 중...</div>
          )}
        </div>
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
