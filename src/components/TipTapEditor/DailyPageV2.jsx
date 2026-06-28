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
import { LayoutList, Columns2, Columns3, Square, ChevronLeft, ChevronRight, History, Trash2, Star, MessageSquare, MoreHorizontal, Move, Tag } from 'lucide-react'
import DailyColumnPane from './DailyColumnPane'
import { useDailyBlocks } from '../../hooks/useDailyBlocks'
import { ensureDailyPage } from '../../utils/ensureDailyPage'
import { newBlockId } from '../../utils/blockIdV2'
import { supabase } from '../../supabaseClient'
import { logError } from '../../utils/supabaseError'

// 블록을 좌(col=1)/우(col=2) 두 부분집합으로 분리 — 각 섹션의 col 에 따라 그 섹션 + 자식 블록을 묶음.
//   섹션 row 는 sectionId === 자기 blockId(self-ref), 자식 row 는 sectionId === 조상 섹션 blockId.
function splitBlocksByColumn(blocks, colMap) {
  const sectionCol = new Map() // section blockId → 1|2
  for (const b of blocks) {
    if (b.blockType === 'section') {
      const key = b.sectionMasterId || b.blockId
      sectionCol.set(b.blockId, colMap[key] === 2 ? 2 : 1)
    }
  }
  const left = [], right = []
  for (const b of blocks) {
    const col = sectionCol.get(b.sectionId) || 1
    if (col === 2) right.push(b)
    else left.push(b)
  }
  return { left, right }
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
  editorRef: externalEditorRef,  // 부모(TipTapTestPage)와 editor 공유 — 마키 드래그 선택 핸들러가 부모에서 editorRef.current 를 참조한다
  getEditorsRef,                 // 부모의 토글 제어(전체 닫기 등)가 양쪽 pane 에디터에 적용되도록, 여기에 getter 를 등록
}) {
  const userId = session?.user?.id
  const ctx = useMemo(() => ({ pageId, pageDate, userId }), [pageId, pageDate, userId])

  const { blocks, loading, error, applyDiff, refetch, initialLoaded } = useDailyBlocks(pageId)

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

  // 리스트뷰 단 수 (1 | 2) — list 뷰 한정. localStorage 에 사용자별 저장.
  const [listCols, setListColsState] = useState(() => {
    if (typeof window === 'undefined') return 1
    return Number(localStorage.getItem('thinkmap.dailyListCols')) === 2 ? 2 : 1
  })
  const setListCols = useCallback((n) => {
    const v = n === 2 ? 2 : 1
    setListColsState(v)
    try { localStorage.setItem('thinkmap.dailyListCols', String(v)) } catch {}
  }, [])

  // 이월 태그 보기/끄기 — 기본 끄기(false). localStorage 에 사용자별 저장.
  const [showCarryTags, setShowCarryTagsState] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('thinkmap.dailyShowCarryTags') === '1'
  })
  const toggleCarryTags = useCallback(() => {
    setShowCarryTagsState(prev => {
      const next = !prev
      try { localStorage.setItem('thinkmap.dailyShowCarryTags', next ? '1' : '0') } catch {}
      return next
    })
  }, [])

  const is2col = viewMode === 'list' && listCols === 2

  // 섹션 좌/우 배치 맵 (sectionMasterId → 1|2). 출처: worklog_board_user_settings.section_cols.
  // board 단위라 날짜를 넘어 유지. 기본 1(좌). ref 는 setSectionColumn 의 즉시 read 용.
  const [colMap, setColMap] = useState({})
  const colMapRef = useRef(colMap)
  useEffect(() => { colMapRef.current = colMap }, [colMap])

  // 2단 좌/우 분할 — colMap 으로 블록을 좌(col=1)/우(col=2) 부분집합으로 나눠 각 패널에 공급.
  const { left: leftBlocks, right: rightBlocks } = useMemo(
    () => splitBlocksByColumn(blocks, colMap),
    [blocks, colMap]
  )

  // 섹션 이동 모드 — ON 이면 섹션 조작 버튼 항상 노출 + 강조 (애플 정렬 모드식).
  const [moveMode, setMoveMode] = useState(false)

  // 현재 페이지의 모든 최상위 섹션 key (sectionMasterId ?? blockId) — 일괄 좌/우 배정용
  const sectionKeys = useMemo(
    () => blocks
      .filter(b => b.blockType === 'section')
      .map(b => b.sectionMasterId || b.blockId)
      .filter(Boolean),
    [blocks]
  )

  const rootRef = useRef(null)
  const internalEditorRef = useRef(null)
  const editorRef = externalEditorRef || internalEditorRef
  const rightEditorRef = useRef(null)  // 2단 우패널 에디터 (좌패널은 editorRef)

  // 부모(토글 제어 드롭다운)가 양쪽 pane 에디터에 명령할 수 있도록 getter 등록.
  // 2단이면 [좌, 우] 두 에디터, 그 외엔 [단일]. 클릭 시점에 실행되므로 ref.current 는 채워져 있다.
  useEffect(() => {
    if (!getEditorsRef) return
    getEditorsRef.current = () => {
      const list = is2col ? [editorRef.current, rightEditorRef.current] : [editorRef.current]
      return list.filter(Boolean)
    }
    return () => { if (getEditorsRef) getEditorsRef.current = null }
  }, [getEditorsRef, is2col, editorRef])

  // 마운트 시 lazy 이월 — 직전 daily 의 신규 미완료 todo 를 추가.
  // Phase 2: 클라 직접 carryOverLazy(호출자 RLS 권한) 대신 ensureDailyPage 로 일원화.
  //   플래그 ON 이면 Edge(service_role)가 master 콘텐츠까지 이월(비마스터 누락 해소),
  //   OFF/Edge 실패 시 로컬 createDailyPageV2(기존 페이지 분기 = lazy 이월) 폴백으로 무중단.
  //   prevPageId 는 "직전 페이지 존재" 신호로만 사용(실제 직전 검색은 서버가 수행).
  const lazyDoneRef = useRef(false)
  useEffect(() => {
    if (!pageId || !userId || !pageDate) return
    if (!prevPageId) return
    if (lazyDoneRef.current) return
    lazyDoneRef.current = true
    ensureDailyPage({ supabase, parentId, dateKey: pageDate, userId })
      .then(result => {
        if (result?.inserted > 0) refetch()
      })
      .catch(err => logError('DailyPageV2.ensureDailyPage(lazy)', err))
  }, [pageId, userId, pageDate, prevPageId, parentId, refetch])

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
    const onVisibilityToggle = async (e) => {
      const { masterId, newVisibility } = e.detail || {}
      if (!masterId || !newVisibility) return
      // 1) worklog_sections 마스터 동기화 — 다음 daily / 리프레시 templating 에 반영
      {
        const { error } = await supabase
          .from('worklog_sections')
          .update({ visibility: newVisibility })
          .eq('id', masterId)
        if (error) logError('worklog_sections.visibility 동기화', error)
      }
      // 2) 이미 만들어진 모든 페이지의 그 master 의 section row 동기화
      const { data: secRows, error: secErr } = await supabase
        .from('daily_blocks')
        .update({ visibility: newVisibility })
        .eq('section_master_id', masterId)
        .eq('block_type', 'section')
        .is('deleted_at', null)
        .select('block_id')
      if (secErr) { logError('daily_blocks.visibility(section) 동기화', secErr); return }
      // 3) 그 섹션들의 자식 콘텐츠까지 cascade — 섹션=공유 단위라 자식 visibility 가 섹션과
      //    항상 일치해야 RLS 누수(공개 섹션에 master 자식 숨김) / 고아 토글(master 섹션에 공개 자식)이 없다.
      const sectionBlockIds = (secRows || []).map(r => r.block_id).filter(Boolean)
      if (sectionBlockIds.length > 0) {
        const { error: childErr } = await supabase
          .from('daily_blocks')
          .update({ visibility: newVisibility })
          .in('section_id', sectionBlockIds)
          .neq('block_type', 'section')
          .is('deleted_at', null)
        if (childErr) logError('daily_blocks.visibility(children) cascade', childErr)
      }
    }
    document.addEventListener('section-visibility-toggle', onVisibilityToggle)
    return () => document.removeEventListener('section-visibility-toggle', onVisibilityToggle)
  }, [])

  // [5] 섹션 표시상태(배경색·접힘) write-through → worklog_sections 마스터.
  //   색/접힘은 섹션 "정체성"이라 마스터에 저장해야 다음 날 데일리(templating)가 그대로 승계한다.
  //   (전엔 그날치 daily_blocks 에만 저장돼 이월 시 색 null·전부 펼침으로 "섹션 카드 풀림" 발생)
  useEffect(() => {
    const onPresentationChange = (e) => {
      const { masterId, backgroundColor, isOpen } = e.detail || {}
      if (!masterId) return
      const patch = {}
      if (backgroundColor !== undefined) patch.background_color = backgroundColor
      if (isOpen !== undefined) patch.is_open = isOpen
      if (Object.keys(patch).length === 0) return
      supabase
        .from('worklog_sections')
        .update(patch)
        .eq('id', masterId)
        .then(({ error }) => { if (error) logError('worklog_sections 표시상태(색/접힘) 동기화', error) })
    }
    document.addEventListener('section-presentation-change', onPresentationChange)
    return () => document.removeEventListener('section-presentation-change', onPresentationChange)
  }, [])

  // section_cols 조회 (user+board 단위) — 2단 좌/우 배치 출처
  useEffect(() => {
    if (!userId || !parentId) return
    let cancelled = false
    ;(async () => {
      const { data, error: scErr } = await supabase
        .from('worklog_board_user_settings')
        .select('section_cols')
        .eq('user_id', userId)
        .eq('board_id', parentId)
        .maybeSingle()
      if (cancelled) return
      if (scErr) { logError('DailyPageV2.fetchSectionCols', scErr); return }
      if (data?.section_cols && typeof data.section_cols === 'object') setColMap(data.section_cols)
    })()
    return () => { cancelled = true }
  }, [userId, parentId])

  // colMap 저장 (section_order 와 동일 패턴). col 은 daily_blocks 에 안 들어가므로
  // sourceDoc 재빌드(colMap dep)로만 반영됨.
  const persistColMap = useCallback((next) => {
    setColMap(next)
    if (!userId || !parentId) return
    supabase
      .from('worklog_board_user_settings')
      .upsert({ user_id: userId, board_id: parentId, section_cols: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id,board_id' })
      .then(({ error }) => { if (error) logError('worklog_board_user_settings.section_cols 동기화', error) })
  }, [userId, parentId])

  // 단일 섹션 좌/우 단 변경
  const setSectionColumn = useCallback((masterKey, newCol) => {
    if (!masterKey) return
    const next = { ...colMapRef.current, [masterKey]: newCol === 2 ? 2 : 1 }
    persistColMap(next)
  }, [persistColMap])

  // 일괄: 모든 섹션을 한쪽 단으로
  const setAllSectionColumns = useCallback((col) => {
    const v = col === 2 ? 2 : 1
    const next = {}
    for (const k of sectionKeys) next[k] = v
    persistColMap(next)
  }, [sectionKeys, persistColMap])

  // 섹션 헤더의 좌/우 이동 버튼·드래그(ToggleExtension) 가 dispatch 하는 이벤트 수신
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onColChange = (e) => {
      const { sectionMasterId, blockId, col } = e.detail || {}
      setSectionColumn(sectionMasterId || blockId, col)
    }
    root.addEventListener('section-col-change', onColChange)
    return () => root.removeEventListener('section-col-change', onColChange)
  }, [setSectionColumn, initialLoaded])

  // section_order 전역 동기화 — 좌(col=1)→우(col=2) 그룹, 각 그룹은 position 순.
  //   1단/컬럼/카드: 좌 그룹 = 전체(우 비어있음) → 기존과 동일한 전체 순서.
  //   2단: 좌 그룹 + 우 그룹 이어붙임 → 다음 daily templating 에 반영.
  //   blocks 기반(DB position)이라 패널 저장 직후 refetch/realtime 으로 반영됨.
  const lastOrderRef = useRef(null)
  useEffect(() => {
    if (!initialLoaded || !userId || !parentId) return
    const masters = (subset) => subset
      .filter(b => b.blockType === 'section' && b.sectionMasterId)
      .slice()
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .map(b => b.sectionMasterId)
    const next = [...masters(leftBlocks), ...masters(rightBlocks)]
    if (next.length === 0) return
    const prev = lastOrderRef.current
    lastOrderRef.current = next
    if (prev === null) return  // 첫 계산은 seed 만 (로드 시 불필요한 write 방지)
    if (prev.length === next.length && prev.every((v, i) => v === next[i])) return
    supabase
      .from('worklog_board_user_settings')
      .upsert({ user_id: userId, board_id: parentId, section_order: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id,board_id' })
      .then(({ error }) => { if (error) logError('worklog_board_user_settings.section_order(global)', error) })
  }, [leftBlocks, rightBlocks, initialLoaded, userId, parentId])

  // (에디터 변경→저장 파이프라인은 DailyColumnPane 으로 이전됨)

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
        .eq('scope', 'board')
        .eq('board_id', parentId)
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
            visibility: s.visibility || 'master',
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
            // P1: 빈 자식은 부모 섹션의 visibility 를 상속한다('all' 하드코딩 금지).
            // master 섹션 아래 'all' 자식은 비마스터 화면에서 헤더 없는 고아가 된다.
            isPinned: false, visibility: s.visibility || 'master', isFixedSection: false,
          })
        })
        await applyDiff({ insert: newRows, update: [], softDelete: [] })
      }

      // 3. 직전 daily 페이지의 신규 미완료 todo 이월 — ensureDailyPage 로 일원화(Phase 2).
      //    "리프레시 카로버" = 동일 서버 연산 재호출하는 얇은 트리거. Edge(service_role) 경로면
      //    master 콘텐츠까지 이월, 폴백 시 로컬 lazy 이월. 직전 페이지 검색은 서버가 수행.
      await ensureDailyPage({ supabase, parentId, dateKey: pageDate, userId })

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
      if (!parentId) throw new Error('handleAddSection: parentId (boardId) 필수')
      const masterId = newBlockId()
      const { error: msErr } = await supabase
        .from('worklog_sections')
        .insert({
          id: masterId,
          title: title.trim(),
          scope: 'board',
          board_id: parentId,
          section_type: 'user',
          created_by: userId,
          // [A] 새 섹션은 기본 비공개(마스터 전용). 공유는 헤더 크라운 토글로 명시.
          visibility: 'master',
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
        visibility: 'master',
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
        visibility: 'master',
        isFixedSection: false,
      }
      await applyDiff({ insert: [sectionRow, emptyChildRow], update: [], softDelete: [] })
    } catch (err) {
      logError('DailyPageV2.handleAddSection', err)
      alert('섹션 추가 실패: ' + (err?.message || err))
    }
  }, [userId, pageId, pageDate, blocks, applyDiff, parentId])

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
    // 2단 분할: 이벤트를 보낸 패널 에디터를 사용 (editorRef 는 좌패널만 가리킴)
    const editor = target.editor || editorRef.current
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

  // 액션 행(섹션 추가/코멘트/리프레시). 2단에선 왼쪽 칸 스크롤 내부 맨 아래에,
  // 그 외(1단/컬럼/카드)에선 페이지 맨 아래에 렌더한다.
  const actionsRow = (
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
  )

  return (
    <div
      ref={rootRef}
      className={`daily-page-v2 daily-page-v2--${viewMode}${isCarousel ? ' daily-page-v2--carousel' : ''}${is2col ? ' daily-page-v2--list-2col' : ''}${moveMode ? ' daily-page-v2--move-mode' : ''}${showCarryTags ? '' : ' daily-hide-carry-tags'}`}
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
        {/* 이월 태그 보기/끄기 — 기본 끄기. 모든 뷰에서 표시 */}
        <button
          type="button"
          className={`view-mode-btn ${showCarryTags ? 'active' : ''}`}
          onClick={toggleCarryTags}
          title={showCarryTags ? '이월 태그 숨기기' : '이월 태그 보기'}
        >
          <Tag size={14} />
          <span>이월</span>
        </button>
        {/* list 뷰 한정: 1단/2단 토글 (2단 = 좌우 CSS 멀티컬럼) */}
        {viewMode === 'list' && (
          <div className="list-cols-toggle">
            <button
              type="button"
              className={`view-mode-btn ${listCols === 1 ? 'active' : ''}`}
              onClick={() => setListCols(1)}
              title="1단 (한 줄로)"
            >
              <LayoutList size={14} />
              <span>1단</span>
            </button>
            <button
              type="button"
              className={`view-mode-btn ${listCols === 2 ? 'active' : ''}`}
              onClick={() => setListCols(2)}
              title="2단 (좌우 분할)"
            >
              <Columns2 size={14} />
              <span>2단</span>
            </button>
          </div>
        )}
        {/* 섹션 이동 모드 — 켜면 섹션 정리 버튼이 항상 노출(모바일 대비). 세부: 모두 왼쪽/오른쪽 */}
        {viewMode === 'list' && (
          <div className="list-move-mode">
            <button
              type="button"
              className={`view-mode-btn ${moveMode ? 'active' : ''}`}
              onClick={() => setMoveMode(m => !m)}
              title="섹션 이동 모드 — 켜면 섹션 정리 버튼이 항상 보입니다"
            >
              <Move size={14} />
              <span>섹션 이동{moveMode ? ' 켜짐' : ''}</span>
            </button>
            {moveMode && listCols === 2 && (
              <>
                <button
                  type="button"
                  className="view-mode-btn"
                  onClick={() => setAllSectionColumns(1)}
                  title="모든 섹션을 왼쪽 단으로"
                >
                  <ChevronLeft size={14} />
                  <span>모두 왼쪽</span>
                </button>
                <button
                  type="button"
                  className="view-mode-btn"
                  onClick={() => setAllSectionColumns(2)}
                  title="모든 섹션을 오른쪽 단으로"
                >
                  <span>모두 오른쪽</span>
                  <ChevronRight size={14} />
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {is2col ? (
        <div className="daily-two-pane">
          <DailyColumnPane
            blocks={leftBlocks}
            applyDiff={applyDiff} ctx={ctx} refetch={refetch} initialLoaded={initialLoaded}
            isMaster={isMaster} placeholder={placeholder}
            userId={userId} parentId={parentId} pageId={pageId} pageDate={pageDate}
            editorRef={editorRef}
            scrollable manageSectionOrder={false}
            emptyHint="이 칸이 비었습니다"
            footer={actionsRow}
          />
          <DailyColumnPane
            blocks={rightBlocks}
            applyDiff={applyDiff} ctx={ctx} refetch={refetch} initialLoaded={initialLoaded}
            isMaster={isMaster} placeholder={placeholder}
            userId={userId} parentId={parentId} pageId={pageId} pageDate={pageDate}
            editorRef={rightEditorRef}
            scrollable manageSectionOrder={false}
            emptyHint="오른쪽 단 — '섹션 이동'으로 여기에 보내세요"
          />
        </div>
      ) : (
        <DailyColumnPane
          blocks={blocks}
          applyDiff={applyDiff} ctx={ctx} refetch={refetch} initialLoaded={initialLoaded}
          isMaster={isMaster} placeholder={placeholder}
          userId={userId} parentId={parentId} pageId={pageId} pageDate={pageDate}
          editorRef={editorRef}
          manageSectionOrder={false}
        />
      )}
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
      {/* 2단에선 위 왼쪽 칸 footer 로 옮겨 렌더하므로 페이지 하단엔 1단 등에서만 표시 */}
      {!is2col && actionsRow}

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
