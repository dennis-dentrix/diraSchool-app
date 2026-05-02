import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { settingsApi } from '@/lib/api';
import { getSchoolTermDefaults } from '@/lib/school-term';

export function useSchoolTermDefaults(queryKey = ['settings', 'term-defaults']) {
  const { data: settings, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await settingsApi.get();
      return res.data?.settings ?? res.data?.data ?? res.data;
    },
    staleTime: 60 * 1000,
  });

  const defaults = useMemo(() => getSchoolTermDefaults(settings), [settings]);

  return {
    ...defaults,
    settings,
    isLoading,
  };
}
