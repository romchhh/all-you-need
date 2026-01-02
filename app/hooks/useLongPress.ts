import { useRef, useCallback } from 'react';

interface UseLongPressOptions {
  onLongPress: (e: React.MouseEvent | React.TouchEvent) => void;
  onClick?: (e: React.MouseEvent | React.TouchEvent) => void;
  delay?: number;
}

export const useLongPress = ({
  onLongPress,
  onClick,
  delay = 500,
}: UseLongPressOptions) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const targetRef = useRef<EventTarget | null>(null);

  const start = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    targetRef.current = e.target;
    timeoutRef.current = setTimeout(() => {
      if (e.type === 'touchstart') {
        e.preventDefault();
      }
      onLongPress(e);
    }, delay);
  }, [onLongPress, delay]);

  const clear = useCallback((e: React.MouseEvent | React.TouchEvent, shouldTriggerClick = false) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (shouldTriggerClick && onClick && e.target === targetRef.current) {
      onClick(e);
    }
    targetRef.current = null;
  }, [onClick]);

  return {
    onMouseDown: (e: React.MouseEvent) => start(e),
    onTouchStart: (e: React.TouchEvent) => start(e),
    onMouseUp: (e: React.MouseEvent) => clear(e, true),
    onMouseLeave: (e: React.MouseEvent) => clear(e, false),
    onTouchEnd: (e: React.TouchEvent) => clear(e, true),
    onTouchCancel: (e: React.TouchEvent) => clear(e, false),
  };
};

