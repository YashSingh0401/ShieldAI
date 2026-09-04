import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Structured log for observability; could be sent to Sentry if VITE_SENTRY_DSN set
    console.error('[ErrorBoundary]', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    // Soft reload of failing tree
    if (this.props.onReset) this.props.onReset();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="glass-card" style={{ padding: '24px', textAlign: 'center', margin: '24px auto', maxWidth: '640px' }}>
          <h3 style={{ color: 'var(--danger)', marginBottom: '8px' }}>Something broke</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '12px' }}>
            The forensic console hit an unexpected error. Your scan history is safe. Try again or reload.
          </p>
          <pre style={{ textAlign: 'left', background: 'var(--bg-muted)', padding: '10px', borderRadius: '8px', fontSize: '0.75rem', overflowX: 'auto', color: 'var(--text-muted)' }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '16px' }}>
            <button className="btn btn-primary btn-sm" onClick={this.handleRetry}>Retry</button>
            <button className="btn btn-secondary btn-sm" onClick={() => window.location.reload()}>Reload Page</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
