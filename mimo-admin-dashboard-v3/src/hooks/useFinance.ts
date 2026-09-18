import { useState, useEffect, useCallback } from 'react';
import type { FinancePageData } from '../types/finance';
import { financeService } from '../services/finance.service';

export function useFinance() {
  const [data, setData] = useState<FinancePageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const result = await financeService.getFinance();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load finance data');
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

  return { data, loading, refreshing, error, refresh };
}
