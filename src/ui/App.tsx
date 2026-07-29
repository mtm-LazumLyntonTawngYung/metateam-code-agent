import { useState } from "react";
import { Box, useInput, useWindowSize } from "ink";
import HomeScreen from "./Home";
import ChatView from "./ChatView";
import AgentSelector from "./AgentSelector";
import CommandPalette from "./CommandPalette";
import ConnectForm from "./ConnectForm";
import Statusbar from "./components/Statusbar";

type View = "home" | "chat" | "connect";

export default function App() {
  const [view, setView] = useState<View>("home");
  const [query, setQuery] = useState("");
  const [showAgents, setShowAgents] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const { columns, rows } = useWindowSize();

  useInput((_input, key) => {
    if (key.escape) {
      if (showAgents) { setShowAgents(false); return; }
      if (showCommands) { setShowCommands(false); return; }
      if (view !== "home") { setView("home"); return; }
      return;
    }
    if (key.tab && view === "home" && !showAgents && !showCommands) {
      setShowAgents(true);
      return;
    }
    if (key.ctrl && _input === "p" && view === "home" && !showAgents && !showCommands) {
      setShowCommands(true);
      return;
    }
  });

  const handleSubmit = (value: string) => {
    if (value.startsWith("/")) {
      if (value === "/connect" || value.startsWith("/connect ")) {
        setView("connect");
        setQuery("");
        return;
      }
    }
    if (value.trim()) {
      setView("chat");
    }
  };

  const handleSelectAgent = () => setShowAgents(false);

  const handleSelectCommand = (id: string) => {
    setShowCommands(false);
    if (id === "connect") setView("connect");
    if (id === "exit") process.exit(0);
  };

  const handleConnectSave = () => setView("home");

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      {view === "home" && !showAgents && !showCommands && (
        <HomeScreen
          query={query}
          onQueryChange={setQuery}
          onSubmit={handleSubmit}
        />
      )}
      {showAgents && <AgentSelector onSelect={handleSelectAgent} />}
      {showCommands && <CommandPalette onSelect={handleSelectCommand} />}
      {view === "chat" && (
        <ChatView query={query} onBack={() => setView("home")} />
      )}
      {view === "connect" && <ConnectForm onSave={handleConnectSave} />}
      <Statusbar />
    </Box>
  );
}
