import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X, MessageSquare, Settings, Menu, Sun, Moon, RotateCcw, Wifi, WifiOff, Loader2, ArrowLeft, FileText } from "lucide-react";
import { useTheme } from "../data/theme";
import { getAiMode, setAiMode } from "../lib/api";
import { useWorkspace } from "../lib/WorkspaceContext";

const NAV_ITEMS = [
  { id: "chat", Icon: MessageSquare, label: "Explorer" },
  { id: "documents", Icon: FileText, label: "Documents" },
];

function AiModeToggle() {
  const [mode, setMode] = useState(null);
  const [providers, setProviders] = useState({});
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getAiMode()
      .then(data => { setMode(data.mode); setProviders(data.providers || {}); })
      .catch(() => setMode("premium"));
  }, []);

  const handleToggle = async () => {
    const newMode = mode === "local" ? "premium" : "local";
    setSwitching(true); setError(null);
    try {
      const result = await setAiMode(newMode);
      if (result.error) setError(result.hint || result.error);
      else { setMode(result.mode); setProviders(result.providers || {}); }
    } catch { setError("Erreur de connexion"); }
    setSwitching(false);
  };

  if (mode === null) return null;
  const isLocal = mode === "local";

  return (
    <div style={{ padding: "0 8px" }}>
      <button onClick={handleToggle} disabled={switching}
        onMouseEnter={e => e.currentTarget.style.background = "var(--mp-nav-hover)"}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
          background: "transparent", border: "none", borderRadius: "var(--radius-sm)",
          cursor: switching ? "wait" : "pointer", color: "var(--mp-text-muted)",
          fontSize: 12, fontFamily: "var(--font-body)", transition: "background 200ms ease",
          opacity: switching ? 0.6 : 1,
        }}>
        {switching ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} /> :
         isLocal ? <WifiOff size={14} color="var(--mp-success)" style={{ flexShrink: 0 }} /> :
         <Wifi size={14} color="var(--mp-signal)" style={{ flexShrink: 0 }} />}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
          <span style={{
            fontFamily: "var(--font-data)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em",
            color: isLocal ? "var(--mp-success)" : "var(--mp-signal)",
          }}>{isLocal ? "Local" : "Premium"}</span>
          <span style={{ fontSize: 11, color: "var(--mp-text-muted)" }}>
            {isLocal ? "Ollama · mistral:7b" : providers.anthropic ? "Claude · Anthropic" : "Ollama fallback"}
          </span>
        </div>
      </button>
      {error && <p style={{ fontSize: 10, color: "var(--mp-warm)", padding: "4px 12px 0", margin: 0, lineHeight: 1.4 }}>{error}</p>}
    </div>
  );
}

export default function Sidebar({ page, setPage, sidebarOpen, setSidebarOpen, onStartOnboarding }) {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const { workspace } = useWorkspace();

  if (!sidebarOpen) {
    return (
      <button onClick={() => setSidebarOpen(true)} style={{
        position: "fixed", top: 16, left: 16, zIndex: 50, width: 40, height: 40,
        borderRadius: "var(--radius-md)", background: "var(--mp-bg-card)",
        border: "1px solid var(--mp-border)", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--mp-shadow)",
      }}>
        <Menu size={18} color="var(--mp-text-muted)" />
      </button>
    );
  }

  return (
    <div style={{
      width: 260, minWidth: 260, background: "var(--mp-bg-elevated)",
      borderRight: "1px solid var(--mp-border)", display: "flex", flexDirection: "column",
      transition: "background 0.35s, border-color 0.35s",
    }}>
      {/* Logo */}
      <div style={{ padding: "20px 20px 16px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid var(--mp-border)" }}>
        <button onClick={() => setSidebarOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex" }}>
          <X size={18} color="var(--mp-text-muted)" />
        </button>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 300, fontStyle: "italic", color: "var(--mp-accent-text)" }}>
              Sailor
            </span>
            <span className="data-label" style={{ marginLeft: 6, fontSize: 9 }}>v0.1</span>
          </div>
          <span style={{ fontFamily: "var(--font-data)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--mp-text-muted)", marginTop: 2 }}>
            by Lite Ops
          </span>
        </div>
      </div>

      {/* Workspace name */}
      {workspace && (
        <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--mp-border)" }}>
          <p style={{ fontSize: 13, fontWeight: 500, margin: 0, color: "var(--mp-text)" }}>{workspace.name}</p>
          <p className="data-label" style={{ marginTop: 4, fontSize: 9 }}>
            {workspace.doc_count || 0} documents · {workspace.chunk_count || 0} fragments
          </p>
        </div>
      )}

      {/* Nav */}
      <div style={{ padding: "12px 8px", flex: 1, display: "flex", flexDirection: "column" }}>
        <div>
          {NAV_ITEMS.map(it => {
            const NavIcon = it.Icon;
            const isActive = page === it.id;
            return (
              <button key={it.id} onClick={() => setPage(it.id)}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--mp-nav-hover)"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px", marginBottom: 2,
                  background: isActive ? "var(--mp-accent-dim)" : "transparent",
                  border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer",
                  color: isActive ? "var(--mp-accent-text)" : "var(--mp-text-secondary)",
                  fontSize: 13, fontWeight: isActive ? 500 : 400, fontFamily: "var(--font-body)",
                  transition: "background-color 120ms ease, color 120ms ease",
                }}>
                <NavIcon size={15} />
                <span>{it.label}</span>
              </button>
            );
          })}
        </div>
        <div style={{ flex: 1 }} />
      </div>

      {/* Reset onboarding */}
      {onStartOnboarding && (
        <div style={{ padding: "0 8px" }}>
          <button onClick={onStartOnboarding}
            onMouseEnter={e => e.currentTarget.style.background = "var(--mp-nav-hover)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
              background: "transparent", border: "none", borderRadius: "var(--radius-sm)",
              cursor: "pointer", color: "var(--mp-text-muted)", fontSize: 12, fontFamily: "var(--font-body)",
            }}>
            <RotateCcw size={13} /> <span>Réinitialiser l'espace</span>
          </button>
        </div>
      )}

      {/* Back */}
      <div style={{ padding: "0 8px" }}>
        <button onClick={() => navigate("/")}
          onMouseEnter={e => e.currentTarget.style.background = "var(--mp-nav-hover)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
            background: "transparent", border: "none", borderRadius: "var(--radius-sm)",
            cursor: "pointer", color: "var(--mp-text-muted)", fontSize: 12, fontFamily: "var(--font-body)",
          }}>
          <ArrowLeft size={13} /> <span>Retour à l'accueil</span>
        </button>
      </div>

      <AiModeToggle />

      {/* Theme */}
      <div style={{ padding: "4px 8px 0" }}>
        <button onClick={toggle} style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
          background: "var(--mp-nav-hover)", border: "1px solid var(--mp-border)",
          borderRadius: "var(--radius-sm)", cursor: "pointer", color: "var(--mp-text-muted)",
          fontSize: 12, fontFamily: "var(--font-body)",
        }}>
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          <span>{theme === "dark" ? "Mode clair" : "Mode sombre"}</span>
        </button>
      </div>

      <div style={{ padding: "12px 16px", borderTop: "1px solid var(--mp-border)", marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
        <div className="status-dot" />
        <span className="data-label" style={{ fontSize: 11 }}>Base indexée</span>
      </div>
    </div>
  );
}
