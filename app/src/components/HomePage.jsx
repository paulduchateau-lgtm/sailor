import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, FileText, Calendar, Loader2, Compass, X, Check, Anchor } from "lucide-react";
import { listWorkspaces, createWorkspace, deleteWorkspace } from "../lib/api";

const INDUSTRIES = [
  { value: "assurance", label: "Assurance" },
  { value: "banque", label: "Banque" },
  { value: "mutuelle", label: "Mutuelle" },
  { value: "prevoyance", label: "Prévoyance" },
  { value: "institution_publique", label: "Institution publique" },
  { value: "autre", label: "Autre" },
];

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function WorkspaceCard({ workspace, onOpen, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!confirmDelete) { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000); return; }
    setDeleting(true);
    await onDelete(workspace.slug);
  };

  return (
    <div
      onClick={() => onOpen(workspace.slug)}
      style={{
        background: "var(--mp-bg-card)", border: "1px solid var(--mp-border)",
        borderRadius: "var(--radius-lg)", padding: 24, cursor: "pointer",
        transition: "border-color 200ms ease, box-shadow 200ms ease",
        display: "flex", flexDirection: "column", gap: 16,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--mp-accent)"; e.currentTarget.style.boxShadow = "0 0 0 1px var(--mp-accent), var(--mp-shadow)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--mp-border)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: "var(--radius-md)",
          background: "var(--mp-accent-dim)", border: "1px solid rgba(176, 216, 56, 0.15)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Compass size={18} color="var(--mp-accent)" />
        </div>
        <button
          onClick={handleDelete} disabled={deleting}
          style={{
            background: confirmDelete ? "rgba(196, 90, 50, 0.1)" : "transparent",
            border: confirmDelete ? "1px solid rgba(196, 90, 50, 0.3)" : "1px solid transparent",
            borderRadius: "var(--radius-sm)", padding: "5px 8px",
            cursor: deleting ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 5,
            color: confirmDelete ? "var(--mp-warm)" : "var(--mp-text-muted)",
            fontSize: 11, fontFamily: "var(--font-body)", transition: "all 150ms ease", flexShrink: 0,
          }}
          onMouseEnter={e => { if (!confirmDelete) { e.currentTarget.style.color = "var(--mp-warm)"; } }}
          onMouseLeave={e => { if (!confirmDelete) { e.currentTarget.style.color = "var(--mp-text-muted)"; } }}
        >
          {deleting ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> :
           confirmDelete ? <><Check size={12} /> Confirmer</> : <Trash2 size={13} />}
        </button>
      </div>

      <div>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 500, color: "var(--mp-text)", margin: "0 0 6px" }}>
          {workspace.name}
        </h3>
        {workspace.industry && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontFamily: "var(--font-data)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em",
            background: "var(--mp-accent-dim)", border: "1px solid rgba(176, 216, 56, 0.15)",
            borderRadius: "var(--radius-pill)", padding: "3px 10px", color: "var(--mp-accent-text)",
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--mp-accent)" }} />
            {INDUSTRIES.find(i => i.value === workspace.industry)?.label || workspace.industry}
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 16, paddingTop: 12, borderTop: "1px solid var(--mp-border-subtle)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <FileText size={12} color="var(--mp-text-muted)" />
          <span className="data-value" style={{ fontSize: 11, color: "var(--mp-text-muted)" }}>
            {workspace.doc_count || 0} doc{(workspace.doc_count || 0) !== 1 ? "s" : ""}
          </span>
        </div>
        {workspace.created_at && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
            <Calendar size={11} color="var(--mp-text-muted)" />
            <span className="data-value" style={{ fontSize: 10, color: "var(--mp-text-muted)" }}>
              {formatDate(workspace.created_at)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateForm({ onSubmit, onCancel, loading }) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const isValid = name.trim().length >= 2;

  return (
    <div style={{
      background: "var(--mp-bg-card)", border: "1px solid var(--mp-accent)",
      borderRadius: "var(--radius-lg)", padding: 24,
      boxShadow: "0 0 0 1px var(--mp-accent), var(--mp-shadow)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 500, margin: 0 }}>
          Nouvel espace documentaire
        </h3>
        <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--mp-text-muted)" }}>
          <X size={16} />
        </button>
      </div>

      <form onSubmit={e => { e.preventDefault(); if (isValid && !loading) onSubmit(name.trim(), industry); }} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label className="data-label" style={{ display: "block", marginBottom: 8 }}>Nom de l'espace</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ex : Documentation Mutuelle Horizon"
            autoFocus style={{
              width: "100%", padding: "10px 14px", background: "var(--mp-bg)", border: "1px solid var(--mp-border)",
              borderRadius: "var(--radius-sm)", color: "var(--mp-text)", fontSize: 14, fontFamily: "var(--font-body)", outline: "none", boxSizing: "border-box",
            }}
            onFocus={e => e.target.style.borderColor = "var(--mp-accent)"}
            onBlur={e => e.target.style.borderColor = "var(--mp-border)"}
          />
        </div>
        <div>
          <label className="data-label" style={{ display: "block", marginBottom: 8 }}>Secteur (optionnel)</label>
          <select value={industry} onChange={e => setIndustry(e.target.value)}
            style={{
              width: "100%", padding: "10px 14px", background: "var(--mp-bg)", border: "1px solid var(--mp-border)",
              borderRadius: "var(--radius-sm)", color: industry ? "var(--mp-text)" : "var(--mp-text-muted)",
              fontSize: 14, fontFamily: "var(--font-body)", outline: "none", cursor: "pointer", boxSizing: "border-box",
            }}>
            <option value="">Sélectionner...</option>
            {INDUSTRIES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onCancel} style={{
            background: "transparent", border: "1px solid var(--mp-border)", borderRadius: "var(--radius-md)",
            padding: "9px 20px", fontSize: 13, fontFamily: "var(--font-body)", cursor: "pointer", color: "var(--mp-text-muted)",
          }}>Annuler</button>
          <button type="submit" disabled={!isValid || loading} style={{
            background: isValid && !loading ? "var(--mp-accent)" : "var(--mp-border)",
            color: isValid && !loading ? "var(--mp-accent-on)" : "var(--mp-text-muted)",
            border: "none", borderRadius: "var(--radius-md)", padding: "9px 20px",
            fontSize: 13, fontWeight: 500, fontFamily: "var(--font-body)",
            cursor: isValid && !loading ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", gap: 7,
          }}>
            {loading ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Création...</> : <>Créer l'espace</>}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listWorkspaces();
      setWorkspaces(Array.isArray(data) ? data : (data.workspaces || []));
    } catch { setWorkspaces([]); }
    setLoading(false);
  };

  const handleCreate = async (name, industry) => {
    setCreating(true);
    try {
      const result = await createWorkspace(name, "", industry);
      const slug = result.slug || result.workspace?.slug;
      if (slug) navigate(`/${slug}`);
      else { await load(); setShowForm(false); }
    } catch {}
    setCreating(false);
  };

  const handleDelete = async (slug) => {
    try { await deleteWorkspace(slug); setWorkspaces(prev => prev.filter(w => w.slug !== slug)); } catch {}
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--mp-bg)", fontFamily: "var(--font-body)", color: "var(--mp-text)" }}>
      <header style={{
        padding: "0 40px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid var(--mp-border)", background: "var(--mp-bg-elevated)",
      }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 300, fontStyle: "italic", color: "var(--mp-accent-text)" }}>
              Sailor
            </span>
            <span className="data-label" style={{ marginLeft: 10, fontSize: 9 }}>v0.1</span>
          </div>
          <span style={{ fontFamily: "var(--font-data)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--mp-text-muted)", marginTop: 1 }}>
            by Lite Ops
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="data-label">Espaces documentaires</span>
          {!showForm && (
            <button onClick={() => setShowForm(true)} style={{
              background: "var(--mp-accent)", color: "var(--mp-accent-on)", border: "none",
              borderRadius: "var(--radius-md)", padding: "8px 18px", fontSize: 13, fontWeight: 500,
              fontFamily: "var(--font-body)", cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
            }}
              onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
              onMouseLeave={e => e.currentTarget.style.opacity = "1"}
            >
              <Plus size={14} /> Nouvel espace
            </button>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 1140, margin: "0 auto", padding: "48px 40px" }}>
        <div style={{ marginBottom: 40 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 400, margin: "0 0 8px" }}>
            Vos bases documentaires
          </h1>
          <p style={{ fontSize: 14, color: "var(--mp-text-muted)", lineHeight: 1.6 }}>
            Chaque espace contient un corpus de documents et un assistant IA pour naviguer dans vos connaissances.
          </p>
        </div>

        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
            {[1, 2, 3].map(i => <div key={i} style={{ background: "var(--mp-bg-card)", border: "1px solid var(--mp-border)", borderRadius: "var(--radius-lg)", padding: 24, height: 176, animation: "pulse-glow 2s ease-in-out infinite" }} />)}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20, alignItems: "start" }}>
            {showForm && <CreateForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} loading={creating} />}
            {workspaces.map(ws => <WorkspaceCard key={ws.slug} workspace={ws} onOpen={slug => navigate(`/${slug}`)} onDelete={handleDelete} />)}
            {!showForm && workspaces.length === 0 && (
              <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 24px", gap: 24 }}>
                <div style={{ position: "relative" }}>
                  <div style={{ width: 80, height: 80, borderRadius: "var(--radius-lg)", background: "var(--mp-bg-elevated)", border: "1px solid var(--mp-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Anchor size={32} color="var(--mp-text-muted)" />
                  </div>
                  <div style={{ position: "absolute", bottom: -6, right: -6, width: 24, height: 24, borderRadius: "50%", background: "var(--mp-accent-dim)", border: "1px solid var(--mp-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Plus size={13} color="var(--mp-accent)" />
                  </div>
                </div>
                <div style={{ textAlign: "center", maxWidth: 400 }}>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 400, margin: "0 0 10px" }}>Aucun espace documentaire</h2>
                  <p style={{ fontSize: 14, color: "var(--mp-text-muted)", lineHeight: 1.6 }}>
                    Créez votre premier espace pour importer vos documents et explorer votre base de connaissances avec l'IA.
                  </p>
                </div>
                <button onClick={() => setShowForm(true)} style={{
                  background: "var(--mp-accent)", color: "var(--mp-accent-on)", border: "none",
                  borderRadius: "var(--radius-md)", padding: "11px 28px", fontSize: 14, fontWeight: 500,
                  fontFamily: "var(--font-body)", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                }}>
                  <Plus size={16} /> Nouvel espace documentaire
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      <footer style={{ padding: "24px 40px", borderTop: "1px solid var(--mp-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="status-dot" />
          <span className="data-label">Données locales</span>
        </div>
        <span className="data-label">Lite Ops · Sailor</span>
      </footer>
    </div>
  );
}
