import Page from "./features/app-shell/components/page"
import ErrorBoundary from "./components/error-boundary"

function App() {
  return (
    <ErrorBoundary>
      <main className="page min-h-screen md:pt-16">
        <div className="app-boundary">
          <Page />
        </div>
      </main>
    </ErrorBoundary>
  )
}

export default App
