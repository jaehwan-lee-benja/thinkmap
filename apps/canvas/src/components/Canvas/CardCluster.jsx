// 한 영역(Region) 안의 카드 묶음 + 밀도 자동 조절
// 관련: docs/MARKETING-CANVAS-WIREFRAMES.md W1 §3-1 (밀도 자동 조절)
//
// Props:
//   - region    : { key, label, bbox, nodes }
//   - mappings  : canvas_mappings rows in this region
//   - statusMap : workflow status_key → {label, color}
//   - titleMap  : { mappingId: title } — 미리 fetch 한 카드 제목
//   - onCardClick

import React from 'react'
import CardChip from './CardChip'

const ROW_HEIGHT = 22
const PADDING_TOP = 26   // 영역 라벨 높이
const PADDING_X = 8

const COMPACT_LIMIT = 5   // 모두 노출
const SUMMARY_LIMIT = 15  // +N more 표시

export default function CardCluster({
  region,
  mappings = [],
  statusMap,
  titleMap = {},
  onCardClick,
}) {
  if (!mappings.length) return null

  const [rx, ry, rw, rh] = region.bbox
  const cardWidth = rw - PADDING_X * 2
  const total = mappings.length

  // 밀도 자동 조절
  let visibleCount
  if (total <= COMPACT_LIMIT) {
    visibleCount = total
  } else if (total <= SUMMARY_LIMIT) {
    visibleCount = COMPACT_LIMIT - 1  // 마지막 자리는 +N more
  } else {
    visibleCount = 0  // 카운트 뱃지만
  }

  const visible = mappings.slice(0, visibleCount)
  const moreCount = total - visibleCount

  return (
    <g className="canvas-card-cluster">
      {visible.map((mapping, idx) => {
        const cardY = ry + PADDING_TOP + idx * ROW_HEIGHT
        if (cardY + ROW_HEIGHT > ry + rh) return null  // 영역 초과 방지
        return (
          <CardChip
            key={mapping.id}
            mapping={mapping}
            statusMap={statusMap}
            title={titleMap[mapping.id]}
            x={rx + PADDING_X}
            y={cardY}
            width={cardWidth}
            onClick={onCardClick}
          />
        )
      })}

      {/* +N more 칩 (또는 밀도 뱃지) */}
      {moreCount > 0 && (
        <g transform={`translate(${rx + PADDING_X}, ${ry + PADDING_TOP + visibleCount * ROW_HEIGHT})`}>
          <rect
            x="0"
            y="0"
            width={cardWidth}
            height="20"
            fill="rgba(255,255,255,0.04)"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="1"
            strokeDasharray="2 2"
            rx="3"
          />
          <text
            x={cardWidth / 2}
            y="14"
            fontSize="11"
            fill="rgba(255,255,255,0.55)"
            textAnchor="middle"
          >
            +{moreCount} more
          </text>
        </g>
      )}
    </g>
  )
}
