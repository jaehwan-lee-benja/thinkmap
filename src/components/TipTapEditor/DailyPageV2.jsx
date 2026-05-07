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
import { LayoutList, Columns3 } from 'lucide-react'
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

// nextDoc 의 최상위 h2 섹션 토글에서 sectionMasterId 순서대로 추출 (드래그 후 새 순서).
function extractSectionMasterOrder(doc) {
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

export default function DailyPageV2({
  session,
  pageId,
  pageDate,
  prevPageId,           // 직전 daily 페이지 id (있으면 마운트 시 lazy 이월)
  parentId,             // calendar 페이지 id — 리프레시 시 직전 daily 검색용
  isMaster = false,
  placeholder,
}) {
  const userId = session?.user?.id
  const ctx = useMemo(() => ({ pageId, pageDate, userId }), [pageId, pageDate, userId])

  const { blocks, loading, error, applyDiff, refetch, initialLoaded } = useDailyBlocks(pageId)

  // row → doc
  const sourceDoc = useMemo(() => blocksToDoc(blocks), [blocks])

  // viewMode: 'list' (기본, 위→아래) | 'column' (Trello 식 가로 정렬)
  // localStorage 에 사용자별 저장.
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === 'undefined') return 'list'
    return localStorage.getItem('thinkmap.dailyViewMode') === 'column' ? 'column' : 'list'
  })
  const toggleViewMode = useCallback(() => {
    setViewMode(prev => {
      const next = prev === 'list' ? 'column' : 'list'
      try { localStorage.setItem('thinkmap.dailyViewMode', next) } catch {}
      return next
    })
  }, [])

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

  // 마스터 권한 (왕관) 토글 → worklog_sections + 모든 daily_blocks section row 동기화.
  //   1) worklog_sections.visibility — 다음 daily 페이지 templating 시 반영
  //   2) daily_blocks 의 그 master 의 모든 section row.visibility — 이미 만들어진 페이지에서도 즉시 반영
  useEffect(() => {
    const onVisibilityToggle = (e) => {
      const { masterId, newVisibility } = e.detail || {}
      if (!masterId || !newVisibility) return
      supabase
        .from('worklog_sections')
        .update({ visibility: newVisibility })
        .eq('id', masterId)
        .then(({ error }) => {
          if (error) logError('worklog_sections.visibility 동기화', error)
        })
      supabase
        .from('daily_blocks')
        .update({ visibility: newVisibility })
        .eq('section_master_id', masterId)
        .eq('block_type', 'section')
        .is('deleted_at', null)
        .then(({ error }) => {
          if (error) logError('daily_blocks.visibility 동기화', error)
        })
    }
    document.addEventListener('section-visibility-toggle', onVisibilityToggle)
    return () => document.removeEventListener('section-visibility-toggle', onVisibilityToggle)
  }, [])

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

        // 드래그 등으로 섹션 순서가 변경되면 user_settings.section_order 도 갱신 → 다음 daily 페이지에 반영
        const prevOrder = extractSectionMasterOrder(lastSavedDocRef.current)
        const nextOrder = extractSectionMasterOrder(nextDoc)
        const sectionOrderChanged = !arraysEqual(prevOrder, nextOrder) && nextOrder.length > 0

        await applyDiff(diff)
        lastSavedDocRef.current = nextDoc

        if (sectionOrderChanged && userId) {
          supabase
            .from('worklog_user_settings')
            .upsert({ user_id: userId, section_order: nextOrder, updated_at: new Date().toISOString() })
            .then(({ error }) => {
              if (error) logError('worklog_user_settings.section_order 동기화', error)
            })
        }

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

  // 이월 리프레시 — 직전 페이지의 새 자유 섹션 master 반영 + 신규 미완료 todo 추가
  const [refreshing, setRefreshing] = useState(false)
  const handleRefreshCarryOver = useCallback(async () => {
    if (!pageId || !userId || !pageDate || !parentId) return
    setRefreshing(true)
    try {
      // 1. 현재 페이지의 active section row 들 (fresh fetch — state stale 회피)
      const { data: liveBlocks, error: lbErr } = await supabase
        .from('daily_blocks')
        .select('block_type, section_master_id, text_content, position, parent_block_id')
        .eq('page_id', pageId)
        .is('deleted_at', null)
      if (lbErr) throw lbErr

      // currentMasterIds: master 직접 매칭 + textContent 매칭 fallback
      // (NULL master row 도 worklog_sections.title 과 같은 텍스트면 그 master 가 이미 페이지에 있는 것으로 간주 → 중복 INSERT 방지)
      const currentMasterIds = new Set(
        (liveBlocks || [])
          .filter(b => b.block_type === 'section' && b.section_master_id)
          .map(b => b.section_master_id)
      )
      const liveSectionTexts = new Set(
        (liveBlocks || [])
          .filter(b => b.block_type === 'section' && b.text_content)
          .map(b => b.text_content)
      )

      const { data: userSections } = await supabase
        .from('worklog_sections')
        .select('*')
        .eq('scope', 'user')
        .eq('created_by', userId)
        .is('deleted_at', null)

      // textContent 매칭으로 currentMasterIds 보강
      ;(userSections || []).forEach(s => {
        if (s.title && liveSectionTexts.has(s.title)) currentMasterIds.add(s.id)
      })

      // 같은 title 의 master 가 worklog_sections 에 여러 개면 (사용자 중복 생성)
      // 첫 번째만 missing 후보. 나머지는 현재 페이지에 같은 텍스트가 있으니 currentMasterIds 에 들어감.
      // missing 결정: master id 가 currentMasterIds 에 없고, 그 title 도 liveSectionTexts 에 없는 것.
      const missing = (userSections || []).filter(s =>
        s.id && !currentMasterIds.has(s.id) && !liveSectionTexts.has(s.title)
      )

      // 2. 누락된 user 섹션 master 의 section row + 빈 자식 토글 INSERT
      if (missing.length > 0) {
        const maxPos = (liveBlocks || [])
          .filter(b => !b.parent_block_id)
          .reduce((m, b) => Math.max(m, Number(b.position) || 0), 0)
        const newRows = []
        missing.forEach((s, i) => {
          const sectionBlockId = newBlockId()
          newRows.push({
            blockId: sectionBlockId,
            pageId, pageDate, userId,
            blockType: 'section',
            parentBlockId: null,
            sectionId: sectionBlockId,
            sectionMasterId: s.id,
            position: maxPos + i + 1,
            textContent: s.title || '',
            richContent: null,
            isTodo: false, todoChecked: false, todoStatus: 'open',
            isCarryOver: false, carryOverFrom: null, originBlockId: null,
            isPinned: false,
            visibility: s.visibility || 'all',
            isFixedSection: false,
          })
          newRows.push({
            blockId: newBlockId(),
            pageId, pageDate, userId,
            blockType: 'toggle',
            parentBlockId: sectionBlockId,
            sectionId: sectionBlockId,
            sectionMasterId: null,
            position: 999,
            textContent: '', richContent: null,
            isTodo: false, todoChecked: false, todoStatus: 'open',
            isCarryOver: false, carryOverFrom: null, originBlockId: null,
            isPinned: false, visibility: 'all', isFixedSection: false,
          })
        })
        await applyDiff({ insert: newRows, update: [], softDelete: [] })
      }

      // 3. 직전 daily 페이지의 신규 미완료 todo 이월 (carryOverLazy)
      const { data: prev } = await supabase
        .from('pages')
        .select('id')
        .eq('parent_id', parentId)
        .eq('page_type', 'daily')
        .is('deleted_at', null)
        .lt('page_date', pageDate)
        .order('page_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (prev?.id) {
        await carryOverLazy(supabase, prev.id, ctx)
      }

      await refetch()
    } catch (err) {
      logError('DailyPageV2.handleRefreshCarryOver', err)
      alert('리프레시 실패: ' + (err?.message || err))
    } finally {
      setRefreshing(false)
    }
  }, [pageId, userId, pageDate, parentId, blocks, applyDiff, ctx, refetch])

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
    <div className={`daily-page-v2 daily-page-v2--${viewMode}`}>
      <div className="daily-page-v2-toolbar">
        <button
          type="button"
          className={`view-mode-btn ${viewMode === 'list' ? 'active' : ''}`}
          onClick={() => viewMode !== 'list' && toggleViewMode()}
          title="리스트뷰 (위→아래)"
        >
          <LayoutList size={14} />
          <span>리스트</span>
        </button>
        <button
          type="button"
          className={`view-mode-btn ${viewMode === 'column' ? 'active' : ''}`}
          onClick={() => viewMode !== 'column' && toggleViewMode()}
          title="컬럼뷰 (가로 정렬, Trello 식)"
        >
          <Columns3 size={14} />
          <span>컬럼</span>
        </button>
      </div>
      <TipTapEditor
        content={stableDoc}
        onUpdate={handleUpdate}
        placeholder={placeholder}
        isMaster={isMaster}
        isDailyPage={true}
      />
      <div className="worklog-actions-row">
        <button
          type="button"
          className="worklog-add-section-btn"
          onClick={handleAddSection}
        >
          + 섹션 추가
        </button>
        <button
          type="button"
          className="worklog-refresh-btn"
          onClick={handleRefreshCarryOver}
          disabled={refreshing}
          title="직전 페이지의 새 섹션과 미완료 todo 를 가져옵니다"
        >
          {refreshing ? '리프레시 중...' : '↻ 이월 리프레시'}
        </button>
      </div>
    </div>
  )
}
