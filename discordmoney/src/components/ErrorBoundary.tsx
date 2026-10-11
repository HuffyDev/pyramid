import { Component, type ReactNode } from 'react';

/** Shows a recoverable message instead of a blank page if anything fails to render. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('DiscordMoney render error:', error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="shell py-20">
        <div className="card mx-auto flex max-w-md flex-col items-center gap-3 p-8 text-center">
          <div className="text-lg font-bold text-ink">Something went wrong</div>
          <p className="text-sm text-ink-mute">{this.state.error.message || 'This page failed to load.'}</p>
          <div className="flex gap-2">
            <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            <a href="/" className="btn-secondary">
              Home
            </a>
          </div>
        </div>
      </div>
    );
  }
}
