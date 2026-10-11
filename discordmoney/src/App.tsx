import { useEffect } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { GlobalPanels } from './components/Panels';
import { DemoBanner, Footer, Header, TokenStrip } from './components/Shell';
import { ToastProvider, useToast } from './components/Toast';
import { UIStateProvider } from './components/UIState';
import { Empty } from './components/ui';
import { loadIssue, saveIssue, useDemo } from './lib/store';
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
    document.title = `${t} · DiscordMoney demo`;
  }, [pathname]);
  return null;
}

function StorageWatch() {
  const toast = useToast();
  const s = useDemo();
  useEffect(() => {
    if (loadIssue === 'corrupt') toast.error('Saved demo data was unreadable', 'Sample data has been restored.');
    if (loadIssue === 'outdated') toast.info('Demo updated', 'Saved data was from an older version, so sample data was restored.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (saveIssue) toast.error('Could not save demo changes', 'Browser storage is full or blocked. Changes last until you reload.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);
  return null;
}

function NotFound() {
  return (
    <div className="shell py-16">
      <Empty
        icon="alert"
        title="This page wandered off"
        body="The link may be wrong or the demo record was reset."
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
        <StorageWatch />
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[90] focus:rounded focus:bg-blurple focus:px-3 focus:py-2 focus:text-white">
          Skip to content
        </a>
        <div className="ambient flex min-h-screen flex-col">
          <DemoBanner />
          <Header />
          <TokenStrip />
          <main id="main" className="flex-1 pt-8 sm:pt-10">
            <Routes>
              <Route path="/" element={<LaunchPage />} />
              <Route path="/launches" element={<LaunchesPage />} />
              <Route path="/launches/:id" element={<LaunchDetailPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/offers" element={<OffersPage />} />
              <Route path="/claim" element={<ClaimPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          <Footer />
        </div>
        <GlobalPanels />
      </UIStateProvider>
    </ToastProvider>
  );
}
