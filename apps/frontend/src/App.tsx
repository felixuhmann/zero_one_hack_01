import { ChatApp } from "@/components/chat/chat-app";
import { ThemeProvider } from "@/components/theme/theme-provider";

function App() {
  return (
    <ThemeProvider defaultTheme="system">
      <ChatApp />
    </ThemeProvider>
  );
}

export default App;
