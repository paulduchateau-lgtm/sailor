import { useState, useEffect } from "react";
import { X, FileText, User, Calendar, Tag, Loader2, Maximize2, Minimize2 } from "lucide-react";
import { useWorkspaceApi, useWorkspace } from "../lib/WorkspaceContext";

export default function DocumentPanel({ docId, onClose }) {
  const api = useWorkspaceApi();
  const { slug } = useWorkspace();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!docId) return;
    setLoading(true);
    api.getDocument(docId).then(d => { setDoc(d); setLoading(false); }).catch(() => setLoading(false));
  }, [docId]);

  const typeColor = (type) => {
    const colors = { pdf: "#C45A32", html: "#4A90B8", htm: "#4A90B8", docx: "#3A8A4A", doc: "#3A8A4A", xlsx: "#D4A03A", xls: "#D4A03A", csv: "#D4A03A", txt: "#8A8880" };
    return colors[type] || "var(--mp-text-muted)";
  };

  const rawUrl = api.getDocumentRawUrl(docId);

  return (
    <div style={{
      width: expanded ? "60%" : 440, minWidth: expanded ? 500 : 440,
      height: "100vh", position: "relative",
      background: "var(--mp-bg-elevated)",
      borderLeft: "1px solid var(--mp-border)",
      display: "flex", flexDirection: "column",
      transition: "width 0.25s ease",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 16px", borderBottom: "1px solid var(--mp-border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: doc ? typeColor(doc.type) : "var(--mp-text-muted)", flexShrink: 0 }} />
          <span style={{
            fontSize: 13, fontWeight: 500, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {loading ? "Chargement..." : (doc?.title || doc?.original_name || "Document")}
          </span>
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button onClick={() => setExpanded(!expanded)} style={{
            background: "none", border: "none", cursor: "pointer", padding: 4,
            display: "flex", alignItems: "center", borderRadius: "var(--radius-sm)",
          }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--mp-nav-hover)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            {expanded ? <Minimize2 size={14} color="var(--mp-text-muted)" /> : <Maximize2 size={14} color="var(--mp-text-muted)" />}
          </button>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer", padding: 4,
            display: "flex", alignItems: "center", borderRadius: "var(--radius-sm)",
          }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--mp-nav-hover)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <X size={14} color="var(--mp-text-muted)" />
          </button>
        </div>
      </div>

      {/* Metadata bar */}
      {doc && !loading && (
        <div style={{
          padding: "10px 16px", borderBottom: "1px solid var(--mp-border)",
          display: "flex", flexWrap: "wrap", gap: 12,
        }}>
          {doc.type && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontFamily: "var(--font-data)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em",
              background: "var(--mp-bg)", borderRadius: "var(--radius-pill)", padding: "3px 10px",
              color: typeColor(doc.type), border: `1px solid ${typeColor(doc.type)}33`,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: typeColor(doc.type) }} />
              {doc.type.toUpperCase()}
            </span>
          )}
          {doc.categorie && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--mp-text-muted)" }}>
              <Tag size={11} /> {doc.categorie}
            </span>
          )}
          {doc.auteur && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--mp-text-muted)" }}>
              <User size={11} /> {doc.auteur}
            </span>
          )}
          {doc.date_creation && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--mp-text-muted)" }}>
              <Calendar size={11} /> {doc.date_creation}
            </span>
          )}
          {doc.mots_cles && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--mp-text-muted)" }}>
              <FileText size={11} /> {doc.mots_cles}
            </span>
          )}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: 8 }}>
            <Loader2 size={16} color="var(--mp-accent)" style={{ animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 13, color: "var(--mp-text-muted)" }}>Chargement du document...</span>
          </div>
        ) : doc ? (
          <iframe
            src={rawUrl}
            title={doc.title || doc.original_name}
            style={{
              width: "100%", height: "100%", border: "none",
              background: "#FFFFFF",
            }}
          />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <p style={{ fontSize: 13, color: "var(--mp-text-muted)" }}>Document introuvable</p>
          </div>
        )}
      </div>
    </div>
  );
}
