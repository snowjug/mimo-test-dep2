import { useState, useEffect, useCallback } from 'react';
import type { OperationsPageData } from '../types/operation';
import { operationsService } from '../services/operations.service';

export function useOperations() {
  const [data, setData] = useState<OperationsPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const result = await operationsService.getOperations();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load operations data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const retryOperation = async (id: string) => {
    await operationsService.retryOperation(id);
    fetchData();
  };

  const cancelOperation = async (id: string) => {
    await operationsService.cancelOperation(id);
    fetchData();
  };

  return { data, loading, refreshing, error, refresh, retryOperation, cancelOperation };
}
