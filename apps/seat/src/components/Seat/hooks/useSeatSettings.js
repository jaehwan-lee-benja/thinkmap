// 자리후 설정 상태 — localStorage 지속(기기별). 데이터(orders/stations) 훅과 무관.
import { useCallback, useEffect, useState } from 'react'
import { loadSettings, saveSettings } from '../config/seatSettings'

export function useSeatSettings() {
  const [settings, setSettings] = useState(loadSettings)

  useEffect(() => { saveSettings(settings) }, [settings])

  const setSetting = useCallback((key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }, [])

  return { settings, setSetting }
}
