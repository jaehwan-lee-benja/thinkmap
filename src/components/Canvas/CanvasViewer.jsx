// 마케팅 캔버스 메인 뷰어 (page_type='frame'|'engine' 일 때 렌더)
// 관련: docs/MARKETING-CANVAS-WIREFRAMES.md W1
//
// Phase 1 (현재): 빈 캔버스 + 영역 박스만 SVG 로 렌더
// Phase 1 후반: CardCluster, RegionPanel 등 추가
//
// Props:
//   - pageId         : 현재 페이지 ID
//   - canvasType     : 'frame' | 'engine'
//   - session        : effectiveSession (impersonation 정합)

import React, { useMemo, useState } from 'react'
import { useCanvasPair } from '../../hooks/useCanvasPair'
import { useCanvasSchema } from '../../hooks/useCanvasSchema'
import { useCanvasMappings } from '../../hooks/useCanvasMappings'
import { useCanvasWorkflow } from '../../hooks/useCanvasWorkflow'
import { useCanvasRegionStats } from '../../hooks/useCanvasRegionStats'
import { useCanvasMutations } from '../../hooks/useCanvasMutations'
import CardCluster from './CardCluster'
import RegionPanel from './RegionPanel'
import './CanvasViewer.css'

export default function CanvasViewer({ pageId, canvasType, session }) {
  const { pair, framePage, enginePage, loading: pairLoading, error: pairError } =
    useCanvasPair({ pageId })

  const masterId = pair?.master_id
  const schemaVersion = pair?.schema_version || 'v7.44'

  const { schema, regions, loading: schemaLoading, error: schemaError } =
    useCanvasSchema(masterId, canvasType, schemaVersion)

  const { byRegion, mappings, loading: mappingsLoading, refresh: refreshMappings } =
    useCanvasMappings(pageId)

  const { statusMap, defaultWorkflow } = useCanvasWorkflow(masterId)

  const { byRegion: statsByRegion, refresh: refreshStats } = useCanvasRegionStats(pageId)

  const { createMapping, updateMapping, deleteMapping } = useCanvasMutations()

  const handleCreateMapping = async ({
    region_key,
    note,
    status,
    priority,
    source_block_id = null,
    source_page_id = null,
    source_daily_block_id = null,
  }) => {
    if (!pair) throw new Error('페어 정보가 없습니다.')
    await createMapping({
      user_id: pair.user_id,
      master_id: pair.master_id,
      source_block_id,
      source_page_id,
      source_daily_block_id,
      target_pair_id: pair.id,
      target_page_id: pageId,
      region_key,
      status,
      priority,
      note,
      workflow_id: defaultWorkflow?.id || null,
    })
    await Promise.all([refreshMappings(), refreshStats()])
  }

  const handleUpdateMapping = async (id, patch) => {
    await updateMapping(id, patch)
    await Promise.all([refreshMappings(), refreshStats()])
  }

  const handleDeleteMapping = async (id) => {
    await deleteMapping(id)
    await Promise.all([refreshMappings(), refreshStats()])
  }

  const [selectedRegionKey, setSelectedRegionKey] = useState(null)
  const selectedRegion = useMemo(
    () => regions.find(r => r.key === selectedRegionKey) || null,
    [regions, selectedRegionKey]
  )

  const isLoading = pairLoading || schemaLoading
  const error = pairError || schemaError

  const currentTitle = useMemo(() => {
    if (!pair) return canvasType === 'frame' ? 'Marketing Frame' : 'Marketing Engine'
    const subtitle = canvasType === 'frame' ? 'Frame' : 'Engine'
    return `${pair.name} / ${subtitle}`
  }, [pair, canvasType])

  if (isLoading) {
    return (
      <div className="canvas-viewer canvas-viewer--loading">
        <p>캔버스 로딩 중...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="canvas-viewer canvas-viewer--error">
        <p>캔버스 로딩 실패: {error.message || String(error)}</p>
      </div>
    )
  }

  if (!pair || !schema) {
    return (
      <div className="canvas-viewer canvas-viewer--empty">
        <p>이 페이지에 연결된 마케팅 캔버스를 찾을 수 없습니다.</p>
        <p className="canvas-viewer__hint">
          (페어가 손상됐거나 schema 가 시드되지 않았을 수 있습니다.)
        </p>
      </div>
    )
  }

  const viewBox = schema.viewbox || '0 0 1280 960'

  return (
    <div className="canvas-viewer">
      <header className="canvas-viewer__header">
        <h2>{currentTitle}</h2>
        <span className="canvas-viewer__type-badge">{canvasType}</span>
        <span
          className="canvas-viewer__type-badge"
          style={{
            background: 'rgba(255,255,255,0.05)',
            color: 'rgba(255,255,255,0.5)',
            borderColor: 'rgba(255,255,255,0.12)',
          }}
        >
          page: {pageId?.slice(0, 8)}…
        </span>
      </header>

      <div className="canvas-viewer__stage">
        <svg
          className="canvas-viewer__svg"
          viewBox={viewBox}
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* 큰 원 배경 (placeholder) */}
          <circle
            cx="640"
            cy="480"
            r="380"
            fill="none"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />

          {/* 영역(Region) 박스 */}
          {regions.map((region) => {
            const [x, y, w, h] = region.bbox
            const isSelected = selectedRegionKey === region.key
            return (
              <g
                key={region.key}
                className="canvas-region"
                onClick={() => setSelectedRegionKey(region.key)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill={isSelected ? 'rgba(100,108,255,0.18)' : 'rgba(100,108,255,0.06)'}
                  stroke={isSelected ? '#646cff' : 'rgba(100,108,255,0.35)'}
                  strokeWidth={isSelected ? '2' : '1.2'}
                  rx="6"
                />
                <text
                  x={x + 8}
                  y={y + 18}
                  fontSize="14"
                  fill="rgba(255,255,255,0.85)"
                  fontWeight="600"
                >
                  {region.label}
                </text>

                {/* 노드 점 */}
                {(region.nodes || []).map((node) => (
                  <g key={node.key} className="canvas-node">
                    <circle
                      cx={node.cx}
                      cy={node.cy}
                      r="4"
                      fill="#646cff"
                    />
                    <text
                      x={node.cx + 8}
                      y={node.cy + 4}
                      fontSize="11"
                      fill="rgba(255,255,255,0.65)"
                    >
                      {node.label}
                    </text>
                  </g>
                ))}

                {/* 매핑된 카드 */}
                <CardCluster
                  region={region}
                  mappings={byRegion[region.key] || []}
                  statusMap={statusMap}
                />
              </g>
            )
          })}
        </svg>

        {/* 영역 사이드 패널 */}
        {selectedRegion && (
          <RegionPanel
            region={selectedRegion}
            mappings={byRegion[selectedRegion.key] || []}
            stats={statsByRegion[selectedRegion.key]}
            statusMap={statusMap}
            workflowSteps={defaultWorkflow?.steps || []}
            onClose={() => setSelectedRegionKey(null)}
            onCreateMapping={handleCreateMapping}
            onUpdateMapping={handleUpdateMapping}
            onDeleteMapping={handleDeleteMapping}
          />
        )}
      </div>

      <footer className="canvas-viewer__footer">
        <small>
          영역 {regions.length}개 · 카드 {mappings.length}개
          {mappingsLoading ? ' (불러오는 중...)' : ''}
        </small>
      </footer>
    </div>
  )
}
