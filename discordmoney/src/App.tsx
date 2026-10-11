import { useEffect, useState, type ReactNode } from 'react';
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GlobalPanels } from './components/Panels';
import { Footer, Header, TokenStrip } from './components/Shell';
import { ToastProvider, useToast } from './components/Toast';
import { UIStateProvider } from './components/UIState';
import { Empty, Spinner } from './components/ui';
import { connectWallet, refresh } from './lib/actions';
import { completeLogin } from './lib/discord';
import { setState } from './lib/store';
import { lastWallet } from './lib/wallet';
import ClaimPage from './pages/Claim';
import DashboardPage from './pages/Dashboard';
import LaunchPage from './pages/Launch';
import LaunchDetailPage from './pages/LaunchDetail';
import LaunchesPage from './pages/Launches';
import OffersPage from './pages/Offers';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

const TITLES: [RegExp, string][] = [
  [/^\/$/, 'Launch'],
  [/^\/launches\/.+/, 'Launch details'],
  [/^\/launches/, 'All launches'],
  [/^\/dashboard/, 'Dashboard'],
  [/^\/offers/, 'Sponsored posts'],
  [/^\/claim/, 'Claim'],
];

function TitleSync() {
  const { pathname } = useLocation();
  useEffect(() => {
    const t = TITLES.find(([re]) => re.test(pathname))?.[1] ?? 'Not found';
    document.title = `${t} · DiscordMoney`;
  }, [pathname]);
  return null;
}

function Boot() {
  useEffect(() => {
    void refresh();
    const last = lastWallet();
    if (last) void connectWallet(last, true);
  }, []);
  return null;
}

function DiscordCallback() {
  const nav = useNavigate();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    completeLogin(window.location.hash)
      .then(({ session, returnTo }) => {
        setState({ discord: session });
        toast.success(`Logged in as @${session.user.username}`);
        nav(returnTo, { replace: true });
      })
      .catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="shell py-16">
      {error ? (
        <Empty icon="alert" title="Discord login failed" body={error} action={<Link to="/" className="btn-primary">Back to DiscordMoney</Link>} />
      ) : (
        <div className="flex items-center justify-center gap-3 py-16 text-ink-mute">
          <Spinner size={20} /> Logging you in with Discord…
        </div>
      )}
    </div>
  );
}

function RouteBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
}

function NotFound() {
  return (
    <div className="shell py-16">
      <Empty
        icon="alert"
        title="This page wandered off"
        body="The link may be wrong, or the page has moved."
        action={
          <div className="flex gap-2">
            <Link to="/" className="btn-primary">
              Go to Launch
            </Link>
            <Link to="/launches" className="btn-secondary">
              All launches
            </Link>
          </div>
        }
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <UIStateProvider>
        <ScrollToTop />
        <TitleSync />
        <Boot />
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[90] focus:rounded focus:bg-blurple focus:px-3 focus:py-2 focus:text-white">
          Skip to content
        </a>
        <div className="ambient flex min-h-screen flex-col">
          <Header />
          <TokenStrip />
          <main id="main" className="flex-1 pt-8 sm:pt-10">
            <RouteBoundary>
            <Routes>
              <Route path="/" element={<LaunchPage />} />
              <Route path="/launches" element={<LaunchesPage />} />
              <Route path="/launches/:id" element={<LaunchDetailPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/offers" element={<OffersPage />} />
              <Route path="/claim" element={<ClaimPage />} />
              <Route path="/auth/discord" element={<DiscordCallback />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </RouteBoundary>
          </main>
          <Footer />
        </div>
        <GlobalPanels />
      </UIStateProvider>
    </ToastProvider>
  );
}
