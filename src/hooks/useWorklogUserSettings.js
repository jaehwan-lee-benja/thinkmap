import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

/**
 * 업무일지 계정별 설정 훅
 * - section_order: 섹션 표시 순서 (worklog_sections.id 배열)
 */
export const useWorklogUserSettings = (session) => {
  const [sectionOrder, setSectionOrder] = useState(null) // null = 로딩 중 또는 미설정
  const [loading, setLoading] = useState(true)

  // 설정 조회
  useEffect(() => {
    if (!session?.user?.id) { setLoading(false); return }

    const fetch = async () => {
      const { data } = await supabase
        .from('worklog_user_settings')
        .select('section_order')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (data?.section_order?.length > 0) {
        setSectionOrder(data.section_order)
      }
      setLoading(false)
    }

    fetch()
  }, [session?.user?.id])

  // 섹션 순서 저장 (upsert)
  const updateSectionOrder = useCallback(async (newOrder) => {
    if (!session?.user?.id) return

    setSectionOrder(newOrder)

    await supabase
      .from('worklog_user_settings')
      .upsert({
        user_id: session.user.id,
        section_order: newOrder,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
  }, [session?.user?.id])

  return { sectionOrder, loading, updateSectionOrder }
}
