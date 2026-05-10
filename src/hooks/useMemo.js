import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'

export const useQuickMemo = (session) => {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const saveTimerRef = useRef(null)
  const userId = session?.user?.id

  // 메모 로드
  useEffect(() => {
    if (!userId) {
      setContent('')
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('user_memos')
          .select('*')
          .eq('user_id', userId)
          .single()

        if (cancelled) return

        if (error && error.code !== 'PGRST116') {
          console.error('메모 로드 오류:', error.message)
          return
        }

        if (data) {
          setContent(data.content || '')
        } else {
          // 메모가 없으면 빈 메모 생성
          const { data: created } = await supabase
            .from('user_memos')
            .insert([{ user_id: userId, content: '' }])
            .select()
            .single()
          if (!cancelled && created) setContent(created.content || '')
        }
      } catch (e) {
        if (!cancelled) console.error('메모 로드 오류:', e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [userId])

  // 서버에 저장 (디바운스 없이 직접 호출용)
  const saveToServer = useCallback(async (text) => {
    if (!userId) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('user_memos')
        .upsert(
          { user_id: userId, content: text, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )
      if (error) console.error('메모 저장 오류:', error.message)
    } finally {
      setSaving(false)
    }
  }, [userId])

  // 디바운스 저장 (타이핑 중 자동 저장)
  const updateContent = useCallback((text) => {
    setContent(text)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveToServer(text), 800)
  }, [saveToServer])

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  // Realtime 동기화 — 다른 탭/기기 변경 자동 반영. 본인이 typing 중이면 skip (덮어쓰기 방지).
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`user_memos:${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_memos',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const next = payload.new?.content
        if (next == null) return
        // 본인이 typing 중 (저장 디바운스 active) 이면 skip — 자기 입력 덮어쓰기 방지
        if (saveTimerRef.current) return
        setContent(prev => (prev === next ? prev : next))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  return { content, updateContent, loading, saving }
}
