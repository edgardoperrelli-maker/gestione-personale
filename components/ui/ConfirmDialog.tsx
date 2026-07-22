'use client';

// Conferma brand su primitivo Dialog (sostituisce i confirm() nativi).
// Uso: stato `open` nel chiamante; `loading` tiene la dialog aperta e
// disabilita le azioni durante l'operazione asincrona.

import * as React from 'react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/Button';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Azione distruttiva: bottone di conferma in variante danger. */
  danger?: boolean;
  /** Operazione in corso: spinner sul bottone, chiusura bloccata. */
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Conferma',
  cancelLabel = 'Annulla',
  danger = false,
  loading = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const handleClose = () => {
    if (!loading) onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={handleClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {message ? <p className="text-sm text-[var(--brand-text-muted)]">{message}</p> : null}
    </Dialog>
  );
}
