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
      <ThemeProvider defaultTheme="light">
        <div className="relative">
          <DecisionStudio />
          <div className="fixed bottom-3 right-3 z-50 flex items-center gap-1.5 rounded-full border border-black/10 bg-white/70 px-2 py-1 shadow-sm backdrop-blur">
            <Button type="button" size="sm" variant="ghost" className="h-7 text-black/60 hover:text-black" onClick={() => setView('chat')}>
              Chat
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 text-black/60 hover:text-black" onClick={() => setView('forecast')}>
              Pipeline
            </Button>
          </div>
        </div>
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
            variant={view === 'chat' ? 'default' : 'outline'}
            onClick={() => setView('chat')}
          >
            Chat
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === 'forecast' ? 'default' : 'outline'}
            onClick={() => setView('forecast')}
          >
            Forecast pipeline
          </Button>
        </header>
        <main className="flex-1">
          {view === 'chat' ? <ChatApp /> : <ForecastDashboard />}
        </main>
      </div>
    </ThemeProvider>
  )
}

export default App
