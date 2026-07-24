// 위성 런처 단일 레지스트리 (SITE-SPLIT).
// ★위성 추가/라벨·URL·아이콘 변경은 여기만 손댄다 — Sidebar 배선 하드코딩을 없애 병렬 편집 머지충돌 최소화.
// 정적 런처(전역/자체탐색)만 여기. payroll 은 page-scoped(모선이 선택한 payroll 페이지 id 를 ?page= 로 전달)라
//   여기 없고 Sidebar 에 별도 블록 + App.jsx isPayrollPage 분기 유지.
// 백오피스 사이트맵(src/utils/siteNodesSeed.js)은 별도(status/note/domain 등 풍부한 메타). url·label 은 일치 유지.
import { Package, Target, Coffee, Users, ClipboardList } from 'lucide-react'

export const SATELLITES = {
  inventory: { key: 'inventory', label: '재고 관리',   url: '/thinkmap/inventory/', icon: Package,       masterOnly: false },
  seat:      { key: 'seat',      label: '자리후',       url: '/thinkmap/seat/',      icon: Coffee,        masterOnly: false },
  canvas:    { key: 'canvas',    label: '마케팅 캔버스', url: '/thinkmap/canvas/',    icon: Target,        masterOnly: true },
  members:   { key: 'members',   label: '멤버 관리',    url: '/thinkmap/members/',   icon: Users,         masterOnly: true },
  crmboard:  { key: 'crmboard',  label: 'CRM 보드',     url: '/thinkmap/crmboard/',  icon: ClipboardList, masterOnly: true },
}

// 사이드바 위성 런처 — 데이터는 레지스트리에서. 진입=같은 origin 형제 서브경로(SSO 자동).
export function SatelliteLauncher({ satellite }) {
  const Icon = satellite.icon
  return (
    <a className="sidebar-worklog-btn" href={satellite.url} title={`${satellite.label} (별도 앱에서 열림)`}>
      <Icon size={16} />
      <span>{satellite.label}</span>
    </a>
  )
}
