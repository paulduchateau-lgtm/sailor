import { Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./data/theme";
import HomePage from "./components/HomePage";
import WorkspaceShell from "./components/WorkspaceShell";

export default function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/:slug/*" element={<WorkspaceShell />} />
      </Routes>
    </ThemeProvider>
  );
}
