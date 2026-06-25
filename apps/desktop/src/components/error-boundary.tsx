import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { appendFrontendLog } from '@/lib/app-logs';
import { closeAllTabs, navigateTo } from '@/store';

interface Props {
  readonly children: ReactNode;
}

interface State {
  readonly error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    void appendFrontendLog({
      level: 'error',
      scope: 'error-boundary',
      message: error.message || 'React render crash',
      stack: error.stack,
      details: info.componentStack ?? undefined,
    });
  }

  handleReload = (): void => {
    this.setState({ error: null });
  };

  handleReset = (): void => {
    closeAllTabs();
    navigateTo('workspace');
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center">
          <AlertTriangle className="size-10 text-destructive" />
          <div className="space-y-1">
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="max-w-md text-sm text-muted-foreground">
              {this.state.error.message || 'An unexpected error occurred while rendering the UI.'}
            </p>
          </div>
          {this.state.error.stack && (
            <pre className="max-h-40 max-w-2xl overflow-auto rounded-md bg-muted/40 p-3 text-left text-[11px] text-muted-foreground">
              {this.state.error.stack}
            </pre>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={this.handleReset} className="gap-1.5">
              <RotateCcw className="size-4" />
              Reset workspace
            </Button>
            <Button onClick={this.handleReload} className="gap-1.5">
              <RefreshCw className="size-4" />
              Reload UI
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
