import { Buffer } from 'buffer';
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer;

import '@fontsource/cinzel/500.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/500.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/hanken-grotesk/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { SolanaProviders } from './wallet/WalletProvider';
import { ConfigProvider } from './lib/config';
import { LaunchSheetProvider } from './components/LaunchSheet';
import { startPyramid } from './lib/pyramid';
import './styles/index.css';

startPyramid();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ConfigProvider>
        <SolanaProviders>
          <LaunchSheetProvider>
            <App />
          </LaunchSheetProvider>
        </SolanaProviders>
      </ConfigProvider>
    </BrowserRouter>
  </StrictMode>,
);
