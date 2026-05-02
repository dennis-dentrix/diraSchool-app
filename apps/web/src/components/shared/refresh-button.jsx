'use client';

import { useQueryClient, useIsFetching } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function RefreshButton({ queryKeys = [], variant = 'outline', size = 'sm' }) {
  const queryClient = useQueryClient();
  // Count in-flight fetches for the watched keys — non-zero means actively loading.
  const fetching = queryKeys.reduce(
    (acc, key) => acc + useIsFetching({ queryKey: Array.isArray(key) ? key : [key] }),
    0,
  );

  function handleRefresh() {
    queryKeys.forEach((key) =>
      queryClient.invalidateQueries({ queryKey: Array.isArray(key) ? key : [key] }),
    );
  }

  return (
    <Button variant={variant} size={size} onClick={handleRefresh} title="Refresh" aria-label="Refresh data">
      <RefreshCw className={`h-4 w-4 ${fetching > 0 ? 'animate-spin' : ''}`} aria-hidden />
    </Button>
  );
}
