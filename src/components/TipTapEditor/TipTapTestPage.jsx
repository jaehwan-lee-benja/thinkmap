import React, { useState, useEffect, useRef } from 'react'
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
          return
        }

        // 3. content_tiptap이 없으면 기존 blocks 테이블에서 마이그레이션 시도
        console.log('content_tiptap 없음, blocks 테이블에서 마이그레이션 시도...')
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
          // 기존 블록을 TipTap JSON으로 변환
          console.log(`${blocks.length}개 블록 발견, TipTap으로 변환 중...`)
          const tiptapContent = convertFlatBlocksToTiptap(blocks)
          setContent(tiptapContent)

          // 변환된 내용을 pages 테이블에 저장 (마이그레이션)
          await supabase
            .from('pages')
            .update({ content_tiptap: tiptapContent })
            .eq('id', currentPageId)

          console.log('마이그레이션 완료!')
          return
        }

        // 4. 블록도 없으면 빈 문서로 시작
        setContent({
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }]
        })
      } catch (err) {
        console.error('예상치 못한 오류:', err)
      }
    }

    loadContent()
  }, [session, currentPageId])

  // 에디터 내용 변경 시
  const handleUpdate = (newContent) => {
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

  // 자동 저장 (2초 debounce)
  useEffect(() => {
    if (!content) return

    const timer = setTimeout(() => {
      handleSave()
    }, 2000)

    return () => clearTimeout(timer)
  }, [content, session, currentPageId])

  return (
    <div className="tiptap-page">
      <div className="tiptap-page-inner">
        {/* 페이지 헤더 */}
        <div className="tiptap-page-header">
          <h2 className="tiptap-page-title">{currentPageName || '페이지'}</h2>
          <div className="tiptap-header-actions">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="tiptap-btn tiptap-btn-primary"
              title={
                isSaving
                  ? '저장 중...'
                  : (lastSaved ? `마지막 저장: ${lastSaved.toLocaleTimeString()}` : '저장')
              }
            >
              <Save />
              {isSaving ? '저장 중...' : '저장'}
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
