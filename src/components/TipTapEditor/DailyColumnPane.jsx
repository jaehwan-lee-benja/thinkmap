// 데일리 페이지의 단일 에디터 패널 — TipTapEditor + 저장 파이프라인 캡슐화.
// DailyPageV2 가 1단/컬럼/카드 뷰에선 1개, 2단(좌/우 분할) 뷰에선 2개를 렌더한다.
//
// 저장 스코핑(핵심): 이 패널의 docToBlocks(prev,next) 는 이 패널에 공급된 blocks 만 diff 에 포함한다.
// 반대 칸 블록은 prev/next 어느 doc 에도 없으므로 절대 softDelete 되지 않는다. 대량삭제 가드도
// 이 패널의 blocks.length 로 스코핑된다. (2단 분할 시 패널 간 격리의 근거)

import React, { useEffect, useMemo, useRef, useCallback, useState } from 'react'
import TipTapEditor from './TipTapEditor'
import { blocksToDoc } from '../../utils/blocksToDoc'
import { docToBlocks } from '../../utils/docToBlocks'
import { syncThreadCheckbox } from '../../utils/dailyBlockOps'
import { supabase } from '../../supabaseClient'
import { logError } from '../../utils/supabaseError'

const SAVE_DEBOUNCE_MS = 500
const TYPING_GUARD_MS = 2000

function diffEmpty(diff) {
  return (!diff.insert || !diff.insert.length)
      && (!diff.update || !diff.update.length)
      && (!diff.softDelete || !diff.softDelete.length)
}

function findCheckboxToggleUpdates(diff) {
  return (diff.update || []).filter(u =>
    u.patch && Object.prototype.hasOwnProperty.call(u.patch, 'todoChecked')
  )
}

