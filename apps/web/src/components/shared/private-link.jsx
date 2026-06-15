'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

/**
 * A link/button that fetches a signed URL for a private R2 object on click,
 * then opens it in a new tab (for PDFs/downloads).
 *
 * Props:
 *   fileKey  — R2 object key (e.g. "receipts/schoolId/receipt.pdf")
 *   children — link label
 *   className
 */
export function PrivateLink({ fileKey, children, className, ...props }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async (e) => {
    e.preventDefault();
    if (!fileKey || loading) return;
    // Normalise legacy full URLs to a key
    let key = fileKey;
    if (fileKey.startsWith('http')) {
      try { key = new URL(fileKey).pathname.replace(/^\//, ''); } catch { /* use as-is */ }
    }
    setLoading(true);
    try {
      const res = await api.get(`/files/signed-url?key=${encodeURIComponent(key)}`);
      window.open(res.data.data.url, '_blank', 'noreferrer');
    } catch {
      toast.error('Could not open file. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={className}
      {...props}
    >
      {loading ? 'Opening…' : children}
    </button>
  );
}
