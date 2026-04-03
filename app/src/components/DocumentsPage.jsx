import { useState, useEffect } from "react";
import { FileText, Search, Tag, User, Calendar, ExternalLink } from "lucide-react";
import { useWorkspaceApi } from "../lib/WorkspaceContext";

export default function DocumentsPage({ setPreviewDoc }) {
  const api = useWorkspaceApi();
  const [docs, setDocs] = useState([]);
  const [filter, setFilter] = useState("");
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.getDocuments().then(d => setDocs(d.documents || [])).catch(() => {});
    api.getStats().then(setStats).catch(() => {});
  }, []);

  const filtered = docs.filter(d => {
    const q = filter.toLowerCase();
    if (!q) return true;
    return (d.title || "").toLowerCase().includes(q) ||
           (d.categorie || "").toLowerCase().includes(q) ||
           (d.original_name || "").toLowerCase().includes(q) ||
           (d.mots_cles || "").toLowerCase().includes(q);
  });

  const typeColor = (type) => {
    const colors = { pdf: "#C45A32", html: "#4A90B8", htm: "#4A90B8", docx: "#3A8A4A", doc: "#3A8A4A", xlsx: "#D4A03A", xls: "#D4A03A", csv: "#D4A03A" };
    return colors[type] || "var(--mp-text-muted)";
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "14px 24px", borderBottom: "1px solid var(--mp-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 400, margin: 0, fontFamily: "var(--font-display)" }}>Documents</h2>
          <p style={{ fontSize: 12, color: "var(--mp-text-muted)", margin: 0, marginTop: 2 }}>
            {docs.length} document{docs.length !== 1 ? "s" : ""} indexés
            {stats ? ` · ${stats.chunks} fragments` : ""}
          </p>
        </div>

        {/* Stats badges */}
        {stats && stats.categories && (
          <div style={{ display: "flex", gap: 6 }}>
            {stats.categories.slice(0, 5).map(cat => (
              <span key={cat} style={{
                fontFamily: "var(--font-data)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em",
                background: "var(--mp-accent-dim)", borderRadius: "var(--radius-pill)", padding: "3px 10px",
                color: "var(--mp-accent-text)", border: "1px solid rgba(176, 216, 56, 0.15)",
                display: "inline-flex", alignItems: "center", gap: 5,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--mp-accent)" }} />
                {cat}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Search */}
      <div style={{ padding: "12px 24px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--mp-bg-input)", borderRadius: "var(--radius-sm)",
          padding: "8px 12px", border: "1px solid var(--mp-border)",
        }}>
          <Search size={14} color="var(--mp-text-muted)" />
          <input value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="Filtrer par titre, catégorie, mot-clé..."
            style={{
              flex: 1, background: "none", border: "none", outline: "none",
              color: "var(--mp-text)", fontSize: 13, fontFamily: "var(--font-body)",
            }} />
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 24px 24px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Document", "Catégorie", "Auteur", "Date", "Type", ""].map((h, i) => (
                <th key={i} style={{
                  textAlign: "left", padding: "8px 12px",
                  fontFamily: "var(--font-data)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em",
                  color: "var(--mp-text-muted)", borderBottom: "1px solid var(--mp-border)",
                  background: "var(--mp-bg-elevated)",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(doc => (
              <tr key={doc.id}
                style={{ transition: "background 0.1s ease", cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--mp-accent-subtle)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                onClick={() => setPreviewDoc && setPreviewDoc(doc.id)}
              >
                <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--mp-border-subtle)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: typeColor(doc.type), flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 400 }}>{doc.title || doc.original_name}</span>
                  </div>
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--mp-border-subtle)" }}>
                  {doc.categorie && <span style={{ fontSize: 11, color: "var(--mp-text-muted)" }}>{doc.categorie}</span>}
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--mp-border-subtle)" }}>
                  {doc.auteur && <span style={{ fontSize: 11, color: "var(--mp-text-muted)" }}>{doc.auteur}</span>}
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--mp-border-subtle)" }}>
                  <span className="data-value" style={{ fontSize: 11, color: "var(--mp-text-muted)" }}>{doc.date_creation || ""}</span>
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--mp-border-subtle)" }}>
                  <span style={{
                    fontFamily: "var(--font-data)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em",
                    color: typeColor(doc.type),
                  }}>{doc.type}</span>
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--mp-border-subtle)" }}>
                  <ExternalLink size={12} color="var(--mp-text-muted)" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p style={{ textAlign: "center", padding: 40, fontSize: 13, color: "var(--mp-text-muted)" }}>
            Aucun document{filter ? " correspondant" : ""}
          </p>
        )}
      </div>
    </div>
  );
}
