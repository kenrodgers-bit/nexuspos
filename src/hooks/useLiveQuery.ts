import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';

export const useLiveQuery = <T,>(query: () => Promise<T>, deps: React.DependencyList, initial: T) => {
  const [data, setData] = useState<T>(initial);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const subscription = liveQuery(query).subscribe({
      next: setData,
      error: setError
    });
    return () => subscription.unsubscribe();
  }, deps);

  if (error) throw error;
  return data;
};
