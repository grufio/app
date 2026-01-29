"use client"

/**
 * React error boundary for the editor surface.
 *
 * Responsibilities:
 * - Prevent editor crashes from taking down the full page.
 * - Provide a reset hook when project/image context changes.
 */
import React from "react"

import { Button } from "@/components/ui/button"

type Props = {
  children: React.ReactNode
  /**
   * When this changes, the boundary resets to a non-error state.
   * Use it to recover automatically when switching projects or images.
   */
  resetKey?: string
  /**
   * Optional side effect when the user presses \"Reload editor\".
   * Usually used to refresh data.
   */
  onReset?: () => void
}

type State = { hasError: boolean; error?: Error; resetKey?: string }

export class EditorErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: undefined, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: undefined, resetKey: this.props.resetKey })
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined })
    this.props.onReset?.()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6">
        <div className="text-sm font-medium">Editor crashed</div>
        <div className="max-w-[520px] text-center text-xs text-muted-foreground">
          Something went wrong while rendering the editor. You can try to reload the editor.
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="default" onClick={this.handleReset}>
            Reload editor
          </Button>
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
        {this.state.error ? (
          <pre className="mt-2 w-full max-w-[720px] overflow-auto rounded-md bg-muted p-3 text-[11px] leading-snug">
            {String(this.state.error.stack || this.state.error.message)}
          </pre>
        ) : null}
      </div>
    )
  }
}

