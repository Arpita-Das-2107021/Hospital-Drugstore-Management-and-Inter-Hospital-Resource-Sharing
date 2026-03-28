import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Store scroll positions for each route
const scrollPositions = new Map<string, number>();

export const useScrollRestoration = () => {
  const location = useLocation();
  const navigationType = useNavigationType();
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const currentPath = location.pathname + location.search;
    
    // Clear any pending timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Immediately handle scroll position based on navigation type
    if (navigationType === 'POP' && scrollPositions.has(currentPath)) {
      // Back/forward navigation - restore position instantly without animation
      const savedPosition = scrollPositions.get(currentPath) || 0;
      window.scrollTo(0, savedPosition);
    } else {
      // New navigation - scroll to top instantly without animation
      window.scrollTo(0, 0);
    }

    // Save current scroll position when leaving the page
    const handleScroll = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(() => {
        scrollPositions.set(currentPath, window.scrollY);
      }, 100);
    };

    // Save scroll position before navigation
    const handleBeforeUnload = () => {
      scrollPositions.set(currentPath, window.scrollY);
    };

    // Save scroll position when page visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        scrollPositions.set(currentPath, window.scrollY);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      // Save position on cleanup
      scrollPositions.set(currentPath, window.scrollY);
    };
  }, [location.pathname, location.search, navigationType]);

  // Utility function to manually save current scroll position
  const saveScrollPosition = () => {
    const currentPath = location.pathname + location.search;
    scrollPositions.set(currentPath, window.scrollY);
  };

  return { saveScrollPosition };
};

export const useScrollToTop = () => {
  const scrollToTop = (behavior: ScrollBehavior = 'auto') => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior
    });
  };

  return { scrollToTop };
};