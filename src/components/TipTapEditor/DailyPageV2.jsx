// daily 페이지 v2 — row 기반 read/write 통합 컴포넌트.
// WORKLOG-SPEC.md §10 Phase v2.2.
//
// 책임:
//   - useDailyBlocks 로 row 가져옴
//   - blocksToDoc 로 TipTap doc 조립 → 에디터에 전달
//   - onUpdate → docToBlocks → applyDiff (debounce)
//   - 마운트 시 carryOverLazy (prevPageId 가 있으면)
//
// TipTapTestPage 가 page_type === 'daily' 면 본문 영역을 본 컴포넌트로 교체.
// 헤더 (WorklogHeader), 코멘트, 사이드 패널 등은 호출자 (TipTapTestPage) 가 wrap.

import React, { useEffect, useMemo, useRef, useCallback, useState } from 'react'
import TipTapEditor from './TipTapEditor'
import { useDailyBlocks } from '../../hooks/useDailyBlocks'
import { blocksToDoc } from '../../utils/blocksToDoc'
import { docToBlocks } from '../../utils/docToBlocks'
import { syncThreadCheckbox } from '../../utils/dailyBlockOps'
import { carryOverLazy } from '../../utils/carryOverPipelineV2'
import { newBlockId } from '../../utils/blockIdV2'
import { supabase } from '../../supabaseClient'
import { logError } from '../../utils/supabaseError'

const SAVE_DEBOUNCE_MS = 500

function diffEmpty(diff) {
  return (!diff.insert || !diff.insert.length)
      && (!diff.update || !diff.update.length)
      && (!diff.softDelete || !diff.softDelete.length)
}

