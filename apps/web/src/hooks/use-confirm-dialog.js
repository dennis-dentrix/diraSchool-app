'use client';
import { useState } from 'react';

const INIT = { open: false, title: '', description: '', onConfirm: null };

export function useConfirmDialog() {
  const [dialog, setDialog] = useState(INIT);

  const openConfirm = ({ title, description = '', onConfirm }) =>
    setDialog({ open: true, title, description, onConfirm });

  const closeConfirm = () => setDialog(INIT);

  return { dialog, openConfirm, closeConfirm };
}
