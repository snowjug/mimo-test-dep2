import { useState, useEffect, useCallback } from 'react';
import type { ConfigurationPageData } from '../types/configuration';
import { configurationService } from '../services/configuration.service';

export function useConfiguration() {
  const [data, setData] = useState<ConfigurationPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const result = await configurationService.getConfiguration();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configuration data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const saveConfig = async (updated: Partial<ConfigurationPageData>) => {
    try {
      setSaving(true);
      setError(null);
      const result = await configurationService.saveConfiguration(updated);
      setData(result);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { data, loading, saving, error, savedSuccess, saveConfig, refresh: fetchData };
}
