import { useState } from 'react'

import { ChatApp } from '@/components/chat/chat-app'
import { ForecastDashboard } from '@/components/ForecastDashboard'
import { DecisionStudio } from '@/studio/DecisionStudio'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { Button } from '@/components/ui/button'

type AppView = 'studio' | 'chat' | 'forecast'

function App() {
  const [view, setView] = useState<AppView>('studio')

  if (view === 'studio') {
    return (
      <ThemeProvider defaultTheme="system">
        <DecisionStudio onOpenChat={() => setView('chat')} />
      </ThemeProvider>
    )
  }

  if (view === 'chat') {
    return (
      <ThemeProvider defaultTheme="system">
        <ChatApp
          onNavigateToForecast={() => setView('forecast')}
          onNavigateToStudio={() => setView('studio')}
        />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider defaultTheme="system">
      <div className="flex min-h-svh flex-col">
        <header className="flex items-center gap-2 border-b border-border px-4 py-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setView('studio')}
          >
            Decision Studio
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setView('chat')}
          >
            Chat
          </Button>
          <Button
            type="button"
            size="sm"
            variant="default"
            onClick={() => setView('forecast')}
          >
            Forecast pipeline
          </Button>
        </header>
        <main className="flex-1">
          <ForecastDashboard />
        </main>
      </div>
    </ThemeProvider>
  )
}

export default App
