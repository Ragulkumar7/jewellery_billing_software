import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';

export type SilverRateStatus = 'loading' | 'ready' | 'unconfigured' | 'error';

export type SilverRateState = {
  currentRate: number;
  previousRate: number;
  effectiveDate: string | null;
  effectiveTime: string | null;
  updatedAt: string | null;
};

type SilverRateResponse = SilverRateState & { configured?: boolean };

type SilverRateContextValue = SilverRateState & {
  rate: number;
  status: SilverRateStatus;
  error: string | null;
  refreshRate: () => Promise<void>;
  loading: boolean;
};

// currentRate 0 + status is intentional: never show a fabricated default as real.
const EMPTY: SilverRateState = { currentRate: 0, previousRate: 0, effectiveDate: null, effectiveTime: null, updatedAt: null };

const RETRY_DELAYS_MS = [800, 2000, 4000];

const SilverRateContext = createContext<SilverRateContextValue>({
  ...EMPTY,
  rate: EMPTY.currentRate,
  status: 'loading',
  error: null,
  refreshRate: async () => {},
  loading: true,
});

export function SilverRateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SilverRateState>(EMPTY);
  const [status, setStatus] = useState<SilverRateStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const refreshRate = useCallback(async () => {
    // Startup races (API cold start, pre-login 401) are transient — retry before erroring.
    for (let attempt = 0; ; attempt++) {
      try {
        const data = await api<SilverRateResponse>('/api/silver-rate');
        if (data.configured === false || data.currentRate == null) {
          setState(EMPTY);
          setStatus('unconfigured');
          setError(null);
          return;
        }
        setState({
          currentRate: Number(data.currentRate),
          previousRate: Number(data.previousRate ?? data.currentRate),
          effectiveDate: data.effectiveDate ?? null,
          effectiveTime: data.effectiveTime ?? null,
          updatedAt: data.updatedAt ?? null,
        });
        setStatus('ready');
        setError(null);
        return;
      } catch (e) {
        if (attempt >= RETRY_DELAYS_MS.length) {
          setStatus('error');
          setError(e instanceof Error ? e.message : 'Unable to load silver rate');
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      }
    }
  }, []);

  useEffect(() => { void refreshRate(); }, [refreshRate]);

  const value = useMemo<SilverRateContextValue>(
    () => ({ ...state, rate: state.currentRate, status, error, refreshRate, loading: status === 'loading' }),
    [state, status, error, refreshRate],
  );

  return <SilverRateContext.Provider value={value}>{children}</SilverRateContext.Provider>;
}

export function useSilverRate() {
  return useContext(SilverRateContext);
}