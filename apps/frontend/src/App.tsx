import { useState } from 'react'

import { ChatApp } from '@/components/chat/chat-app'
import { ForecastDashboard } from '@/components/ForecastDashboard'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { Button } from '@/components/ui/button'

type AppView = 'chat' | 'forecast'

function App() {
  const [view, setView] = useState<AppView>('chat')

  return (
    <ThemeProvider defaultTheme="system">
      <div className="flex min-h-svh flex-col">
        <header className="flex items-center gap-2 border-b border-border px-4 py-2">
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
