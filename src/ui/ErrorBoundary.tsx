import { Component, type ErrorInfo, type ReactNode } from 'react';
import { store } from '../store/store';

interface Props {
  children: ReactNode;
  /** Where the failure happened, for the message. */
  scope: 'page' | 'app';
  /** Changing this clears the error (e.g. selecting another document). */
  resetKey?: string | null;
}

/** Keeps one broken view from taking the whole app (and unsaved work) down with it. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Inkwell view error', error, info.componentStack);
    void store.flush();
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const app = this.props.scope === 'app';
    return (
      <div className={`crash ${app ? 'crash-app' : ''}`} role="alert">
        <h2>{app ? 'Inkwell ran into a problem' : 'This page couldn’t be shown'}</h2>
        <p>Your writing is safe: everything typed so far has been saved to the project folder.</p>
        <pre>{error.message}</pre>
        <div className="crash-actions">
          {!app && (
            <button className="btn" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          )}
          <button className="btn primary" onClick={() => void store.flush().then(() => location.reload())}>
            Reload Inkwell
          </button>
        </div>
      </div>
    );
  }
}
