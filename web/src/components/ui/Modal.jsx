import React from 'react';
import { Dialog, IconButton } from '@radix-ui/themes';
import { X } from 'lucide-react';

export function Modal({ open, onOpenChange, title, description, children, maxWidth = 500 }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content style={{ maxWidth: maxWidth }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <Dialog.Title style={{ margin: 0 }}>{title}</Dialog.Title>
            {description && (
              <Dialog.Description style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                {description}
              </Dialog.Description>
            )}
          </div>
          <Dialog.Close>
            <IconButton variant="ghost" color="gray" size="1" style={{ cursor: 'pointer' }}>
              <X size={16} />
            </IconButton>
          </Dialog.Close>
        </div>
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
