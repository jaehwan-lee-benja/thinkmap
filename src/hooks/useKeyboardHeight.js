import { useState, useEffect } from 'react';

/**
 * 모바일 가상 키보드 높이 감지 훅
 * visualViewport API를 사용하여 키보드 올라올 때 높이를 반환
 */
export function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const handleResize = () => {
      // 키보드 높이 = 전체 윈도우 높이 - visualViewport 높이
      const height = Math.max(0, window.innerHeight - vv.height);
      // 50px 이하는 주소창 변화로 간주하고 무시
      const isOpen = height > 50;
      setKeyboardHeight(isOpen ? height : 0);
      setIsKeyboardOpen(isOpen);

      // CSS 변수로도 노출 (CSS에서 바로 사용 가능)
      document.documentElement.style.setProperty(
        '--keyboard-height',
        isOpen ? `${height}px` : '0px'
      );
    };

    vv.addEventListener('resize', handleResize);
    vv.addEventListener('scroll', handleResize);

    return () => {
      vv.removeEventListener('resize', handleResize);
      vv.removeEventListener('scroll', handleResize);
      document.documentElement.style.setProperty('--keyboard-height', '0px');
    };
  }, []);

  return { keyboardHeight, isKeyboardOpen };
}
