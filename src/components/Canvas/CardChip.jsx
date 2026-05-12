// 매핑 카드 1개 (영역 내 표시) — 컴팩트 칩
// 관련: docs/MARKETING-CANVAS-WIREFRAMES.md W1 (CardCluster 안에서 사용)
//
// Props:
//   - mapping  : canvas_mappings row
//   - statusMap: workflow status_key → {label, color}
//   - title    : 표시 텍스트 (없으면 mapping.note 또는 placeholder)
//   - onClick  : (mapping) => void
//   - x, y, width : SVG 좌표

import React from 'react'

export default function CardChip({
  mapping,
  statusMap,
  title,
  x = 0,
  y = 0,
  width = 220,
  onClick,
}) {
  // status 색: workflow 룩업 → fallback (시드 워크플로우와 동일한 기본 색)
  const FALLBACK_STATUS_COLOR = {
    todo: '#9ca3af',     // 회색
    doing: '#3b82f6',    // 파랑
    done: '#10b981',     // 초록
    blocked: '#ef4444',  // 빨강
  }
  const status = statusMap?.[mapping.status]
  const color = status?.color || FALLBACK_STATUS_COLOR[mapping.status] || '#9ca3af'

  const label = title || mapping.note || '(무제)'
  const truncated = label.length > 26 ? label.slice(0, 26) + '…' : label

  // 우선순위 색
  const PRIORITY_COLOR = {
    0: '#ef4444', // P0 빨강 (긴급)
    1: '#f59e0b', // P1 주황 (중요)
  }
  const priorityColor = PRIORITY_COLOR[mapping.priority]

  return (
    <g
      className="canvas-card-chip"
      transform={`translate(${x}, ${y})`}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.(mapping)
      }}
      style={{ cursor: 'pointer' }}
    >
      {/* 좌측 컬러바 (status 색) — 폭 6, 둥근 좌측 */}
      <rect x="0" y="0" width="6" height="20" fill={color} rx="2" />

      {/* 본체 */}
      <rect
        x="6"
        y="0"
        width={width - 6}
        height="20"
        fill="#2a2a2a"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1"
        rx="3"
      />

      {/* 텍스트 */}
      <text
        x="13"
        y="14"
        fontSize="11"
        fill="rgba(255,255,255,0.9)"
      >
        {truncated}
      </text>

      {/* 우선순위 점 (P0~P1만 표시) */}
      {priorityColor && (
        <circle
          cx={width - 10}
          cy="10"
          r="4"
          fill={priorityColor}
          stroke="#1a1a1a"
          strokeWidth="1.5"
        />
      )}
    </g>
  )
}
