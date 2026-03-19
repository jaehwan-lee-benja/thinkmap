import React from 'react'
import { Star, X } from 'lucide-react'
import './FavoritesRail.css'

export function FavoritesRail({ isOpen, onToggle, favorites, onNavigate, onRemoveFavorite }) {
  return (
    <div className={`favorites-rail ${isOpen ? 'open' : ''}`}>
      {/* 세로 탭 버튼 */}
      <button
        className={`favorites-tab-button ${isOpen ? 'active' : ''}`}
        onClick={onToggle}
        title={isOpen ? '즐겨찾기 닫기' : '즐겨찾기 열기'}
      >
        <Star size={16} fill={isOpen ? 'currentColor' : 'none'} />
        <span className="favorites-tab-label">즐겨찾기</span>
      </button>

      {/* 즐겨찾기 패널 */}
      {isOpen && (
        <div className="favorites-panel">
          <div className="favorites-panel-header">
            <Star size={14} fill="currentColor" />
            <span>즐겨찾기</span>
            <button className="favorites-panel-close" onClick={onToggle}>
              <X size={14} />
            </button>
          </div>

          <div className="favorites-panel-content">
            {favorites.length === 0 ? (
              <div className="favorites-empty">
                <Star size={24} />
                <p>즐겨찾기가 없습니다</p>
                <p className="favorites-empty-hint">
                  사이드바에서 페이지의 ☆를 눌러<br />추가하세요
                </p>
              </div>
            ) : (
              <div className="favorites-list">
                {favorites.map(fav => (
                  <div
                    key={fav.pageId}
                    className="favorites-item"
                    onClick={() => onNavigate(fav)}
                  >
                    <div className="favorites-item-info">
                      <span className="favorites-item-icon">📄</span>
                      <div className="favorites-item-text">
                        <span className="favorites-item-name">{fav.pageName}</span>
                        {fav.projectName && (
                          <span className="favorites-item-project">{fav.projectName}</span>
                        )}
                      </div>
                    </div>
                    <button
                      className="favorites-item-remove"
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemoveFavorite(fav.pageId)
                      }}
                      title="즐겨찾기 해제"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
