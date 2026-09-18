import { useState, useEffect, useCallback } from 'react';
import type { IncidentsPageData } from '../types/incident';
import { incidentsService } from '../services/incidents.service';

export function useIncidents() {
  const [data, setData] = useState<IncidentsPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const result = await incidentsService.getIncidents();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load incidents data');
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

  const acknowledge = async (id: string) => {
    await incidentsService.acknowledgeIncident(id);
    fetchData();
  };

  const resolve = async (id: string) => {
    await incidentsService.resolveIncident(id);
    fetchData();
  };

  return { data, loading, refreshing, error, refresh, acknowledge, resolve };
}
