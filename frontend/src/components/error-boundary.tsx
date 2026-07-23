import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="page min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center hand-drawn lined thin p-8 bg-[#F9F5E6]">
          <div className="mb-4 text-4xl">😿</div>
          <h2 className="text-lg font-bold mb-2">Something went wrong</h2>
          <p className="text-sm opacity-60 mb-6 leading-relaxed">
            Clipcat hit an unexpected error. Don't worry — your clips are safe.
          </p>
          <button
            onClick={this.handleReload}
            className="hand-drawn-btn lined thin px-4 py-2 text-sm font-bold hover:opacity-70 transition-opacity bg-amber-100 text-amber-900"
          >
            Reload Clipcat
          </button>
          {this.state.error && (
            <details className="mt-4 text-left">
              <summary className="text-[10px] opacity-40 cursor-pointer hover:opacity-60">
                Error details
              </summary>
              <pre className="mt-2 text-[10px] opacity-30 whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                {this.state.error.message}
              </pre>
            </details>
          )}
        </div>
      </main>
    );
  }
}
