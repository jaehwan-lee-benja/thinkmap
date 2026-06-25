import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { SEED_PRODUCTS } from '../components/Inventory/inventoryProducts'
import { num } from '../components/Inventory/inventoryCalc'

// '' / null / undefined → null, 그 외 숫자. (DB 저장용)
function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : null
}

/**
 * 제품 마스터 로드.
 * inventory_products 테이블이 아직 없거나(미적용) 비어 있으면 시드(SEED_PRODUCTS)로 폴백 →
 * previewMode=true (화면 미리보기, 저장 불가).
 */
export function useInventoryProducts() {
  const [products, setProducts] = useState([])
  const [previewMode, setPreviewMode] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('inventory_products')
        .select('*')
        .is('archived_at', null)
        .order('sort_order', { ascending: true })
      if (!alive) return
      if (error || !data || data.length === 0) {
        setProducts(SEED_PRODUCTS.map((p, i) => ({ id: `seed-${i}`, ...p })))
        setPreviewMode(true)
      } else {
        setProducts(data)
        setPreviewMode(false)
      }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  return { products, previewMode, loading }
}

/**
 * 특정 일자의 입력값(entries) + par 기준(dayBasis) + 직전 영업일 종료합계(자동이월용 prevEnd).
 * previewMode면 DB를 건드리지 않고 로컬 상태로만 동작(저장 비활성).
 */
export function useInventoryDay(businessDate, { previewMode }) {
  const [entries, setEntries] = useState({})     // { [product_id]: { start_total, start_manual, adjustment, note, end_a, end_b, received } }
  const [dayBasis, setDayBasis] = useState(null) // 'weekday' | 'weekend' | null(자동)
  const [prevEnd, setPrevEnd] = useState({})     // { [product_id]: 직전 영업일 종료합계 }
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      setDirty(false)
      if (previewMode) {
        if (alive) { setEntries({}); setDayBasis(null); setPrevEnd({}); setLoading(false) }
        return
      }
      // 당일 입력값
      const { data: rows } = await supabase
        .from('inventory_entries')
        .select('*')
        .eq('business_date', businessDate)
      const map = {}
      ;(rows || []).forEach(r => { map[r.product_id] = r })

      // 날짜별 par 기준
      const { data: day } = await supabase
        .from('inventory_days')
        .select('par_basis')
        .eq('business_date', businessDate)
        .maybeSingle()

      // 직전 영업일 종료합계(제품별 가장 최근값) — 자동이월 기준
      const { data: prev } = await supabase
        .from('inventory_entries')
        .select('product_id, end_a, end_b, business_date')
        .lt('business_date', businessDate)
        .order('business_date', { ascending: false })
      const pe = {}
      ;(prev || []).forEach(r => {
        if (pe[r.product_id] === undefined) pe[r.product_id] = num(r.end_a) + num(r.end_b)
      })

      if (!alive) return
      setEntries(map)
      setDayBasis(day?.par_basis ?? null)
      setPrevEnd(pe)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [businessDate, previewMode])

  // 단일 필드 변경
  const setField = useCallback((productId, field, value) => {
    setEntries(prev => ({ ...prev, [productId]: { ...prev[productId], [field]: value } }))
    setDirty(true)
  }, [])

  // 여러 필드 동시 변경(시작합계 입력 시 start_manual 동기 등)
  const setFields = useCallback((productId, patch) => {
    setEntries(prev => ({ ...prev, [productId]: { ...prev[productId], ...patch } }))
    setDirty(true)
  }, [])

  const changeDayBasis = useCallback((basis) => {
    setDayBasis(basis)
    setDirty(true)
  }, [])

  const save = useCallback(async () => {
    if (previewMode) return { ok: false, reason: 'preview' }
    setSaving(true)
    let ok = true

    const payload = Object.entries(entries).map(([product_id, e]) => ({
      business_date: businessDate,
      product_id,
      start_total: numOrNull(e.start_total),
      start_manual: !!e.start_manual,
      adjustment: numOrNull(e.adjustment),
      note: e.note ?? null,
      end_a: numOrNull(e.end_a),
      end_b: numOrNull(e.end_b),
      received: numOrNull(e.received),
    }))
    if (payload.length) {
      const { error } = await supabase
        .from('inventory_entries')
        .upsert(payload, { onConflict: 'business_date,product_id' })
      if (error) ok = false
    }

    const { error: dErr } = await supabase
      .from('inventory_days')
      .upsert({ business_date: businessDate, par_basis: dayBasis }, { onConflict: 'business_date' })
    if (dErr) ok = false

    setSaving(false)
    if (ok) setDirty(false)
    return { ok }
  }, [previewMode, entries, dayBasis, businessDate])

  return { entries, dayBasis, prevEnd, loading, dirty, saving, setField, setFields, changeDayBasis, save }
}
