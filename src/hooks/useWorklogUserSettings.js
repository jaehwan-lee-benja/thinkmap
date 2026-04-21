import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

/**
 * 업무일지 계정별 설정 훅
 * - section_order: 섹션 표시 순서 (worklog_sections.id 배열)
 * - quicktodo_pinned: Quick Todo 고정 섹션 { id, name }
 */
export const useWorklogUserSettings = (session) => {
  const [sectionOrder, setSectionOrder] = useState(null)
  const [quicktodoPinned, setQuicktodoPinned] = useState(null) // { id, name }
  const [loading, setLoading] = useState(true)

  // 설정 조회
  useEffect(() => {
    if (!session?.user?.id) { setLoading(false); return }

    const fetch = async () => {
      const { data } = await supabase
        .from('worklog_user_settings')
        .select('section_order, quicktodo_pinned')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (data?.section_order?.length > 0) setSectionOrder(data.section_order)
      if (data?.quicktodo_pinned) setQuicktodoPinned(data.quicktodo_pinned)
      setLoading(false)
    }

    fetch()
  }, [session?.user?.id])

  const upsertField = useCallback(async (fields) => {
    if (!session?.user?.id) return
    await supabase
      .from('worklog_user_settings')
      .upsert({
        user_id: session.user.id,
        ...fields,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
  }, [session?.user?.id])

  const updateSectionOrder = useCallback(async (newOrder) => {
    setSectionOrder(newOrder)
    await upsertField({ section_order: newOrder })
  }, [upsertField])

  const updateQuicktodoPinned = useCallback(async (pinned) => {
    setQuicktodoPinned(pinned)
    await upsertField({ quicktodo_pinned: pinned })
  }, [upsertField])

  return { sectionOrder, quicktodoPinned, loading, updateSectionOrder, updateQuicktodoPinned }
}
