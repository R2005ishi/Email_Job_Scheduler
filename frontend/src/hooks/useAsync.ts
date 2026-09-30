import { DependencyList, useCallback, useEffect, useRef, useState } from 'react';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

// Loads data when deps change. Ignores responses from older requests.
export function useAsync<T>(loader: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const callId = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  const reload = useCallback(async () => {
    const id = ++callId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await run();
      if (id === callId.current) setData(result);
    } catch (err) {
      if (id === callId.current) setError((err as Error).message);
    } finally {
      if (id === callId.current) setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}
