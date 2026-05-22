// 캘린더에서 현재 표시 중인 owner uuid 집합을 localStorage 에 영속화.
//
// 기본값:
//   - 본인 uuid 가 있다면 본인 1개 ON
//   - 다른 linked 계정은 모두 OFF
//
// 키: 'schedule.enabled_owners'  (uuid 배열 JSON)

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'schedule.enabled_owners'
const MASTER_KEY  = 'schedule.master_all_owners'   // 마스터 전체 토글 (boolean)

function readArray() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed.filter(v => typeof v === 'string') : null
  } catch { return null }
}
function writeArray(arr) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)) } catch {}
}
function readMaster() {
  try { return localStorage.getItem(MASTER_KEY) === '1' } catch { return false }
}
function writeMaster(v) {
  try { localStorage.setItem(MASTER_KEY, v ? '1' : '0') } catch {}
}

/**
 * @param selfUid  현재 로그인 사용자 uuid (기본값 결정에 사용)
 */
export function useEnabledOwners(selfUid) {
  const [enabled, setEnabled] = useState(() => {
    const stored = readArray()
    if (stored !== null) return stored
    return selfUid ? [selfUid] : []
  })
  const [masterAll, setMasterAll] = useState(() => readMaster())

  // selfUid 가 늦게 들어오는 경우, stored 가 없으면 본인 1개로 초기화
  useEffect(() => {
    if (selfUid && readArray() === null) {
      setEnabled([selfUid])
      writeArray([selfUid])
    }
  }, [selfUid])

  const toggle = useCallback((uid) => {
    setEnabled(prev => {
      const next = prev.includes(uid) ? prev.filter(u => u !== uid) : [...prev, uid]
      writeArray(next)
      return next
    })
  }, [])

  const setOne = useCallback((uid, on) => {
    setEnabled(prev => {
      const has = prev.includes(uid)
      let next = prev
      if (on && !has) next = [...prev, uid]
      else if (!on && has) next = prev.filter(u => u !== uid)
      if (next !== prev) writeArray(next)
      return next
    })
  }, [])

  const setAll = useCallback((uids) => {
    setEnabled(uids)
    writeArray(uids)
  }, [])

  const toggleMasterAll = useCallback(() => {
    setMasterAll(prev => {
      const next = !prev
      writeMaster(next)
      return next
    })
  }, [])

  return { enabled, masterAll, toggle, setOne, setAll, toggleMasterAll }
}