// nextDoc 의 최상위 h2 섹션 토글에서 sectionMasterId 순서대로 추출 (드래그 후 새 순서).
export function extractSectionMasterOrder(doc) {
  if (!doc || !Array.isArray(doc.content)) return []
  return doc.content
    .filter(n => n && n.type === 'toggle' && n.attrs?.blockType === 'h2')
    .map(n => n.attrs?.sectionMasterId)
    .filter(Boolean)
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

// 자유 섹션 (scope='user') 의 master id 만 추출. fixed_* 는 절대 폐기 안 함.
function userSectionMasterIdsBeingDeleted(diff, blocksMap) {
  const masters = new Set()
  for (const blockId of (diff.softDelete || [])) {
    const row = blocksMap.get(blockId)
    if (!row || row.blockType !== 'section') continue
    const m = row.sectionMasterId
    if (!m) continue
    if (typeof m === 'string' && m.startsWith('fixed_')) continue
    masters.add(m)
  }
  return [...masters]
}

export default function DailyColumnPane({
  blocks,
  applyDiff,
  ctx,
  refetch,
  initialLoaded,
  isMaster = false,
  placeholder,
  userId,
  parentId,
  pageId,
  pageDate,
  editorRef: externalEditorRef,
  scrollable = false,         // 2단 분할 패널이면 자체 스크롤 컨테이너로 감쌈
  manageSectionOrder = true,  // 전체 섹션을 가진 패널만 section_order 를 갱신 (2단 분할 패널은 false → 상위에서 처리)
  emptyHint,                  // 비어있을 때 표시할 placeholder 텍스트 (2단 빈 칸)
}) {
  const sourceDoc = useMemo(() => blocksToDoc(blocks), [blocks])

  const [stableDoc, setStableDoc] = useState(sourceDoc)
  const lastSavedDocRef = useRef(sourceDoc)
  const saveTimerRef = useRef(null)
  const userTypingAtRef = useRef(0)
  const internalEditorRef = useRef(null)
  const editorRef = externalEditorRef || internalEditorRef

  useEffect(() => {
    // stableDoc 이 비어있고 sourceDoc 가 콘텐츠 있으면 typing 가드 무시 — 첫 fill 우선 (마운트 흐름 보호)
    const stableHasContent = (stableDoc?.content?.length || 0) > 0
    const sourceHasContent = (sourceDoc?.content?.length || 0) > 0
    if (!stableHasContent && sourceHasContent) {
      setStableDoc(sourceDoc)
      lastSavedDocRef.current = sourceDoc
      return
    }
    // 최상위 섹션 구성(개수/순서/id)이 바뀌면 타이핑 가드 무시하고 즉시 반영.
    // — '모두 오른쪽/왼쪽'·단 이동으로 섹션이 이 패널에서 빠졌는데도 가드(2s)에 막혀
    //   옛 내용이 남는 문제 방지 (순수 텍스트 편집엔 영향 없음).
    const topSig = (doc) => (doc?.content || []).map(n => n?.attrs?.blockId || '').join('|')
    if (topSig(sourceDoc) !== topSig(stableDoc)) {
      setStableDoc(sourceDoc)
      lastSavedDocRef.current = sourceDoc
      return
    }
    if (Date.now() - userTypingAtRef.current < TYPING_GUARD_MS) return
    setStableDoc(sourceDoc)
    lastSavedDocRef.current = sourceDoc
  }, [sourceDoc])

  // 에디터 변경 → diff → applyDiff (debounce)
  const handleUpdate = useCallback((nextDoc) => {
    // Mount race 근본 차단: 초기 fetch 완료 전 onUpdate 는 mount 흐름의 부수효과.
    if (!initialLoaded) return

    try {
      const same = JSON.stringify(nextDoc) === JSON.stringify(lastSavedDocRef.current)
      if (!same) userTypingAtRef.current = Date.now()
    } catch {
      userTypingAtRef.current = Date.now()
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        if (typeof window !== 'undefined' && window.__DEBUG_V2) {
          console.log('[DailyColumnPane.handleUpdate] doc roots:', (nextDoc?.content || []).map(n => ({
            type: n?.type, blockType: n?.attrs?.blockType, blockId: n?.attrs?.blockId,
          })))
        }
        const diff = docToBlocks(lastSavedDocRef.current, nextDoc, ctx)
        if (diffEmpty(diff)) return

        // 대량 softDelete 가드 — 이 패널의 blocks 기준으로 스코핑.
        const delCount = diff.softDelete?.length || 0
        const insCount = diff.insert?.length || 0
        const updCount = diff.update?.length || 0
        const activeCount = blocks.length
        if (delCount >= 5 && delCount >= activeCount * 0.5 && insCount === 0 && updCount === 0) {
          console.warn('[DailyColumnPane] mass softDelete blocked', {
            delCount, activeCount, pageId, pageDate,
          })
          refetch()
          return
        }

        const checkboxUpdates = findCheckboxToggleUpdates(diff)

        const blocksMap = new Map(blocks.map(b => [b.blockId, b]))
        const userMasters = userSectionMasterIdsBeingDeleted(diff, blocksMap)

        const prevOrder = extractSectionMasterOrder(lastSavedDocRef.current)
        const nextOrder = extractSectionMasterOrder(nextDoc)
        const sectionOrderChanged = !arraysEqual(prevOrder, nextOrder) && nextOrder.length > 0

        await applyDiff(diff)
        lastSavedDocRef.current = nextDoc

        if (manageSectionOrder && sectionOrderChanged && userId && parentId) {
          supabase
            .from('worklog_board_user_settings')
            .upsert({ user_id: userId, board_id: parentId, section_order: nextOrder, updated_at: new Date().toISOString() }, { onConflict: 'user_id,board_id' })
            .then(({ error }) => {
              if (error) logError('worklog_board_user_settings.section_order 동기화', error)
            })
        }

        void userMasters

        for (const u of checkboxUpdates) {
          syncThreadCheckbox(supabase, u.blockId, u.patch.todoChecked)
            .catch(() => {})
        }
      } catch (err) {
        logError('DailyColumnPane.handleUpdate', err)
        refetch()
      }
    }, SAVE_DEBOUNCE_MS)
  }, [applyDiff, ctx, refetch, blocks, userId, parentId, initialLoaded, pageId, pageDate, manageSectionOrder])

  // unmount / pageId 변경 시 pending save flush
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [pageId])

  const editorEl = (
    <TipTapEditor
      content={stableDoc}
      onUpdate={handleUpdate}
      placeholder={placeholder}
      isMaster={isMaster}
      isDailyPage={true}
      editorRef={editorRef}
    />
  )

  // 단일 패널(1단/컬럼/카드)은 래퍼 없이 직접 렌더 — 캐러셀 CSS 의 `> .tiptap-wrapper` 직계 선택자 보존.
  if (!scrollable) return editorEl

  // 2단 분할 패널: 자체 세로 스크롤 컨테이너
  const isEmpty = (blocks?.length || 0) === 0
  return (
    <div className="daily-pane-scroll">
      {editorEl}
      {isEmpty && emptyHint && (
        <div className="daily-pane-empty-hint">{emptyHint}</div>
      )}
    </div>
  )
}
