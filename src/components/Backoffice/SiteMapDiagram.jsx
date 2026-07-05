// 사이트 구조도 — 모선(Hub) + 위성(Satellite) hub-and-spoke 다이어그램.
// SVG 스포크(선) + foreignObject HTML 노드박스(줄바꿈·건조 스타일). 노드 클릭 → onSelect(id).
// 여러 hub 가 있으면 각 hub 를 세로로 쌓고, 소속 없는(=domain 매칭 안 되는) 위성은
// 첫 hub 아래로 모은다. MVP 는 hub 1개 가정이지만 N-hub 도 깨지지 않게 처리.

import React from 'react'
import { NODE_STATUS_LABEL, NODE_ROLE_LABEL } from '../../utils/siteNodesSeed'

const HUB_W = 240
const SAT_W = 158
const SAT_H = 98
const HUB_H = 88
const COL_GAP = 22
const ROW_GAP = 120

function NodeBox({ node, x, y, w, h, selected, onSelect }) {
  return (
    <foreignObject x={x} y={y} width={w} height={h}>
      <div
        className={`smap-node smap-node--${node.kind} smap-status--${node.status}${selected ? ' is-selected' : ''}`}
        onClick={() => onSelect?.(node.id)}
        title={node.note || node.name}
      >
        <div className="smap-node-name">{node.name}</div>
        <div className="smap-node-meta">
          <span className="smap-node-domain">{node.domain || '—'}</span>
          <span className={`smap-chip smap-chip--${node.status}`}>{NODE_STATUS_LABEL[node.status] || node.status}</span>
        </div>
        <div className="smap-node-role">{NODE_ROLE_LABEL[node.required_role] || node.required_role}</div>
      </div>
    </foreignObject>
  )
}

export default function SiteMapDiagram({ nodes, selectedId, onSelect }) {
  const hubs = nodes.filter((n) => n.kind === 'hub')
  const sats = nodes.filter((n) => n.kind !== 'hub')

  // hub 가 없으면 위성만 그리드로.
  const effectiveHubs = hubs.length ? hubs : [null]

  // 레이아웃 계산: 각 hub 블록마다 (hub 1줄 + 위성 N열 1줄).
  // 위성을 hub 에 배정: hub.domain === 'hub' 이거나 hub 가 1개면 전부 그 hub 아래.
  const assign = (hub) => {
    if (effectiveHubs.length <= 1) return sats
    // 다중 hub: domain prefix 매칭 없으면 첫 hub 로.
    return sats.filter((s) => (s._hubId || effectiveHubs[0]) === hub?.id)
  }

  const maxCols = Math.max(1, ...effectiveHubs.map((h) => assign(h).length))
  const rowW = Math.max(HUB_W + 40, maxCols * SAT_W + (maxCols - 1) * COL_GAP + 40)
  const blockH = HUB_H + ROW_GAP + SAT_H + 40

  const totalH = effectiveHubs.length * blockH
  const centerX = rowW / 2

  return (
    <div className="smap-wrap">
      <svg
        className="smap-svg"
        viewBox={`0 0 ${rowW} ${totalH}`}
        width="100%"
        style={{ maxWidth: rowW, minWidth: Math.min(rowW, 520) }}
        preserveAspectRatio="xMidYMin meet"
        role="img"
        aria-label="사이트 구조도 (모선-위성)"
      >
        {effectiveHubs.map((hub, bi) => {
          const yBase = bi * blockH + 20
          const hubX = centerX - HUB_W / 2
          const hubY = yBase
          const satY = yBase + HUB_H + ROW_GAP
          const myS = assign(hub)
          const totalSatW = myS.length * SAT_W + (myS.length - 1) * COL_GAP
          const startX = centerX - totalSatW / 2
          const hubCx = centerX
          const hubBottomY = hubY + HUB_H

          return (
            <g key={hub?.id || `hub-${bi}`}>
              {/* 스포크 */}
              {myS.map((s, i) => {
                const sx = startX + i * (SAT_W + COL_GAP) + SAT_W / 2
                return (
                  <line
                    key={`spoke-${s.id}`}
                    className={`smap-spoke${selectedId === s.id ? ' is-selected' : ''}`}
                    x1={hubCx}
                    y1={hubBottomY}
                    x2={sx}
                    y2={satY}
                  />
                )
              })}
              {/* hub 박스 */}
              {hub && (
                <NodeBox node={hub} x={hubX} y={hubY} w={HUB_W} h={HUB_H} selected={selectedId === hub.id} onSelect={onSelect} />
              )}
              {/* 위성 박스 */}
              {myS.map((s, i) => {
                const sx = startX + i * (SAT_W + COL_GAP)
                return (
                  <NodeBox key={s.id} node={s} x={sx} y={satY} w={SAT_W} h={SAT_H} selected={selectedId === s.id} onSelect={onSelect} />
                )
              })}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
