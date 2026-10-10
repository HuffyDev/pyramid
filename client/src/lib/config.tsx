import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PublicConfig } from '../../../shared/launch';
import { api } from './api';
import { usePyramid } from './pyramid';

const fallback: PublicConfig = {
  dryRun: true,
  mockMode: true,
  simMode: false,
  pyramidMint: null,
  pyramidX: null,
  pyramidTelegram: null,
  siteUrl: null,
  deadMcapUsd: 6000,
  launchesPaused: null,
};
const Ctx = createContext<PublicConfig>(fallback);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [cfg, setCfg] = useState(fallback);
  const { configRev } = usePyramid();
  useEffect(() => {
    api.config().then(setCfg).catch(() => {});
  }, [configRev]);
  return <Ctx.Provider value={cfg}>{children}</Ctx.Provider>;
}

export const useConfig = () => useContext(Ctx);
