import { useState, useEffect, useCallback } from 'react';
import type { KiosksPageData } from '../types/kiosk';
import { kiosksService } from '../services/kiosks.service';

export function useKiosks() {
  const [data, setData] = useState<KiosksPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const result = await kiosksService.getKiosks();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load kiosks data');
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

  const rebootKiosk = async (id: string) => {
    await kiosksService.rebootKiosk(id);
    fetchData();
  };

  const refillSupplies = async (id: string, type: 'ink' | 'paper') => {
    await kiosksService.refillSupplies(id, type);
    fetchData();
  };

  return { data, loading, refreshing, error, refresh, rebootKiosk, refillSupplies };
}
