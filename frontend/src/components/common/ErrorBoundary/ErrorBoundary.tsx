import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" style={{ margin: '24px', padding: '32px' }}>
          <AlertTriangle size={48} style={{ color: 'var(--error)', marginBottom: '16px' }} />
          <h2>Terjadi Kesalahan</h2>
          <p>{this.state.error?.message ?? 'Unknown error'}</p>
          <button className="btn btn-outline" onClick={this.handleReset}>
            <RefreshCw size={14} />
            Coba Lagi
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
