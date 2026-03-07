import { useRef, useEffect, useCallback } from 'react';

/**
 * 스와이프 제스처 훅
 * - 왼쪽 가장자리에서 오른쪽 스와이프 → onSwipeRight (사이드바 열기)
 * - 오른쪽으로 열린 상태에서 왼쪽 스와이프 → onSwipeLeft (사이드바 닫기)
 */
export function useSwipeGesture({ onSwipeRight, onSwipeLeft, edgeWidth = 24, threshold = 60 }) {
  const touchStart = useRef(null);
  const touchCurrent = useRef(null);
  const isEdgeSwipe = useRef(false);

  const handleTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
    touchCurrent.current = { x: touch.clientX, y: touch.clientY };
    // 왼쪽 가장자리에서 시작했는지 확인
    isEdgeSwipe.current = touch.clientX <= edgeWidth;
  }, [edgeWidth]);

  const handleTouchMove = useCallback((e) => {
    if (!touchStart.current) return;
    touchCurrent.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!touchStart.current || !touchCurrent.current) {
      touchStart.current = null;
      touchCurrent.current = null;
      return;
    }

    const dx = touchCurrent.current.x - touchStart.current.x;
    const dy = touchCurrent.current.y - touchStart.current.y;

    // 수직 스와이프는 무시 (스크롤과 구분)
    if (Math.abs(dy) > Math.abs(dx)) {
      touchStart.current = null;
      touchCurrent.current = null;
      return;
    }

    // 오른쪽 스와이프 (가장자리에서만)
    if (dx > threshold && isEdgeSwipe.current) {
      onSwipeRight?.();
    }
    // 왼쪽 스와이프
    else if (dx < -threshold) {
      onSwipeLeft?.();
    }

    touchStart.current = null;
    touchCurrent.current = null;
  }, [threshold, onSwipeRight, onSwipeLeft]);

  useEffect(() => {
    const opts = { passive: true };
    document.addEventListener('touchstart', handleTouchStart, opts);
    document.addEventListener('touchmove', handleTouchMove, opts);
    document.addEventListener('touchend', handleTouchEnd, opts);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);
}
