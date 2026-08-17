import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';

export type SilverRateState = {
  currentRate: number;
  previousRate: number;
  effectiveDate: string | null;
  effectiveTime: string | null;
  updatedAt: string | null;
};

type SilverRateContextValue = SilverRateState & {
  rate: number;
  refreshRate: () => Promise<void>;
  loading: boolean;
};

const fallback: SilverRateState = { currentRate: 92.8, previousRate: 92.4, effectiveDate: null, effectiveTime: null, updatedAt: null };

const SilverRateContext = createContext<SilverRateContextValue>({
  ...fallback,
  rate: fallback.currentRate,
  refreshRate: async () => {},
  loading: true,
});

export function SilverRateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SilverRateState>(fallback);
  const [loading, setLoading] = useState(true);

  const refreshRate = useCallback(async () => {
    try {
      const data = await api<SilverRateState>('/api/silver-rate');
      setState({
        currentRate: Number(data.currentRate ?? fallback.currentRate),
        previousRate: Number(data.previousRate ?? data.currentRate ?? fallback.previousRate),
        effectiveDate: data.effectiveDate ?? null,
        effectiveTime: data.effectiveTime ?? null,
        updatedAt: data.updatedAt ?? null,
      });
    } catch {
      // Keep the fallback on failure so the UI never breaks; a later refresh will populate.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refreshRate(); }, [refreshRate]);

  const value = useMemo<SilverRateContextValue>(() => ({ ...state, rate: state.currentRate, refreshRate, loading }), [state, refreshRate, loading]);

  return <SilverRateContext.Provider value={value}>{children}</SilverRateContext.Provider>;
}

export function useSilverRate() {
  return useContext(SilverRateContext);
}