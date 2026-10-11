import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type Panel = 'connect' | 'token' | 'history' | 'reset' | null;
interface Api {
  panel: Panel;
  open: (p: Exclude<Panel, null>) => void;
  close: () => void;
}
const Ctx = createContext<Api | null>(null);

export function UIStateProvider({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<Panel>(null);
  const api = useMemo<Api>(() => ({ panel, open: setPanel, close: () => setPanel(null) }), [panel]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useUI() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUI outside provider');
  return v;
}
