import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { generateUUID } from '../utils/uuid'
import { logError } from '../utils/supabaseError'

/**
 * 페이지 양식(템플릿) 관리 훅
 */
export const useTemplates = (session) => {
  const userId = session?.user?.id
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const fetchCountRef = useRef(0)

  // 템플릿 목록 불러오기
  const fetchTemplates = useCallback(async () => {
    if (!userId) return

    const myFetchId = ++fetchCountRef.current
    setLoading(true)

    const { data, error } = await supabase
      .from('page_templates')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    if (myFetchId !== fetchCountRef.current) return
    if (logError('템플릿 로드', error)) { setLoading(false); return }

    setTemplates(data || [])
    setLoading(false)
  }, [userId])

  useEffect(() => {
    if (userId) fetchTemplates()
    else { setTemplates([]); setLoading(false) }
  }, [userId, fetchTemplates])

  // 템플릿 생성
  const createTemplate = useCallback(async (name, sections = []) => {
    if (!userId) return null

    const id = generateUUID()
    const sectionDefs = sections.length > 0
      ? sections
      : [{ id: generateUUID(), title: '섹션 1', order: 0 }]

    const newTemplate = {
      id,
      user_id: userId,
      name,
      sections: sectionDefs,
      version: 1,
    }

    setTemplates(prev => [newTemplate, ...prev])

    const { data, error } = await supabase
      .from('page_templates')
      .insert([newTemplate])
      .select()
      .single()

    if (logError('템플릿 생성', error)) {
      setTemplates(prev => prev.filter(t => t.id !== id))
      return null
    }

    // 버전 1 기록
    await supabase
      .from('page_template_versions')
      .insert([{ template_id: id, version: 1, sections: sectionDefs }])

    if (data) {
      setTemplates(prev => prev.map(t => t.id === id ? data : t))
    }
    return data || newTemplate
  }, [userId])

  // 템플릿 삭제
  const deleteTemplate = useCallback(async (templateId) => {
    if (!userId) return

    const removed = templates.find(t => t.id === templateId)
    setTemplates(prev => prev.filter(t => t.id !== templateId))

    const { error } = await supabase
      .from('page_templates')
      .delete()
      .eq('id', templateId)
      .eq('user_id', userId)

    if (logError('템플릿 삭제', error) && removed) {
      setTemplates(prev => [...prev, removed])
    }
  }, [userId, templates])

  // 템플릿 이름 변경
  const renameTemplate = useCallback(async (templateId, newName) => {
    if (!userId || !newName.trim()) return

    setTemplates(prev => prev.map(t =>
      t.id === templateId ? { ...t, name: newName.trim() } : t
    ))

    const { error } = await supabase
      .from('page_templates')
      .update({ name: newName.trim() })
      .eq('id', templateId)
      .eq('user_id', userId)

    if (logError('템플릿 이름 변경', error)) {
      fetchTemplates()
    }
  }, [userId, fetchTemplates])

  // ─── 양식 편집 저장 옵션 3가지 ───

  /**
   * 전체 적용하기: 템플릿 원본 수정 + 모든 연결 페이지 업데이트
   */
  const applyToAll = useCallback(async (templateId, newSections) => {
    if (!userId) return false

    // 현재 템플릿 가져오기
    const template = templates.find(t => t.id === templateId)
    if (!template) return false

    const newVersion = template.version + 1

    // 1. 템플릿 업데이트
    const { error: tplErr } = await supabase
      .from('page_templates')
      .update({ sections: newSections, version: newVersion })
      .eq('id', templateId)
      .eq('user_id', userId)

    if (logError('전체 적용 — 템플릿 업데이트', tplErr)) return false

    // 2. 버전 기록
    await supabase
      .from('page_template_versions')
      .insert([{ template_id: templateId, version: newVersion, sections: newSections }])

    // 3. 연결된 모든 페이지(fork 제외)의 template_version 업데이트
    const { error: pagesErr } = await supabase
      .from('pages')
      .update({ template_version: newVersion })
      .eq('template_id', templateId)
      .eq('template_forked', false)

    if (logError('전체 적용 — 페이지 업데이트', pagesErr)) return false

    setTemplates(prev => prev.map(t =>
      t.id === templateId ? { ...t, sections: newSections, version: newVersion } : t
    ))
    return true
  }, [userId, templates])

  /**
   * 이 페이지에만 적용: 페이지를 템플릿에서 분리(fork)
   */
  const applyToThisOnly = useCallback(async (pageId, newSections, currentSectionsContent = {}) => {
    if (!userId) return false

    // 분리된 구조를 sections_content에 _sections 키로 저장
    const forkedContent = {
      ...currentSectionsContent,
      _sections: newSections,
    }

    const { error } = await supabase
      .from('pages')
      .update({
        template_forked: true,
        sections_content: forkedContent,
      })
      .eq('id', pageId)

    if (logError('이 페이지에만 적용', error)) return false
    return true
  }, [userId])

  /**
   * 이후부터 계속 적용: 템플릿 업데이트 + 현재 페이지만 새 버전, 기존 페이지는 이전 버전 유지
   */
  const applyFromNowOn = useCallback(async (templateId, pageId, newSections) => {
    if (!userId) return false

    const template = templates.find(t => t.id === templateId)
    if (!template) return false

    const newVersion = template.version + 1

    // 1. 템플릿 업데이트
    const { error: tplErr } = await supabase
      .from('page_templates')
      .update({ sections: newSections, version: newVersion })
      .eq('id', templateId)
      .eq('user_id', userId)

    if (logError('이후 적용 — 템플릿 업데이트', tplErr)) return false

    // 2. 버전 기록
    await supabase
      .from('page_template_versions')
      .insert([{ template_id: templateId, version: newVersion, sections: newSections }])

    // 3. 현재 페이지만 새 버전으로 업데이트
    const { error: pageErr } = await supabase
      .from('pages')
      .update({ template_version: newVersion })
      .eq('id', pageId)

    if (logError('이후 적용 — 페이지 업데이트', pageErr)) return false

    setTemplates(prev => prev.map(t =>
      t.id === templateId ? { ...t, sections: newSections, version: newVersion } : t
    ))
    return true
  }, [userId, templates])

  /**
   * 페이지에 양식 적용
   */
  const applyTemplateToPage = useCallback(async (pageId, templateId) => {
    if (!userId) return false

    const template = templates.find(t => t.id === templateId)
    if (!template) return false

    // 기존 내용을 히스토리에 백업
    const { data: pageData } = await supabase
      .from('pages')
      .select('content_tiptap')
      .eq('id', pageId)
      .single()

    if (pageData?.content_tiptap) {
      await supabase
        .from('block_history')
        .insert([{
          block_id: null,
          user_id: userId,
          page_id: pageId,
          content_before: null,
          content_after: pageData.content_tiptap,
          action: 'tiptap_snapshot',
          description: '양식 적용 전 자동 백업',
        }])
    }

    // 섹션별 빈 콘텐츠 초기화
    const emptySections = {}
    template.sections.forEach(s => {
      emptySections[s.id] = { type: 'doc', content: [{ type: 'paragraph', content: [] }] }
    })

    const { error } = await supabase
      .from('pages')
      .update({
        template_id: templateId,
        template_version: template.version,
        sections_content: emptySections,
        template_forked: false,
      })
      .eq('id', pageId)

    if (logError('양식 적용', error)) return false
    return true
  }, [userId, templates])

  /**
   * 페이지에서 양식 해제
   */
  const removeTemplateFromPage = useCallback(async (pageId, mergedContent = null) => {
    if (!userId) return false

    const updates = {
      template_id: null,
      template_version: null,
      sections_content: null,
      template_forked: false,
    }

    // 섹션 내용을 단일 에디터로 병합한 경우
    if (mergedContent) {
      updates.content_tiptap = mergedContent
    }

    const { error } = await supabase
      .from('pages')
      .update(updates)
      .eq('id', pageId)

    if (logError('양식 해제', error)) return false
    return true
  }, [userId])

  /**
   * 특정 버전의 섹션 구조 가져오기
   */
  const getTemplateSections = useCallback(async (templateId, version) => {
    // 최신 버전이면 templates 상태에서 가져옴
    const template = templates.find(t => t.id === templateId)
    if (template && template.version === version) {
      return template.sections
    }

    // 이전 버전이면 versions 테이블에서 조회
    const { data, error } = await supabase
      .from('page_template_versions')
      .select('sections')
      .eq('template_id', templateId)
      .eq('version', version)
      .single()

    if (logError('템플릿 버전 조회', error)) return null
    return data?.sections || null
  }, [templates])

  return {
    templates,
    loading,
    fetchTemplates,
    createTemplate,
    deleteTemplate,
    renameTemplate,
    applyToAll,
    applyToThisOnly,
    applyFromNowOn,
    applyTemplateToPage,
    removeTemplateFromPage,
    getTemplateSections,
  }
}
