import { useState, useEffect, useCallback } from 'react';
import type { AnalyticsPageData } from '../types/analytics';
import { analyticsService } from '../services/analytics.service';

export function useAnalytics() {
  const [data, setData] = useState<AnalyticsPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const result = await analyticsService.getAnalytics();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics data');
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
