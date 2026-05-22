import React from 'react';
import { Tabs as RadixTabs } from '@radix-ui/themes';

export function Tabs({ value, onValueChange, defaultValue, items, children }) {
  return (
    <RadixTabs.Root
      value={value}
      onValueChange={onValueChange}
      defaultValue={defaultValue}
      className="tabs-root"
    >
      <RadixTabs.List className="tabs-list" style={{ marginBottom: '1.25rem' }}>
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
