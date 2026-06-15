'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Normalise whatever is stored in the DB to an R2 object key.
// Old records stored the full public URL; new records store just the key.
function toKey(value) {
  if (!value) return null;
  if (!value.startsWith('http')) return value;
  try {
    // Strip leading slash to get the key, e.g. "students/school123/photo.jpg"
    return new URL(value).pathname.replace(/^\//, '');
  } catch {
    return null;
  }
}

/**
 * Resolves a private R2 object key (or legacy full URL) to a short-lived signed URL.
 * Returns null while loading.
 */
export function useSignedUrl(src) {
  const key = toKey(src);

  const { data } = useQuery({
    queryKey: ['signed-url', key],
    queryFn: async () => {
      const res = await api.get(`/files/signed-url?key=${encodeURIComponent(key)}`);
      return res.data.data.url;
    },
    enabled: !!key,
    staleTime: 10 * 60 * 1000,  // re-fetch after 10 min (URL expires in 15)
    gcTime:   15 * 60 * 1000,
    retry: false,
  });

  if (!key) return null;
  return data ?? null;
}
