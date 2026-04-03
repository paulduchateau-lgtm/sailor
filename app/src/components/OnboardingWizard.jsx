import { useState, useRef } from "react";
import { Upload, FileText, Check, Loader2, Compass, X, File } from "lucide-react";
import { useWorkspaceApi } from "../lib/WorkspaceContext";

const ACCEPTED = ".pdf,.html,.htm,.docx,.doc,.xlsx,.xls,.csv,.txt,.md,.zip";

export default function OnboardingWizard({ onComplete, initialStep }) {
  const api = useWorkspaceApi();
  const [step, setStep] = useState(initialStep === "complete" ? 1 : (initialStep || 1));
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [context, setContext] = useState({ project_name: "", description: "", objectives: "" });
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (fileList) => {
    const arr = Array.from(fileList).filter(f => {
      const ext = f.name.split(".").pop().toLowerCase();
      return ["pdf", "html", "htm", "docx", "doc", "xlsx", "xls", "csv", "txt", "md", "zip"].includes(ext);
    });
    setFiles(prev => [...prev, ...arr]);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const result = await api.uploadFiles(files);
      setUploadResult(result);
      setStep(2);
    } catch (err) {
      setUploadResult({ error: err.message });
    }
    setUploading(false);
  };

  const handleSaveContext = async () => {
    setSaving(true);
    try {
      await api.saveContext(context);
      onComplete();
    } catch {}
    setSaving(false);
  };

  const handleSkipContext = () => {
    onComplete();
  };

  const removeFile = (idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <div style={{
      minHeight: "100vh", background: "var(--mp-bg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font-body)", color: "var(--mp-text)",
    }}>
      <div style={{ maxWidth: 600, width: "100%", padding: "40px 24px" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 4 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 300, fontStyle: "italic", color: "var(--mp-accent-text)" }}>
              Sailor
            </span>
            <span className="data-label" style={{ marginLeft: 8 }}>v0.1</span>
          </div>
          <p style={{ fontFamily: "var(--font-data)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--mp-text-muted)", marginTop: 4 }}>
            by Lite Ops
          </p>
        </div>

        {/* Steps indicator */}
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 40 }}>
          {[1, 2].map(s => (
            <div key={s} style={{
              width: 32, height: 4, borderRadius: 2,
              background: step >= s ? "var(--mp-accent)" : "var(--mp-border)",
              transition: "background 0.3s ease",
            }} />
          ))}
        </div>

        {/* Step 1: Upload documents */}
        {step === 1 && (
          <div className="fade-up">
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{
                width: 56, height: 56, borderRadius: "var(--radius-lg)",
                background: "var(--mp-accent-dim)", margin: "0 auto 16px",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Upload size={24} color="var(--mp-accent)" />
              </div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 400, margin: "0 0 8px" }}>
                Importez vos documents
              </h2>
              <p style={{ fontSize: 14, color: "var(--mp-text-muted)", lineHeight: 1.6 }}>
                PDF, HTML, Word, Excel, TXT ou un fichier ZIP contenant l'ensemble de votre documentation.
              </p>
            </div>

            {/* Drop zone */}
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
              style={{
                border: `2px dashed ${dragOver ? "var(--mp-accent)" : "var(--mp-border)"}`,
                borderRadius: "var(--radius-lg)", padding: "40px 24px",
                textAlign: "center", cursor: "pointer",
                background: dragOver ? "var(--mp-accent-dim)" : "var(--mp-bg-card)",
                transition: "all 0.2s ease",
              }}
            >
              <Compass size={32} color="var(--mp-text-muted)" style={{ marginBottom: 12 }} />
              <p style={{ fontSize: 14, color: "var(--mp-text-secondary)", margin: "0 0 4px" }}>
                Glissez vos fichiers ici ou cliquez pour sélectionner
              </p>
              <p className="data-label" style={{ fontSize: 10 }}>
                PDF · HTML · DOCX · XLSX · CSV · TXT · ZIP
              </p>
              <input ref={fileRef} type="file" accept={ACCEPTED} multiple
                onChange={e => handleFiles(e.target.files)} style={{ display: "none" }} />
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 4 }}>
                {files.map((f, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                    background: "var(--mp-bg-elevated)", borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--mp-border)",
                  }}>
                    <File size={14} color="var(--mp-accent)" />
                    <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                    <span className="data-value" style={{ fontSize: 10, color: "var(--mp-text-muted)" }}>
                      {(f.size / 1024).toFixed(0)} Ko
                    </span>
                    <button onClick={() => removeFile(i)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                      <X size={12} color="var(--mp-text-muted)" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {uploadResult?.error && (
              <p style={{ fontSize: 13, color: "var(--mp-warm)", marginTop: 12 }}>{uploadResult.error}</p>
            )}

            <button
              onClick={handleUpload} disabled={files.length === 0 || uploading}
              style={{
                width: "100%", marginTop: 24, padding: "12px 24px",
                background: files.length > 0 && !uploading ? "var(--mp-accent)" : "var(--mp-border)",
                color: files.length > 0 && !uploading ? "var(--mp-accent-on)" : "var(--mp-text-muted)",
                border: "none", borderRadius: "var(--radius-md)",
                fontSize: 14, fontWeight: 500, fontFamily: "var(--font-body)",
                cursor: files.length > 0 && !uploading ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
              {uploading ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Indexation en cours...</> :
               <><Upload size={16} /> Importer {files.length} fichier{files.length > 1 ? "s" : ""}</>}
            </button>
          </div>
        )}

        {/* Step 2: Context */}
        {step === 2 && (
          <div className="fade-up">
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{
                width: 56, height: 56, borderRadius: "var(--radius-lg)",
                background: "var(--mp-accent-dim)", margin: "0 auto 16px",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Check size={24} color="var(--mp-accent)" />
              </div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 400, margin: "0 0 8px" }}>
                {uploadResult?.documents?.length || 0} documents indexés
              </h2>
              <p style={{ fontSize: 14, color: "var(--mp-text-muted)", lineHeight: 1.6 }}>
                Ajoutez un peu de contexte pour que l'IA comprenne mieux votre base documentaire.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label className="data-label" style={{ display: "block", marginBottom: 8 }}>Nom du projet</label>
                <input type="text" value={context.project_name} onChange={e => setContext(p => ({ ...p, project_name: e.target.value }))}
                  placeholder="Ex : Documentation Mutuelle Prévoyance Horizon"
                  style={{
                    width: "100%", padding: "10px 14px", background: "var(--mp-bg-card)", border: "1px solid var(--mp-border)",
                    borderRadius: "var(--radius-sm)", color: "var(--mp-text)", fontSize: 14, fontFamily: "var(--font-body)",
                    outline: "none", boxSizing: "border-box",
                  }}
                  onFocus={e => e.target.style.borderColor = "var(--mp-accent)"}
                  onBlur={e => e.target.style.borderColor = "var(--mp-border)"}
                />
              </div>
              <div>
                <label className="data-label" style={{ display: "block", marginBottom: 8 }}>Description (optionnel)</label>
                <textarea value={context.description} onChange={e => setContext(p => ({ ...p, description: e.target.value }))}
                  placeholder="De quoi parle cette documentation ?"
                  rows={3}
                  style={{
                    width: "100%", padding: "10px 14px", background: "var(--mp-bg-card)", border: "1px solid var(--mp-border)",
                    borderRadius: "var(--radius-sm)", color: "var(--mp-text)", fontSize: 14, fontFamily: "var(--font-body)",
                    outline: "none", resize: "vertical", boxSizing: "border-box",
                  }}
                  onFocus={e => e.target.style.borderColor = "var(--mp-accent)"}
                  onBlur={e => e.target.style.borderColor = "var(--mp-border)"}
                />
              </div>
              <div>
                <label className="data-label" style={{ display: "block", marginBottom: 8 }}>Objectifs (optionnel)</label>
                <textarea value={context.objectives} onChange={e => setContext(p => ({ ...p, objectives: e.target.value }))}
                  placeholder="Que cherchez-vous à accomplir avec cette base ?"
                  rows={2}
                  style={{
                    width: "100%", padding: "10px 14px", background: "var(--mp-bg-card)", border: "1px solid var(--mp-border)",
                    borderRadius: "var(--radius-sm)", color: "var(--mp-text)", fontSize: 14, fontFamily: "var(--font-body)",
                    outline: "none", resize: "vertical", boxSizing: "border-box",
                  }}
                  onFocus={e => e.target.style.borderColor = "var(--mp-accent)"}
                  onBlur={e => e.target.style.borderColor = "var(--mp-border)"}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button onClick={handleSkipContext} style={{
                flex: 1, padding: "12px 24px", background: "transparent",
                border: "1px solid var(--mp-border)", borderRadius: "var(--radius-md)",
                fontSize: 14, fontFamily: "var(--font-body)", cursor: "pointer", color: "var(--mp-text-muted)",
              }}>
                Passer
              </button>
              <button onClick={handleSaveContext} disabled={saving} style={{
                flex: 1, padding: "12px 24px",
                background: "var(--mp-accent)", color: "var(--mp-accent-on)",
                border: "none", borderRadius: "var(--radius-md)",
                fontSize: 14, fontWeight: 500, fontFamily: "var(--font-body)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
                {saving ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Compass size={16} />}
                Commencer l'exploration
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
