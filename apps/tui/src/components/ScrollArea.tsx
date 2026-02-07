import { useStdout } from 'ink';
import type { ScrollViewRef } from 'ink-scroll-view';
import { ScrollView } from 'ink-scroll-view';
import type React from 'react';
import { useEffect, useRef } from 'react';

interface ScrollAreaProps {
  children: React.ReactNode;
  focusIndex?: number;
}

export function ScrollArea({ children, focusIndex }: ScrollAreaProps): React.JSX.Element {
  const scrollRef = useRef<ScrollViewRef>(null);
  const { stdout } = useStdout();

  // Re-measure on terminal resize
  useEffect(() => {
    const handleResize = () => scrollRef.current?.remeasure();
    stdout?.on('resize', handleResize);
    return () => {
      stdout?.off('resize', handleResize);
    };
  }, [stdout]);

  // Auto-scroll to keep focusIndex visible
  useEffect(() => {
    if (focusIndex == null || !scrollRef.current) return;

    const pos = scrollRef.current.getItemPosition(focusIndex);
    if (!pos) return;

    const viewportHeight = scrollRef.current.getViewportHeight();
    const scrollOffset = scrollRef.current.getScrollOffset();

    const itemTop = pos.top;
    const itemBottom = pos.top + pos.height;

    if (itemTop < scrollOffset) {
      // Item is above viewport — scroll up
      scrollRef.current.scrollTo(itemTop);
    } else if (itemBottom > scrollOffset + viewportHeight) {
      // Item is below viewport — scroll down
      scrollRef.current.scrollTo(itemBottom - viewportHeight);
    }
  }, [focusIndex]);

  return (
    <ScrollView
      ref={scrollRef}
      flexGrow={1}
      onViewportSizeChange={() => {
        // Re-run scroll logic when viewport changes (e.g. CommandPrompt expanding)
        if (focusIndex == null || !scrollRef.current) return;
        const pos = scrollRef.current.getItemPosition(focusIndex);
        if (!pos) return;
        const viewportHeight = scrollRef.current.getViewportHeight();
        const scrollOffset = scrollRef.current.getScrollOffset();
        const itemTop = pos.top;
        const itemBottom = pos.top + pos.height;
        if (itemTop < scrollOffset) {
          scrollRef.current.scrollTo(itemTop);
        } else if (itemBottom > scrollOffset + viewportHeight) {
          scrollRef.current.scrollTo(itemBottom - viewportHeight);
        }
      }}
    >
      {children}
    </ScrollView>
  );
}
