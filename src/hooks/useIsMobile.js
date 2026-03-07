import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 600;
const TABLET_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT);
  const [isTablet, setIsTablet] = useState(() => window.innerWidth <= TABLET_BREAKPOINT);
  const [isTouch, setIsTouch] = useState(() =>
    window.matchMedia('(hover: none) and (pointer: coarse)').matches
  );

  useEffect(() => {
    const mobileQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const tabletQuery = window.matchMedia(`(max-width: ${TABLET_BREAKPOINT}px)`);
    const touchQuery = window.matchMedia('(hover: none) and (pointer: coarse)');

    const handleMobile = (e) => setIsMobile(e.matches);
    const handleTablet = (e) => setIsTablet(e.matches);
    const handleTouch = (e) => setIsTouch(e.matches);

    mobileQuery.addEventListener('change', handleMobile);
    tabletQuery.addEventListener('change', handleTablet);
    touchQuery.addEventListener('change', handleTouch);

    return () => {
      mobileQuery.removeEventListener('change', handleMobile);
      tabletQuery.removeEventListener('change', handleTablet);
      touchQuery.removeEventListener('change', handleTouch);
    };
  }, []);

  return { isMobile, isTablet, isTouch };
}