function findCheckboxToggleUpdates(diff) {
  // patch 에 todoChecked 가 포함된 update 만 추출 — thread 동기화 대상.
  return (diff.update || []).filter(u =>
    u.patch && Object.prototype.hasOwnProperty.call(u.patch, 'todoChecked')
  )
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

export default function DailyPageV2({
  session,
  pageId,
  pageDate,
  prevPageId,           // 직전 daily 페이지 id (있으면 마운트 시 lazy 이월)
  isMaster = false,
  placeholder,
}) {
  const userId = session?.user?.id
  const ctx = useMemo(() => ({ pageId, pageDate, userId }), [pageId, pageDate, userId])

  const { blocks, loading, error, applyDiff, refetch, initialLoaded } = useDailyBlocks(pageId)

  // row → doc
  const sourceDoc = useMemo(() => blocksToDoc(blocks), [blocks])

  // stableDoc: TipTapEditor 에 전달할 doc.
  //   - 마운트 / 외부 변경 (realtime, refetch) 시 sourceDoc 으로 갱신
  //   - 사용자가 타이핑 중일 땐 갱신 skip → setContent 가 selection 리셋하지 않음
  const [stableDoc, setStableDoc] = useState(sourceDoc)
  const lastSavedDocRef = useRef(sourceDoc)
  const saveTimerRef = useRef(null)
  const userTypingAtRef = useRef(0)
  const TYPING_GUARD_MS = 2000

  useEffect(() => {
    // stableDoc 이 비어있고 sourceDoc 가 콘텐츠 있으면 typing 가드 무시 — 첫 fill 우선 (마운트 흐름 보호)
    const stableHasContent = (stableDoc?.content?.length || 0) > 0
    const sourceHasContent = (sourceDoc?.content?.length || 0) > 0
    if (!stableHasContent && sourceHasContent) {
      setStableDoc(sourceDoc)
      lastSavedDocRef.current = sourceDoc
      return
    }
    if (Date.now() - userTypingAtRef.current < TYPING_GUARD_MS) return
    setStableDoc(sourceDoc)
    lastSavedDocRef.current = sourceDoc
  }, [sourceDoc])

  // 마운트 시 lazy 이월 — 직전 daily 의 신규 미완료 todo 를 추가
  const lazyDoneRef = useRef(false)
  useEffect(() => {
    if (!pageId || !userId || !pageDate) return
    if (!prevPageId) return
    if (lazyDoneRef.current) return
    lazyDoneRef.current = true
    carryOverLazy(supabase, prevPageId, ctx)
      .then(result => {
        if (result.inserted > 0) refetch()
      })
      .catch(err => logError('DailyPageV2.carryOverLazy', err))
  }, [pageId, userId, pageDate, prevPageId, ctx, refetch])

  // Quick Todo 외부 INSERT 이벤트 → 재조회
  useEffect(() => {
    const onQuickTodo = (e) => {
      if (e?.detail?.pageId === pageId) refetch()
    }
    window.addEventListener('quicktodo-inserted', onQuickTodo)
    return () => window.removeEventListener('quicktodo-inserted', onQuickTodo)
  }, [pageId, refetch])

  // 에디터 변경 → diff → applyDiff (debounce)
  const handleUpdate = useCallback((nextDoc) => {
    // 마운트 직후 TipTapEditor 의 setContent 부수효과로 onUpdate 가 호출될 수 있음.
    // 그 경우 nextDoc 이 lastSavedDoc 와 같으므로 typing 가드 갱신 안 함 (4섹션 mount 흐름 보호).
    try {
      const same = JSON.stringify(nextDoc) === JSON.stringify(lastSavedDocRef.current)
      if (!same) userTypingAtRef.current = Date.now()
    } catch {
      userTypingAtRef.current = Date.now()
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        // 진단: doc 의 최상위 토글 attrs 출력 — section row 의 blockType='h2' 가 보존되는지 확인용
        if (typeof window !== 'undefined' && window.__DEBUG_V2) {
          console.log('[DailyPageV2.handleUpdate] doc roots:', (nextDoc?.content || []).map(n => ({
            type: n?.type, blockType: n?.attrs?.blockType, blockId: n?.attrs?.blockId,
          })))
        }
        const diff = docToBlocks(lastSavedDocRef.current, nextDoc, ctx)
        if (diffEmpty(diff)) return

        const checkboxUpdates = findCheckboxToggleUpdates(diff)

        // 자유 섹션 master 폐기 (사용자가 daily 에서 자유 섹션을 삭제하면 master 도 비활성화 → 다음 daily 에 등장 안 함)
        const blocksMap = new Map(blocks.map(b => [b.blockId, b]))
        const userMasters = userSectionMasterIdsBeingDeleted(diff, blocksMap)

        await applyDiff(diff)
        lastSavedDocRef.current = nextDoc

        if (userMasters.length > 0) {
          supabase
            .from('worklog_sections')
            .update({ deleted_at: new Date().toISOString() })
            .in('id', userMasters)
            .eq('created_by', userId)
            .then(({ error }) => { if (error) logError('DailyPageV2.softDeleteSectionMaster', error) })
        }

        // thread 동기화 — 체크박스가 토글된 row 들에 한해.
        // schema cache stale 등으로 실패해도 사이트 동작에 영향 없음 → silent.
        for (const u of checkboxUpdates) {
          syncThreadCheckbox(supabase, u.blockId, u.patch.todoChecked)
            .catch(() => {})
        }
      } catch (err) {
        logError('DailyPageV2.handleUpdate', err)
        // 실패 시 일관성 회복: refetch 로 row 재조회 → useEffect 가 sourceDoc 다시 박음
        refetch()
      }
    }, SAVE_DEBOUNCE_MS)
  }, [applyDiff, ctx, refetch, blocks, userId])

  // 컴포넌트 unmount 또는 pageId 변경 시 pending save flush
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [pageId])

  // 자유 섹션 추가 핸들러 (§3.4)
  const handleAddSection = useCallback(async () => {
    const title = prompt('새 섹션 이름:')
    if (!title?.trim()) return
    if (!userId || !pageId) return

    try {
      const masterId = newBlockId()
      const { error: msErr } = await supabase
        .from('worklog_sections')
        .insert({
          id: masterId,
          title: title.trim(),
          scope: 'user',
          section_type: 'user',
          created_by: userId,
          visibility: 'all',
          is_default: false,
          sort_order: 999,
        })
      if (msErr) throw msErr

      const maxPosition = blocks
        .filter(b => b.parentBlockId === null)
        .reduce((m, b) => Math.max(m, b.position || 0), 0)
      const sectionBlockId = newBlockId()
      const sectionRow = {
        blockId: sectionBlockId,
        pageId,
        pageDate,
        userId,
        blockType: 'section',
        parentBlockId: null,
        sectionId: sectionBlockId,
        sectionMasterId: masterId,
        position: maxPosition + 1,
        textContent: title.trim(),
        richContent: null,
        isTodo: false,
        todoChecked: false,
        todoStatus: 'open',
        isCarryOver: false,
        carryOverFrom: null,
        originBlockId: null,
        isPinned: false,
        visibility: 'all',
        isFixedSection: false,
      }
      // 빈 자식 토글 — 섹션 헤더 아래 입력 시작점
      const emptyChildRow = {
        blockId: newBlockId(),
        pageId,
        pageDate,
        userId,
        blockType: 'toggle',
        parentBlockId: sectionBlockId,
        sectionId: sectionBlockId,
        sectionMasterId: null,
        position: 999,
        textContent: '',
        richContent: null,
        isTodo: false,
        todoChecked: false,
        todoStatus: 'open',
        isCarryOver: false,
        carryOverFrom: null,
        originBlockId: null,
        isPinned: false,
        visibility: 'all',
        isFixedSection: false,
      }
      await applyDiff({ insert: [sectionRow, emptyChildRow], update: [], softDelete: [] })
    } catch (err) {
      logError('DailyPageV2.handleAddSection', err)
      alert('섹션 추가 실패: ' + (err?.message || err))
    }
  }, [userId, pageId, pageDate, blocks, applyDiff])

  if (error) return <div className="daily-page-v2-error">불러오기 실패: {String(error.message || error)}</div>
  // 첫 fetch 완료 전엔 에디터 마운트 안 함 — 빈 doc → 채워진 doc 전환 시 BubbleMenu race 회피
  if (!initialLoaded) return <div className="daily-page-v2-loading">로딩...</div>

  return (
    <div className="daily-page-v2">
      <TipTapEditor
        content={stableDoc}
        onUpdate={handleUpdate}
        placeholder={placeholder}
        isMaster={isMaster}
        isDailyPage={true}
      />
      <button
        type="button"
        className="worklog-add-section-btn"
        onClick={handleAddSection}
      >
        + 섹션 추가
      </button>
    </div>
  )
}
