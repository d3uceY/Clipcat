import { useEffect } from "react"
import Page from "./components/page"
import ErrorBoundary from "./components/error-boundary"
import { preloadSounds } from "./helpers/playSound"

function App() {

  useEffect(() => {
    // Preload all sound files when app starts
    preloadSounds();
  }, []);

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
