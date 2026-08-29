// @ts-nocheck
import React from 'react';
import { Tabs as RadixTabs } from '@radix-ui/themes';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Tabs({ value, onValueChange, defaultValue, items, children }) {
  const listRef = React.useRef(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const updateScroll = React.useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  React.useEffect(() => {
    updateScroll();
    const el = listRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScroll, { passive: true });
    const ro = new ResizeObserver(updateScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScroll);
      ro.disconnect();
    };
  }, [updateScroll, items.length]);

  React.useEffect(() => {
    const el = listRef.current;
    if (!el || !value) return;
    const active = el.querySelector(`[data-state="active"]`);
    if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [value]);

  const scrollBy = (dir) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 160, behavior: 'smooth' });
  };

  return (
    <RadixTabs.Root
      value={value}
      onValueChange={onValueChange}
      defaultValue={defaultValue}
      className="tabs-root"
    >
      <div className="tabs-list-wrap">
        {canScrollLeft && (
          <button type="button" className="tabs-scroll-btn tabs-scroll-left" onClick={() => scrollBy(-1)} aria-label="Scroll tabs left">
            <ChevronLeft size={14} />
          </button>
        )}
        {canScrollRight && (
          <button type="button" className="tabs-scroll-btn tabs-scroll-right" onClick={() => scrollBy(1)} aria-label="Scroll tabs right">
            <ChevronRight size={14} />
          </button>
        )}
        <RadixTabs.List ref={listRef} className="tabs-list" style={{ marginBottom: '1.25rem' }}>
          {items.map(item => {
            const Icon = item.icon;
            return (
              <RadixTabs.Trigger
                key={item.id}
                value={item.id}
                className="tab-trigger"
                style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
              >
                {Icon && <Icon size={14} style={{ marginRight: 6 }} />}
                {item.label}
              </RadixTabs.Trigger>
            );
          })}
        </RadixTabs.List>
      </div>
      {children}
    </RadixTabs.Root>
  );
}

export function TabsContent({ value, children }) {
  return (
    <RadixTabs.Content value={value} className="tabs-content">
      {children}
    </RadixTabs.Content>
  );
}
