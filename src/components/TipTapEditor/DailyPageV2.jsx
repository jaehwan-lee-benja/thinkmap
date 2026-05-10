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
import { createPortal } from 'react-dom'
import { LayoutList, Columns3, Square, ChevronLeft, ChevronRight, History, Trash2, Star, MessageSquare, MoreHorizontal } from 'lucide-react'
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
  onCommentsClick,    // 코멘트 모달 트리거 (옵션)
  commentsCount = 0,
}) {
  const userId = session?.user?.id
  const ctx = useMemo(() => ({ pageId, pageDate, userId }), [pageId, pageDate, userId])

  const { blocks, loading, error, applyDiff, refetch, initialLoaded } = useDailyBlocks(pageId)

  // row → doc
  const sourceDoc = useMemo(() => blocksToDoc(blocks), [blocks])

  // viewMode: 'list' (기본, 위→아래) | 'column' (Trello 식 가로) | 'card' (집중 모드, 한 카드씩 풀폭)
  // localStorage 에 사용자별 저장.
  const VALID_VIEW_MODES = ['list', 'column', 'card']
  const [viewMode, setViewModeState] = useState(() => {
    if (typeof window === 'undefined') return 'list'
    const saved = localStorage.getItem('thinkmap.dailyViewMode')
    return VALID_VIEW_MODES.includes(saved) ? saved : 'list'
  })
  const setViewMode = useCallback((m) => {
    if (!VALID_VIEW_MODES.includes(m)) return
    setViewModeState(m)
    try { localStorage.setItem('thinkmap.dailyViewMode', m) } catch {}
  }, [])
  // 'column' 과 'card' 는 가로 carousel — 같은 인프라 (scroll-snap, drag-to-scroll, 가로 wheel)
  const isCarousel = viewMode === 'column' || viewMode === 'card'

  // stableDoc: TipTapEditor 에 전달할 doc.
  //   - 마운트 / 외부 변경 (realtime, refetch) 시 sourceDoc 으로 갱신
  //   - 사용자가 타이핑 중일 땐 갱신 skip → setContent 가 selection 리셋하지 않음
  const [stableDoc, setStableDoc] = useState(sourceDoc)
  const lastSavedDocRef = useRef(sourceDoc)
  const saveTimerRef = useRef(null)
  const userTypingAtRef = useRef(0)
  const rootRef = useRef(null)
  const editorRef = useRef(null)
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

        // 자동 폐기 비활성화 (race / 페이지 삭제 / doc 깨짐 등 의도치 않은 흐름에서
        // section row 가 사라진 것으로 인식되어 worklog_sections master 까지 일괄 deleted_at 박히는
        // 위험 케이스 발생. master 관리는 사용자가 명시적으로 별도 UI 에서 처리하도록.)
        // if (userMasters.length > 0) {
        //   supabase
        //     .from('worklog_sections')
        //     .update({ deleted_at: new Date().toISOString() })
        //     .in('id', userMasters)
        //     .eq('created_by', userId)
        //     .then(({ error }) => { if (error) logError('DailyPageV2.softDeleteSectionMaster', error) })
        // }
        void userMasters

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

  // 가로 carousel (column / card): drag-to-scroll + wheel 가로 매핑
  // drag-to-scroll 은 임계 거리(8px) 이후 활성화 → 카드 외 빈 영역과 카드 안 텍스트 모두에서 작동.
  // 임계 미만은 클릭/selection 정상 진행.
  useEffect(() => {
    if (!isCarousel) return
    const root = rootRef.current
    if (!root) return
    const pmEl = root.querySelector('.ProseMirror')
    if (!pmEl) return

    const DRAG_THRESHOLD = 8
    let isDown = false
    let startX = 0
    let startScrollLeft = 0
    let dragMode = false
    let prevCursor = ''

    const onWheel = (e) => {
      // 세로 휠 → 가로 스크롤 (가로 휠은 그대로 통과)
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault()
        pmEl.scrollLeft += e.deltaY
      }
    }
    const onDown = (e) => {
      if (e.button !== 0) return
      isDown = true
      dragMode = false
      startX = e.clientX
      startScrollLeft = pmEl.scrollLeft
    }
    const onMove = (e) => {
      if (!isDown) return
      const dx = e.clientX - startX
      if (!dragMode && Math.abs(dx) > DRAG_THRESHOLD) {
        dragMode = true
        prevCursor = pmEl.style.cursor
        pmEl.style.cursor = 'grabbing'
        // 임계 넘은 시점부터 drag 의도 → 시작된 텍스트 selection 취소
        try { window.getSelection()?.removeAllRanges() } catch {}
      }
      if (dragMode) {
        e.preventDefault()
        pmEl.scrollLeft = startScrollLeft - dx
      }
    }
    const onUp = () => {
      if (!isDown) return
      isDown = false
      if (dragMode) {
        pmEl.style.cursor = prevCursor
        dragMode = false
      }
    }

    pmEl.addEventListener('wheel', onWheel, { passive: false })
    pmEl.addEventListener('mousedown', onDown)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      pmEl.removeEventListener('wheel', onWheel)
      pmEl.removeEventListener('mousedown', onDown)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [isCarousel, blocks?.length])

  // 카드뷰 한정: 현재 화면에 보이는 카드 인덱스 추적 (인디케이터 + 화살표 네비게이션 + 키보드 ←→)
  const [currentCardIndex, setCurrentCardIndex] = useState(0)
  const [cardCount, setCardCount] = useState(0)

  useEffect(() => {
    if (viewMode !== 'card') {
      setCardCount(0)
      return
    }
    const root = rootRef.current
    if (!root) return
    const pmEl = root.querySelector('.ProseMirror')
    if (!pmEl) return

    // IntersectionObserver — 가장 큰 비율로 보이는 카드를 현재로 표시
    const intersectionObs = new IntersectionObserver((entries) => {
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (visible) {
        const cards = Array.from(pmEl.querySelectorAll(':scope > .toggle-block'))
        const idx = cards.indexOf(visible.target)
        if (idx >= 0) setCurrentCardIndex(idx)
      }
    }, { root: pmEl, threshold: [0.25, 0.5, 0.75] })

    // MutationObserver — ProseMirror 자식 (카드) 변경 시 cardCount 갱신 + IntersectionObserver 재구성
    // (TipTapEditor setContent 가 비동기라 useEffect 첫 호출 시 카드가 없을 수 있음)
    const refreshCards = () => {
      const cards = Array.from(pmEl.querySelectorAll(':scope > .toggle-block'))
      setCardCount(cards.length)
      intersectionObs.disconnect()
      cards.forEach(c => intersectionObs.observe(c))
    }
    refreshCards()
    const mutationObs = new MutationObserver(refreshCards)
    mutationObs.observe(pmEl, { childList: true })

    // 키보드 ←→ 네비게이션 — center snap
    const onKey = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (e.target?.isContentEditable) return
      e.preventDefault()
      const cards = Array.from(pmEl.querySelectorAll(':scope > .toggle-block'))
      if (cards.length === 0) return
      const dir = e.key === 'ArrowLeft' ? -1 : 1
      const next = Math.max(0, Math.min(cards.length - 1, currentCardIndex + dir))
      cards[next]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
    document.addEventListener('keydown', onKey)

    return () => {
      intersectionObs.disconnect()
      mutationObs.disconnect()
      document.removeEventListener('keydown', onKey)
    }
  }, [viewMode, currentCardIndex])

  // ⋮ 메뉴 (자식 토글의 추가 옵션 — 이월 히스토리 / 삭제)
  const [moreMenu, setMoreMenu] = useState(null)
  // 모바일 한정 actions 더보기 시트
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  // null | { blockId, originBlockId, anchorRect }
  const [historyData, setHistoryData] = useState(null)
  // null | { threadId, rows: [...] } | { error }

  useEffect(() => {
    if (!initialLoaded) return
    const root = rootRef.current
    if (!root) return
    const onMore = (e) => setMoreMenu(e.detail || null)
    root.addEventListener('toggle-more-menu', onMore)
    return () => root.removeEventListener('toggle-more-menu', onMore)
  }, [initialLoaded])

  // ESC / 외부 클릭 → 메뉴 닫기
  useEffect(() => {
    if (!moreMenu) return
    const onKey = (e) => { if (e.key === 'Escape') setMoreMenu(null) }
    const onClick = () => setMoreMenu(null)
    document.addEventListener('keydown', onKey)
    // mousedown 으로 닫음 — 메뉴 항목 클릭은 stopPropagation 으로 보호
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [moreMenu])

  const handleDeleteFromMenu = useCallback(async () => {
    const target = moreMenu
    setMoreMenu(null)
    if (!target?.blockId) return
    if (!confirm('이 항목을 삭제할까요?')) return
    try {
      await applyDiff({ insert: [], update: [], softDelete: [{ blockId: target.blockId }] })
      refetch()
    } catch (err) {
      logError('DailyPageV2.handleDeleteFromMenu', err)
      alert('삭제 실패: ' + (err?.message || err))
    }
  }, [moreMenu, applyDiff, refetch])

  // 댓글: rootRef 안의 토글 dom 을 anchor 로 'section-comment-click' dispatch (TipTapTestPage 가 popover)
  const handleCommentFromMenu = useCallback(() => {
    const target = moreMenu
    setMoreMenu(null)
    if (!target?.blockId) return
    const root = rootRef.current
    if (!root) return
    const toggleDom = root.querySelector(`[data-block-id="${target.blockId}"]`)
    if (!toggleDom) return
    toggleDom.dispatchEvent(new CustomEvent('section-comment-click', {
      bubbles: true,
      detail: {
        sectionTitle: target.title || '',
        targetType: target.isTodo ? 'todo' : 'section',
        toggleDom,
        blockId: target.blockId,
        sectionId: null,
        originBlockId: target.originBlockId,
      }
    }))
  }, [moreMenu])

  // 별표: editor 의 setNodeMarkup 으로 isStarred attr 토글
  const handleStarFromMenu = useCallback(() => {
    const target = moreMenu
    setMoreMenu(null)
    if (target?.pos == null) return
    const editor = editorRef.current
    if (!editor) return
    const node = editor.state.doc.nodeAt(target.pos)
    if (!node) return
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(target.pos, null, { ...node.attrs, isStarred: !node.attrs.isStarred })
    )
  }, [moreMenu])

  const handleHistoryFromMenu = useCallback(async () => {
    const target = moreMenu
    setMoreMenu(null)
    if (!target) return
    const threadId = target.originBlockId || target.blockId
    if (!threadId) return
    try {
      // origin = threadId 또는 자기 자신 = threadId 인 row 들 (active만)
      const { data, error } = await supabase
        .from('daily_blocks')
        .select('block_id, page_date, text_content, todo_checked, todo_status, is_carry_over, carry_over_from')
        .or(`origin_block_id.eq.${threadId},block_id.eq.${threadId}`)
        .is('deleted_at', null)
        .order('page_date', { ascending: true })
      if (error) throw error
      setHistoryData({ threadId, rows: data || [] })
    } catch (err) {
      logError('DailyPageV2.handleHistoryFromMenu', err)
      setHistoryData({ threadId, error: err?.message || String(err) })
    }
  }, [moreMenu])

  // 카드뷰: 화살표 클릭 → 인접 카드로 scroll (center snap)
  const scrollToCard = useCallback((delta) => {
    const root = rootRef.current
    if (!root) return
    const pmEl = root.querySelector('.ProseMirror')
    if (!pmEl) return
    const cards = Array.from(pmEl.querySelectorAll(':scope > .toggle-block'))
    if (cards.length === 0) return
    const next = Math.max(0, Math.min(cards.length - 1, currentCardIndex + delta))
    cards[next]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [currentCardIndex])

  if (error) return <div className="daily-page-v2-error">불러오기 실패: {String(error.message || error)}</div>
  // 첫 fetch 완료 전엔 에디터 마운트 안 함 — 빈 doc → 채워진 doc 전환 시 BubbleMenu race 회피
  if (!initialLoaded) return <div className="daily-page-v2-loading">로딩...</div>

  return (
    <div
      ref={rootRef}
      className={`daily-page-v2 daily-page-v2--${viewMode}${isCarousel ? ' daily-page-v2--carousel' : ''}`}
    >
      <div className="daily-page-v2-toolbar">
        <button
          type="button"
          className={`view-mode-btn ${viewMode === 'list' ? 'active' : ''}`}
          onClick={() => setViewMode('list')}
          title="리스트뷰 (위→아래)"
        >
          <LayoutList size={14} />
          <span>리스트</span>
        </button>
        <button
          type="button"
          className={`view-mode-btn ${viewMode === 'column' ? 'active' : ''}`}
          onClick={() => setViewMode('column')}
          title="컬럼뷰 (가로 정렬, Trello 식)"
        >
          <Columns3 size={14} />
          <span>컬럼</span>
        </button>
        <button
          type="button"
          className={`view-mode-btn ${viewMode === 'card' ? 'active' : ''}`}
          onClick={() => setViewMode('card')}
          title="카드뷰 (집중 모드, 한 카드씩 풀폭)"
        >
          <Square size={14} />
          <span>카드</span>
        </button>
      </div>
      <TipTapEditor
        content={stableDoc}
        onUpdate={handleUpdate}
        placeholder={placeholder}
        isMaster={isMaster}
        isDailyPage={true}
        editorRef={editorRef}
      />
      {viewMode === 'card' && cardCount > 0 && (
        <div className="card-nav-row">
          <button
            type="button"
            className="card-nav-btn"
            onClick={() => scrollToCard(-1)}
            disabled={currentCardIndex === 0}
            title="이전 카드 (←)"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="card-nav-indicator">
            {currentCardIndex + 1} / {cardCount}
          </span>
          <button
            type="button"
            className="card-nav-btn"
            onClick={() => scrollToCard(1)}
            disabled={currentCardIndex >= cardCount - 1}
            title="다음 카드 (→)"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
      <div className="worklog-actions-row">
        <button
          type="button"
          className="worklog-add-section-btn"
          onClick={handleAddSection}
        >
          + 섹션 추가
        </button>
        {onCommentsClick && (
          <button
            type="button"
            className="worklog-comments-modal-trigger"
            onClick={onCommentsClick}
          >
            💬 코멘트 ({commentsCount})
          </button>
        )}
        <button
          type="button"
          className="worklog-refresh-btn"
          onClick={handleRefreshCarryOver}
          disabled={refreshing}
          title="직전 페이지의 새 섹션과 미완료 todo 를 가져옵니다"
        >
          {refreshing ? '리프레시 중...' : '↻ 이월 리프레시'}
        </button>
        {/* 모바일 한정 ⋯ 더보기 — 데스크톱에서는 CSS 로 hide. 위 3 버튼은 모바일에서 hide. */}
        <button
          type="button"
          className="worklog-actions-more-btn"
          onClick={() => setShowActionsMenu(prev => !prev)}
          title="더보기"
          aria-label="더보기"
        >
          <MoreHorizontal size={18} />
        </button>
      </div>

      {showActionsMenu && createPortal(
        <div
          className="worklog-actions-mobile-overlay"
          onClick={() => setShowActionsMenu(false)}
        >
          <div className="worklog-actions-mobile-sheet" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => { setShowActionsMenu(false); handleAddSection() }}>
              + 섹션 추가
            </button>
            {onCommentsClick && (
              <button type="button" onClick={() => { setShowActionsMenu(false); onCommentsClick() }}>
                💬 코멘트 ({commentsCount})
              </button>
            )}
            <button type="button" onClick={() => { setShowActionsMenu(false); handleRefreshCarryOver() }} disabled={refreshing}>
              {refreshing ? '리프레시 중...' : '↻ 이월 리프레시'}
            </button>
            <button type="button" className="worklog-actions-mobile-cancel" onClick={() => setShowActionsMenu(false)}>
              취소
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* ⋯ 메뉴 — 자식 토글 클릭 시 dropdown */}
      {moreMenu && createPortal(
        <div
          className="toggle-more-menu"
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: moreMenu.anchorRect.bottom + 4,
            left: Math.max(8, moreMenu.anchorRect.right - 180),
          }}
        >
          <button
            type="button"
            className="toggle-more-menu-item"
            onClick={handleCommentFromMenu}
          >
            <MessageSquare size={14} /> 댓글
          </button>
          <button
            type="button"
            className="toggle-more-menu-item"
            onClick={handleStarFromMenu}
          >
            <Star size={14} /> {moreMenu.isStarred ? '중요 해제' : '중요 표시'}
          </button>
          <button
            type="button"
            className="toggle-more-menu-item"
            onClick={handleHistoryFromMenu}
          >
            <History size={14} /> 이월 히스토리
          </button>
          <button
            type="button"
            className="toggle-more-menu-item toggle-more-menu-item--danger"
            onClick={handleDeleteFromMenu}
          >
            <Trash2 size={14} /> 삭제
          </button>
        </div>,
        document.body
      )}

      {/* 이월 히스토리 모달 */}
      {historyData && createPortal(
        <div
          className="worklog-comments-modal-overlay"
          onClick={() => setHistoryData(null)}
        >
          <div className="worklog-comments-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="worklog-comments-modal-close"
              onClick={() => setHistoryData(null)}
              title="닫기"
            >
              ✕
            </button>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600 }}>이월 히스토리</h3>
            {historyData.error ? (
              <div style={{ color: '#ff6b6b', fontSize: 13 }}>오류: {historyData.error}</div>
            ) : historyData.rows?.length === 0 ? (
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>이월 기록이 없습니다.</div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {historyData.rows.map(r => (
                  <li
                    key={r.block_id}
                    style={{
                      padding: '8px 10px',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 6,
                      fontSize: 13,
                      display: 'flex',
                      gap: 10,
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ minWidth: 100, color: 'rgba(255,255,255,0.5)', fontVariantNumeric: 'tabular-nums' }}>
                      {r.page_date}
                    </span>
                    {r.todo_checked != null && (
                      <span style={{
                        fontSize: 11,
                        padding: '1px 6px',
                        borderRadius: 3,
                        background: r.todo_checked ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                        color: r.todo_checked ? '#86efac' : 'rgba(255,255,255,0.4)',
                      }}>
                        {r.todo_checked ? '완료' : '진행'}
                      </span>
                    )}
                    <span style={{ flex: 1, color: 'rgba(255,255,255,0.85)' }}>
                      {r.text_content || '(내용 없음)'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
