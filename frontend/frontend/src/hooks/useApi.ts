/**
 * Custom React hooks for API data fetching
 */

import { useState, useEffect, useCallback } from 'react';

interface UseApiOptions {
  skip?: boolean;
  params?: Record<string, string>;
}

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Generic hook for fetching data from API
 */
export function useApi<T>(
  fetcher: (params?: Record<string, string>) => Promise<T>,
  options: UseApiOptions = {}
): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!options.skip);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (options.skip) return;

    setLoading(true);
    setError(null);

    try {
      const result = await fetcher(options.params);
      setData(result);
    } catch (err) {
      setError(err as Error);
      console.error('API fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [fetcher, options.skip, options.params]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
}

/**
 * Hook for API mutations (POST, PUT, DELETE)
 */
export function useApiMutation<T, P = any>(
  mutator: (data: P) => Promise<T>
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (mutationData: P) => {
      setLoading(true);
      setError(null);

      try {
        const result = await mutator(mutationData);
        setData(result);
        return result;
      } catch (err) {
        setError(err as Error);
        console.error('API mutation error:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [mutator]
  );

  return {
    data,
    loading,
    error,
    mutate,
  };
}
