import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Database from "better-sqlite3";
import { v4 as uuid } from "uuid";
import mammoth from "mammoth";
import * as cheerio from "cheerio";
import XLSX from "xlsx";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3003;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "sailor.db");
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, "uploads");

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ── Database ────────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    industry TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT DEFAULT '',
    categorie TEXT DEFAULT '',
    auteur TEXT DEFAULT '',
    date_creation TEXT DEFAULT '',
    mots_cles TEXT DEFAULT '',
    content_text TEXT DEFAULT '',
    content_html TEXT DEFAULT '',
    file_size INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    tokens_approx INTEGER DEFAULT 0,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chunk_terms (
    chunk_id TEXT NOT NULL,
    term TEXT NOT NULL,
    tf REAL NOT NULL,
    FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_chunk_terms_term ON chunk_terms(term);
  CREATE INDEX IF NOT EXISTS idx_chunks_workspace ON chunks(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents(workspace_id);

  CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    title TEXT DEFAULT 'Nouvelle conversation',
    messages TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS workspace_context (
    id TEXT PRIMARY KEY,
    workspace_id TEXT UNIQUE NOT NULL,
    project_name TEXT DEFAULT '',
    description TEXT DEFAULT '',
    objectives TEXT DEFAULT '',
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  );
`);

// ── V2 Migration: add embedding columns ─────────────────────────────────────
try {
  db.exec(`ALTER TABLE chunks ADD COLUMN embedding BLOB`);
} catch { /* column already exists */ }
try {
  db.exec(`ALTER TABLE chunks ADD COLUMN embed_model TEXT`);
} catch { /* column already exists */ }
try {
  db.exec(`ALTER TABLE chunks ADD COLUMN embed_dim INTEGER`);
} catch { /* column already exists */ }

// ── Connectivity state ──────────────────────────────────────────────────────
let isOnline = true;

async function checkConnectivity() {
  try {
    const r = await fetch("https://api.mistral.ai/v1/models", {
      method: "GET",
      headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY || "test"}` },
      signal: AbortSignal.timeout(5000),
    });
    isOnline = r.ok || r.status === 401 || r.status === 403; // any response = network up
  } catch {
    isOnline = false;
  }
  return isOnline;
}

// Check connectivity at boot and every 60s
checkConnectivity().then((online) => {
  console.log(`  🌐 Connectivité : ${online ? "ONLINE (Mistral + Voyage AI)" : "OFFLINE (Ministral 3B local)"}`);
});
setInterval(checkConnectivity, 60_000);

// ── IDF cache (workspace-scoped, BM25 fallback) ────────────────────────────
const idfCache = new Map();

function buildIdf(workspaceId) {
  const totalChunks = db.prepare("SELECT COUNT(*) as c FROM chunks WHERE workspace_id = ?").get(workspaceId).c;
  if (totalChunks === 0) return new Map();
  const rows = db.prepare(`
    SELECT term, COUNT(DISTINCT chunk_id) as df
    FROM chunk_terms ct JOIN chunks c ON ct.chunk_id = c.id
    WHERE c.workspace_id = ? GROUP BY term
  `).all(workspaceId);
  const idf = new Map();
  for (const r of rows) {
    idf.set(r.term, Math.log((totalChunks - r.df + 0.5) / (r.df + 0.5) + 1));
  }
  return idf;
}

function getIdf(workspaceId) {
  if (!idfCache.has(workspaceId)) idfCache.set(workspaceId, buildIdf(workspaceId));
  return idfCache.get(workspaceId);
}

function invalidateIdf(workspaceId) { idfCache.delete(workspaceId); }

// ── Text processing ─────────────────────────────────────────────────────────
function tokenize(text) {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function computeTf(tokens) {
  const freq = {};
  for (const t of tokens) freq[t] = (freq[t] || 0) + 1;
  const max = Math.max(...Object.values(freq), 1);
  const tf = {};
  for (const [term, count] of Object.entries(freq)) tf[term] = count / max;
  return tf;
}

// ── Document parsing ────────────────────────────────────────────────────────
async function parseDocument(filePath, type, originalName) {
  let text = "";
  let html = "";
  try {
    if (type === "html" || type === "htm") {
      const raw = fs.readFileSync(filePath, "utf-8");
      html = raw;
      const $ = cheerio.load(raw);
      $("script, style, head").remove();
      text = $("body").text().replace(/\s+/g, " ").trim();
    } else if (type === "pdf") {
      try {
        const pdfParse = (await import("pdf-parse")).default;
        const buf = fs.readFileSync(filePath);
        const data = await pdfParse(buf);
        text = data.text || "";
      } catch {
        try { text = fs.readFileSync(filePath, "utf-8"); } catch { text = ""; }
      }
    } else if (type === "docx" || type === "doc") {
      const buf = fs.readFileSync(filePath);
      const result = await mammoth.extractRawText({ buffer: buf });
      text = result.value || "";
    } else if (type === "xlsx" || type === "xls" || type === "csv") {
      const wb = XLSX.readFile(filePath);
      const texts = [];
      for (const name of wb.SheetNames) {
        const sheet = wb.Sheets[name];
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        for (const row of json) texts.push(row.filter(Boolean).join(" | "));
      }
      text = texts.join("\n");
    } else if (type === "txt" || type === "md") {
      text = fs.readFileSync(filePath, "utf-8");
    } else {
      try { text = fs.readFileSync(filePath, "utf-8"); } catch { text = ""; }
    }
  } catch (err) {
    console.error(`Error parsing ${originalName}:`, err.message);
    text = "";
  }
  return { text, html };
}

// ── Chunking ────────────────────────────────────────────────────────────────
function chunkText(text, chunkSize = 500, overlap = 100) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const chunks = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    const chunk = words.slice(start, end).join(" ");
    if (chunk.trim().length > 20) chunks.push(chunk.trim());
    if (end >= words.length) break;
    start += chunkSize - overlap;
  }
  return chunks;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── EMBEDDING ENGINE (Voyage AI / Ollama nomic-embed-text) ──────────────────
// ══════════════════════════════════════════════════════════════════════════════

async function embedTexts(texts, inputType = "document") {
  if (isOnline) {
    // Priority: Mistral Embed (more generous rate limits), then Voyage AI, then Ollama
    if (process.env.MISTRAL_API_KEY) {
      try { return await embedWithMistral(texts); }
      catch (err) { console.error("  ⚠ Mistral embed failed, trying Voyage:", err.message); }
    }
    if (process.env.VOYAGE_API_KEY) {
      try { return await embedWithVoyage(texts, inputType); }
      catch (err) { console.error("  ⚠ Voyage embed failed, trying Ollama:", err.message); }
    }
  }
  return embedWithOllama(texts);
}

async function embedWithMistral(texts) {
  const apiKey = process.env.MISTRAL_API_KEY;
  const model = "mistral-embed";
  const batchSize = 16;
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch("https://api.mistral.ai/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input: batch }),
      });

      if (res.status === 429) {
        const wait = Math.pow(2, attempt + 1) * 3000;
        console.log(`  ⏳ Mistral embed rate limit, retry dans ${wait / 1000}s...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Mistral embed error ${res.status}: ${err}`);
      }

      const data = await res.json();
      for (const item of data.data) {
        allEmbeddings.push({ embedding: item.embedding, model, dim: item.embedding.length });
      }
      break;
    }
    // Small pause between batches
    if (i + batchSize < texts.length) await new Promise(r => setTimeout(r, 500));
  }
  return allEmbeddings;
}

async function embedWithVoyage(texts, inputType = "document") {
  const apiKey = process.env.VOYAGE_API_KEY;
  const model = process.env.VOYAGE_MODEL || "voyage-3-lite";
  const batchSize = 8; // Small batches to stay under free-tier TPM limits
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    // Retry with exponential backoff for rate limits
    let lastError;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await fetch("https://api.voyageai.com/v1/embeddings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ model, input: batch, input_type: inputType }),
        });

        if (res.status === 429) {
          const wait = Math.pow(2, attempt + 1) * 5000; // 10s, 20s, 40s, 80s, 160s
          console.log(`  ⏳ Voyage AI rate limit, retry dans ${wait / 1000}s (tentative ${attempt + 1}/5)...`);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Voyage AI error ${res.status}: ${err}`);
        }

        const data = await res.json();
        for (const item of data.data) {
          allEmbeddings.push({ embedding: item.embedding, model, dim: item.embedding.length });
        }
        // Small delay between batches to respect RPM
        if (i + batchSize < texts.length) {
          await new Promise(r => setTimeout(r, 1500));
        }
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (attempt < 4) {
          const wait = Math.pow(2, attempt) * 3000;
          await new Promise(r => setTimeout(r, wait));
        }
      }
    }
    if (lastError) throw lastError;
  }
  return allEmbeddings;
}

async function embedWithOllama(texts) {
  const base = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const model = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
  const results = [];

  for (const text of texts) {
    const res = await fetch(`${base}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: text }),
    });
    if (!res.ok) throw new Error(`Ollama embed error ${res.status}`);
    const data = await res.json();
    const emb = data.embeddings?.[0] || data.embedding || [];
    results.push({ embedding: emb, model, dim: emb.length });
  }
  return results;
}

// ── Vector utilities ────────────────────────────────────────────────────────

function embeddingToBuffer(embedding) {
  const arr = new Float32Array(embedding);
  return Buffer.from(arr.buffer);
}

function bufferToEmbedding(buf) {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Float32Array(ab);
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Vector search ───────────────────────────────────────────────────────────

async function searchVectors(workspaceId, query, topK = 8) {
  // Check if workspace has embedded chunks
  const embeddedCount = db.prepare(
    "SELECT COUNT(*) as c FROM chunks WHERE workspace_id = ? AND embedding IS NOT NULL"
  ).get(workspaceId).c;

  if (embeddedCount === 0) {
    // Fallback to BM25
    console.log("  ⚡ Fallback BM25 (pas de vecteurs)");
    return searchBM25(workspaceId, query, topK);
  }

  // Embed the query
  let queryEmbedding;
  try {
    const results = await embedTexts([query], "query");
    queryEmbedding = results[0].embedding;
  } catch (err) {
    console.error("  ⚠ Erreur embedding query, fallback BM25:", err.message);
    return searchBM25(workspaceId, query, topK);
  }

  // Load all embedded chunks for workspace
  const chunks = db.prepare(
    "SELECT id, document_id, content, embedding, tokens_approx FROM chunks WHERE workspace_id = ? AND embedding IS NOT NULL"
  ).all(workspaceId);

  // Compute similarities
  const scored = [];
  for (const chunk of chunks) {
    const chunkEmb = bufferToEmbedding(chunk.embedding);
    const score = cosineSimilarity(queryEmbedding, chunkEmb);
    scored.push({ ...chunk, score, embedding: undefined }); // drop blob from result
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

// ── Embed chunks for a workspace (async, non-blocking) ──────────────────────

const embeddingJobs = new Map(); // workspaceId -> { total, done, status }

async function embedWorkspaceChunks(workspaceId) {
  const unembedded = db.prepare(
    "SELECT id, content FROM chunks WHERE workspace_id = ? AND embedding IS NULL"
  ).all(workspaceId);

  if (unembedded.length === 0) return;

  embeddingJobs.set(workspaceId, { total: unembedded.length, done: 0, status: "running" });
  console.log(`  📐 Embedding ${unembedded.length} chunks pour workspace ${workspaceId}...`);

  const batchSize = 64;
  const updateStmt = db.prepare("UPDATE chunks SET embedding = ?, embed_model = ?, embed_dim = ? WHERE id = ?");

  try {
    for (let i = 0; i < unembedded.length; i += batchSize) {
      const batch = unembedded.slice(i, i + batchSize);
      const texts = batch.map(c => c.content);

      const embeddings = await embedTexts(texts, "document");

      const txn = db.transaction(() => {
        for (let j = 0; j < batch.length; j++) {
          const buf = embeddingToBuffer(embeddings[j].embedding);
          updateStmt.run(buf, embeddings[j].model, embeddings[j].dim, batch[j].id);
        }
      });
      txn();

      const job = embeddingJobs.get(workspaceId);
      if (job) job.done = Math.min(i + batchSize, unembedded.length);
    }

    const job = embeddingJobs.get(workspaceId);
    if (job) job.status = "done";
    console.log(`  ✅ Embedding terminé : ${unembedded.length} chunks`);
  } catch (err) {
    console.error(`  ❌ Erreur embedding:`, err.message);
    const job = embeddingJobs.get(workspaceId);
    if (job) job.status = "error";
  }
}

// ── BM25 Search (fallback) ──────────────────────────────────────────────────
function searchBM25(workspaceId, query, topK = 8) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];
  const idf = getIdf(workspaceId);
  const k1 = 1.5, b = 0.75;
  const allChunks = db.prepare("SELECT id, document_id, content, tokens_approx FROM chunks WHERE workspace_id = ?").all(workspaceId);
  if (allChunks.length === 0) return [];
  const avgDl = allChunks.reduce((s, c) => s + c.tokens_approx, 0) / allChunks.length;
  const chunkTfs = new Map();
  const tfRows = db.prepare(`
    SELECT ct.chunk_id, ct.term, ct.tf FROM chunk_terms ct
    JOIN chunks c ON ct.chunk_id = c.id
    WHERE c.workspace_id = ? AND ct.term IN (${queryTokens.map(() => "?").join(",")})
  `).all(workspaceId, ...queryTokens);
  for (const row of tfRows) {
    if (!chunkTfs.has(row.chunk_id)) chunkTfs.set(row.chunk_id, {});
    chunkTfs.get(row.chunk_id)[row.term] = row.tf;
  }
  const scores = [];
  for (const chunk of allChunks) {
    const tf = chunkTfs.get(chunk.id) || {};
    let score = 0;
    for (const qt of queryTokens) {
      const termTf = tf[qt] || 0;
      const termIdf = idf.get(qt) || 0;
      const dl = chunk.tokens_approx || 1;
      score += termIdf * ((termTf * (k1 + 1)) / (termTf + k1 * (1 - b + b * dl / avgDl)));
    }
    if (score > 0) scores.push({ ...chunk, score });
  }
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topK);
}

// ══════════════════════════════════════════════════════════════════════════════
// ── AI ENGINE (Mistral API / Ollama Ministral 3B) ───────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

async function aiChat(systemPrompt, messages, options = {}) {
  if (isOnline && process.env.MISTRAL_API_KEY) {
    return aiChatMistral(systemPrompt, messages, options);
  }
  return aiChatLocal(systemPrompt, messages, options);
}

async function aiChatMistral(systemPrompt, messages, options = {}) {
  const apiKey = process.env.MISTRAL_API_KEY;
  const model = process.env.MISTRAL_MODEL || "mistral-large-latest";

  const mistralMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ];

  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: mistralMessages,
        max_tokens: options.maxTokens || 4096,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Mistral API error ${res.status}:`, errText);
      // Try mistral-small as fallback
      if (model !== "mistral-small-latest") {
        console.log("  🔄 Fallback vers mistral-small-latest...");
        const res2 = await fetch("https://api.mistral.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "mistral-small-latest",
            messages: mistralMessages,
            max_tokens: options.maxTokens || 4096,
            temperature: 0.3,
          }),
        });
        if (res2.ok) {
          const data2 = await res2.json();
          return data2.choices?.[0]?.message?.content || "";
        }
      }
      // Final fallback to local
      console.log("  🔄 Fallback vers Ministral 3B local...");
      return aiChatLocal(systemPrompt, messages, options);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (err) {
    console.error("Mistral network error:", err.message);
    // Network error → go local
    isOnline = false;
    return aiChatLocal(systemPrompt, messages, options);
  }
}

async function aiChatLocal(systemPrompt, messages, options = {}) {
  const base = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL || "ministral:3b";
  try {
    const ollamaMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ];
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: ollamaMessages,
        stream: false,
        options: { num_predict: options.maxTokens || 2048 },
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const data = await res.json();
    return data.message?.content || "";
  } catch (err) {
    console.error("Ollama error:", err.message);
    return "Erreur : impossible de contacter le modèle IA. Vérifiez que Ollama est lancé (ollama serve) avec le modèle ministral:3b, ou configurez MISTRAL_API_KEY pour le mode en ligne.";
  }
}

// ── ZIP handling ────────────────────────────────────────────────────────────
async function extractZip(zipPath, destDir) {
  const yauzl = await import("yauzl");
  return new Promise((resolve, reject) => {
    const files = [];
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        if (/\/$/.test(entry.fileName) || entry.fileName.startsWith("__MACOSX")) {
          zipfile.readEntry();
          return;
        }
        const basename = path.basename(entry.fileName);
        if (basename.startsWith(".")) { zipfile.readEntry(); return; }
        const outPath = path.join(destDir, basename);
        zipfile.openReadStream(entry, (err, readStream) => {
          if (err) { zipfile.readEntry(); return; }
          const ws = fs.createWriteStream(outPath);
          readStream.pipe(ws);
          ws.on("finish", () => {
            files.push({ path: outPath, name: basename });
            zipfile.readEntry();
          });
        });
      });
      zipfile.on("end", () => resolve(files));
    });
  });
}

// ── Express App ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use("/uploads", express.static(UPLOADS_DIR));

const upload = multer({
  dest: path.join(UPLOADS_DIR, "tmp"),
  limits: { fileSize: 100 * 1024 * 1024 },
});

// ── Health ───────────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", product: "sailor", version: "0.2.0" });
});

// ── AI Mode ──────────────────────────────────────────────────────────────────
app.get("/api/ai/mode", async (req, res) => {
  const providers = {
    mistral: !!process.env.MISTRAL_API_KEY,
    voyage: !!process.env.VOYAGE_API_KEY,
    ollama: false,
  };
  try {
    const base = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (r.ok) {
      providers.ollama = true;
      const data = await r.json();
      providers.ollamaModels = (data.models || []).map(m => m.name);
    }
  } catch {}
  res.json({
    mode: isOnline ? "online" : "offline",
    llm: isOnline ? (process.env.MISTRAL_MODEL || "mistral-large-latest") : (process.env.OLLAMA_MODEL || "ministral:3b"),
    embeddings: isOnline ? (process.env.VOYAGE_MODEL || "voyage-3-lite") : "nomic-embed-text",
    isOnline,
    providers,
  });
});

app.post("/api/ai/mode", async (req, res) => {
  // Force refresh connectivity
  await checkConnectivity();
  res.json({ isOnline, mode: isOnline ? "online" : "offline" });
});

// ── Workspaces ──────────────────────────────────────────────────────────────
app.get("/api/workspaces", (req, res) => {
  const workspaces = db.prepare(`
    SELECT w.*,
      (SELECT COUNT(*) FROM documents WHERE workspace_id = w.id) as doc_count,
      (SELECT COUNT(*) FROM chunks WHERE workspace_id = w.id) as chunk_count,
      (SELECT COUNT(*) FROM chunks WHERE workspace_id = w.id AND embedding IS NOT NULL) as embedded_count
    FROM workspaces w ORDER BY w.updated_at DESC
  `).all();
  res.json(workspaces);
});

app.post("/api/workspaces", (req, res) => {
  const { name, description, industry } = req.body;
  if (!name || name.trim().length < 2) return res.status(400).json({ error: "Nom requis (min 2 caractères)" });

  const id = uuid();
  const slug = name.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    || `ws-${Date.now()}`;

  const existing = db.prepare("SELECT id FROM workspaces WHERE slug = ?").get(slug);
  const finalSlug = existing ? `${slug}-${Date.now().toString(36)}` : slug;

  db.prepare("INSERT INTO workspaces (id, slug, name, description, industry) VALUES (?, ?, ?, ?, ?)").run(
    id, finalSlug, name.trim(), description || "", industry || ""
  );
  fs.mkdirSync(path.join(UPLOADS_DIR, id), { recursive: true });
  res.json({ id, slug: finalSlug, name: name.trim() });
});

app.get("/api/workspaces/:slug", (req, res) => {
  const ws = db.prepare(`
    SELECT w.*,
      (SELECT COUNT(*) FROM documents WHERE workspace_id = w.id) as doc_count,
      (SELECT COUNT(*) FROM chunks WHERE workspace_id = w.id) as chunk_count,
      (SELECT COUNT(*) FROM chunks WHERE workspace_id = w.id AND embedding IS NOT NULL) as embedded_count
    FROM workspaces w WHERE w.slug = ?
  `).get(req.params.slug);
  if (!ws) return res.status(404).json({ error: "Workspace not found" });
  res.json(ws);
});

app.delete("/api/workspaces/:slug", (req, res) => {
  const ws = db.prepare("SELECT id FROM workspaces WHERE slug = ?").get(req.params.slug);
  if (!ws) return res.status(404).json({ error: "Not found" });
  db.prepare("DELETE FROM workspaces WHERE id = ?").run(ws.id);
  invalidateIdf(ws.id);
  embeddingJobs.delete(ws.id);
  const wsDir = path.join(UPLOADS_DIR, ws.id);
  try { fs.rmSync(wsDir, { recursive: true, force: true }); } catch {}
  res.json({ ok: true });
});

// ── Workspace middleware ────────────────────────────────────────────────────
function wsMiddleware(req, res, next) {
  const ws = db.prepare("SELECT * FROM workspaces WHERE slug = ?").get(req.params.slug);
  if (!ws) return res.status(404).json({ error: "Workspace not found" });
  req.workspace = ws;
  next();
}

// ── Document Upload ─────────────────────────────────────────────────────────
app.post("/api/w/:slug/upload", wsMiddleware, upload.array("files", 100), async (req, res) => {
  const ws = req.workspace;
  const results = [];

  for (const file of (req.files || [])) {
    const ext = path.extname(file.originalname).toLowerCase().replace(".", "");

    if (ext === "zip") {
      const extractDir = path.join(UPLOADS_DIR, ws.id);
      fs.mkdirSync(extractDir, { recursive: true });
      try {
        const extracted = await extractZip(file.path, extractDir);
        const indexFile = extracted.find(f => f.name.endsWith(".json") && f.name.includes("index"));
        let indexData = [];
        if (indexFile) {
          try { indexData = JSON.parse(fs.readFileSync(indexFile.path, "utf-8")); } catch {}
        }

        for (const ef of extracted) {
          const efExt = path.extname(ef.name).toLowerCase().replace(".", "");
          if (efExt === "json" && ef.name.includes("index")) continue;
          const indexEntry = indexData.find(d => d.filename === ef.name) || {};
          const docId = uuid();
          const { text, html } = await parseDocument(ef.path, efExt, ef.name);

          db.prepare(`INSERT INTO documents (id, workspace_id, filename, original_name, type, title, categorie, auteur, date_creation, mots_cles, content_text, content_html, file_size)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            docId, ws.id, ef.name, ef.name, efExt,
            indexEntry.titre || ef.name,
            indexEntry.categorie || "",
            indexEntry.auteur || "",
            indexEntry.date_creation || "",
            indexEntry.mots_cles || "",
            text, html, fs.statSync(ef.path).size
          );

          const chunks = chunkText(text);
          const insertChunk = db.prepare("INSERT INTO chunks (id, document_id, workspace_id, chunk_index, content, tokens_approx) VALUES (?, ?, ?, ?, ?, ?)");
          const insertTerm = db.prepare("INSERT INTO chunk_terms (chunk_id, term, tf) VALUES (?, ?, ?)");

          const txn = db.transaction(() => {
            for (let i = 0; i < chunks.length; i++) {
              const chunkId = uuid();
              const tokens = tokenize(chunks[i]);
              insertChunk.run(chunkId, docId, ws.id, i, chunks[i], tokens.length);
              const tf = computeTf(tokens);
              for (const [term, val] of Object.entries(tf)) insertTerm.run(chunkId, term, val);
            }
          });
          txn();
          results.push({ id: docId, name: ef.name, title: indexEntry.titre || ef.name, chunks: chunks.length });
        }
      } catch (err) {
        console.error("ZIP extraction error:", err);
        results.push({ name: file.originalname, error: err.message });
      }
      try { fs.unlinkSync(file.path); } catch {}
      continue;
    }

    // Single file
    const docId = uuid();
    const destPath = path.join(UPLOADS_DIR, ws.id, `${docId}.${ext}`);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.renameSync(file.path, destPath);

    const { text, html } = await parseDocument(destPath, ext, file.originalname);

    db.prepare(`INSERT INTO documents (id, workspace_id, filename, original_name, type, title, content_text, content_html, file_size)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      docId, ws.id, `${docId}.${ext}`, file.originalname, ext,
      file.originalname, text, html, file.size
    );

    const chunks = chunkText(text);
    const insertChunk = db.prepare("INSERT INTO chunks (id, document_id, workspace_id, chunk_index, content, tokens_approx) VALUES (?, ?, ?, ?, ?, ?)");
    const insertTerm = db.prepare("INSERT INTO chunk_terms (chunk_id, term, tf) VALUES (?, ?, ?)");

    const txn = db.transaction(() => {
      for (let i = 0; i < chunks.length; i++) {
        const chunkId = uuid();
        const tokens = tokenize(chunks[i]);
        insertChunk.run(chunkId, docId, ws.id, i, chunks[i], tokens.length);
        const tf = computeTf(tokens);
        for (const [term, val] of Object.entries(tf)) insertTerm.run(chunkId, term, val);
      }
    });
    txn();
    results.push({ id: docId, name: file.originalname, chunks: chunks.length });
  }

  invalidateIdf(ws.id);
  db.prepare("UPDATE workspaces SET updated_at = datetime('now') WHERE id = ?").run(ws.id);

  // Launch async embedding (non-blocking)
  embedWorkspaceChunks(ws.id).catch(err => console.error("Embedding job error:", err.message));

  res.json({ documents: results });
});

// ── Embedding status ────────────────────────────────────────────────────────
app.get("/api/w/:slug/embedding-status", wsMiddleware, (req, res) => {
  const ws = req.workspace;
  const total = db.prepare("SELECT COUNT(*) as c FROM chunks WHERE workspace_id = ?").get(ws.id).c;
  const embedded = db.prepare("SELECT COUNT(*) as c FROM chunks WHERE workspace_id = ? AND embedding IS NOT NULL").get(ws.id).c;
  const job = embeddingJobs.get(ws.id);

  res.json({
    total,
    embedded,
    coverage: total > 0 ? Math.round((embedded / total) * 100) : 0,
    job: job || null,
  });
});

// ── Re-embed endpoint ───────────────────────────────────────────────────────
app.post("/api/w/:slug/reembed", wsMiddleware, async (req, res) => {
  const ws = req.workspace;
  // Clear existing embeddings
  db.prepare("UPDATE chunks SET embedding = NULL, embed_model = NULL, embed_dim = NULL WHERE workspace_id = ?").run(ws.id);
  // Re-embed
  embedWorkspaceChunks(ws.id).catch(err => console.error("Re-embed error:", err.message));
  res.json({ ok: true, message: "Re-embedding lancé en arrière-plan" });
});

// ── Documents list ──────────────────────────────────────────────────────────
app.get("/api/w/:slug/documents", wsMiddleware, (req, res) => {
  const docs = db.prepare(`
    SELECT id, filename, original_name, type, title, categorie, auteur, date_creation, mots_cles, file_size, created_at
    FROM documents WHERE workspace_id = ? ORDER BY created_at DESC
  `).all(req.workspace.id);
  res.json({ documents: docs });
});

// ── Document content (for preview panel) ────────────────────────────────────
app.get("/api/w/:slug/documents/:docId", wsMiddleware, (req, res) => {
  const doc = db.prepare("SELECT * FROM documents WHERE id = ? AND workspace_id = ?").get(req.params.docId, req.workspace.id);
  if (!doc) return res.status(404).json({ error: "Document not found" });
  res.json(doc);
});

// ── Document raw file (serve for iframe preview) ────────────────────────────
app.get("/api/w/:slug/documents/:docId/raw", wsMiddleware, (req, res) => {
  const doc = db.prepare("SELECT * FROM documents WHERE id = ? AND workspace_id = ?").get(req.params.docId, req.workspace.id);
  if (!doc) return res.status(404).json({ error: "Not found" });

  if (doc.content_html) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(doc.content_html);
  }
  if (doc.content_text) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'DM Sans', sans-serif; line-height: 1.7; padding: 24px; max-width: 700px; color: #1C1D1A; }
  h1 { font-family: 'Source Serif 4', serif; color: #1C1D1A; border-bottom: 2px solid #6B8A1A; padding-bottom: 8px; }
  pre { white-space: pre-wrap; word-break: break-word; }
</style></head>
<body><h1>${doc.title || doc.original_name}</h1><pre>${doc.content_text}</pre></body></html>`);
  }

  const filePath = path.join(UPLOADS_DIR, req.workspace.id, doc.filename);
  if (fs.existsSync(filePath)) return res.sendFile(filePath);

  const extractedPath = path.join(UPLOADS_DIR, req.workspace.id, doc.original_name);
  if (fs.existsSync(extractedPath)) {
    if (doc.type === "html" || doc.type === "htm") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.sendFile(extractedPath);
    }
    return res.sendFile(extractedPath);
  }

  res.status(404).json({ error: "File not found" });
});

// ── Context ─────────────────────────────────────────────────────────────────
app.get("/api/w/:slug/context", wsMiddleware, (req, res) => {
  const ctx = db.prepare("SELECT * FROM workspace_context WHERE workspace_id = ?").get(req.workspace.id);
  res.json({ context: ctx || {} });
});

app.post("/api/w/:slug/context", wsMiddleware, (req, res) => {
  const { project_name, description, objectives } = req.body;
  const existing = db.prepare("SELECT id FROM workspace_context WHERE workspace_id = ?").get(req.workspace.id);
  if (existing) {
    db.prepare("UPDATE workspace_context SET project_name = ?, description = ?, objectives = ? WHERE workspace_id = ?")
      .run(project_name || "", description || "", objectives || "", req.workspace.id);
  } else {
    db.prepare("INSERT INTO workspace_context (id, workspace_id, project_name, description, objectives) VALUES (?, ?, ?, ?, ?)")
      .run(uuid(), req.workspace.id, project_name || "", description || "", objectives || "");
  }
  db.prepare("UPDATE workspaces SET updated_at = datetime('now') WHERE id = ?").run(req.workspace.id);
  res.json({ ok: true });
});

// ── RAG Chat ────────────────────────────────────────────────────────────────
app.post("/api/w/:slug/chat", wsMiddleware, async (req, res) => {
  const { message, history } = req.body;
  if (!message) return res.status(400).json({ error: "Message required" });

  const ws = req.workspace;

  // 1. Search relevant chunks (vectors or BM25 fallback)
  const relevantChunks = await searchVectors(ws.id, message, 8);

  // 2. Get document info for each chunk
  const sourceMap = new Map();
  for (const chunk of relevantChunks) {
    if (!sourceMap.has(chunk.document_id)) {
      const doc = db.prepare("SELECT id, title, original_name, type, categorie, auteur FROM documents WHERE id = ?").get(chunk.document_id);
      if (doc) sourceMap.set(chunk.document_id, doc);
    }
  }

  // 3. Build context
  const contextParts = relevantChunks.map((chunk, i) => {
    const doc = sourceMap.get(chunk.document_id);
    return `[Source ${i + 1}: "${doc?.title || doc?.original_name}" (${doc?.categorie || doc?.type})]
${chunk.content}`;
  });

  const contextBlock = contextParts.join("\n\n---\n\n");

  // 4. Get workspace context
  const wsCtx = db.prepare("SELECT * FROM workspace_context WHERE workspace_id = ?").get(ws.id);

  // 5. Build system prompt
  const systemPrompt = `Tu es Sailor, un assistant IA spécialisé dans la navigation et l'exploration de bases documentaires.
Tu réponds TOUJOURS en français.

${wsCtx ? `Contexte du projet: ${wsCtx.project_name || ws.name}
Description: ${wsCtx.description || ""}
Objectifs: ${wsCtx.objectives || ""}` : `Projet: ${ws.name}`}

RÈGLES IMPORTANTES:
1. Base tes réponses UNIQUEMENT sur les sources fournies ci-dessous.
2. Pour chaque affirmation, cite la source avec le format [[source:DOC_ID|TITRE]].
3. Si tu ne trouves pas l'information dans les sources, dis-le clairement.
4. Structure ta réponse avec des paragraphes clairs.
5. Utilise le format markdown pour la mise en forme.

SOURCES DOCUMENTAIRES:
${contextBlock || "Aucune source pertinente trouvée pour cette question."}`;

  // 6. Call AI
  const chatHistory = (history || []).slice(-6).map(m => ({ role: m.role, content: m.content }));
  chatHistory.push({ role: "user", content: message });

  try {
    let response = await aiChat(systemPrompt, chatHistory);

    // 7. Extract source references
    const sources = [];
    const sourceRegex = /\[\[source:([^\]|]+)\|([^\]]+)\]\]/g;
    let match;
    while ((match = sourceRegex.exec(response)) !== null) {
      const docId = match[1].trim();
      const doc = sourceMap.get(docId);
      if (doc && !sources.find(s => s.id === doc.id)) {
        sources.push({
          id: doc.id,
          title: doc.title || doc.original_name,
          type: doc.type,
          categorie: doc.categorie,
          auteur: doc.auteur,
        });
      }
    }

    // Add sources from chunks even if not explicitly cited
    if (sources.length === 0 && relevantChunks.length > 0) {
      for (const chunk of relevantChunks.slice(0, 5)) {
        const doc = sourceMap.get(chunk.document_id);
        if (doc && !sources.find(s => s.id === doc.id)) {
          sources.push({
            id: doc.id,
            title: doc.title || doc.original_name,
            type: doc.type,
            categorie: doc.categorie,
            auteur: doc.auteur,
            relevance: Math.round(chunk.score * 100) / 100,
          });
        }
      }
    }

    response = response.replace(/\[\[source:[^\]]+\]\]/g, "");

    res.json({
      response,
      sources,
      chunks_used: relevantChunks.length,
      ai_provider: isOnline ? "mistral" : "ollama",
    });
  } catch (err) {
    console.error("Chat error:", err);
    res.json({
      response: "Une erreur est survenue lors du traitement de votre question. Vérifiez la configuration IA.",
      sources: [],
      error: err.message,
    });
  }
});

// ── Suggest questions ───────────────────────────────────────────────────────
app.get("/api/w/:slug/suggestions", wsMiddleware, async (req, res) => {
  const ws = req.workspace;
  const docCount = db.prepare("SELECT COUNT(*) as c FROM documents WHERE workspace_id = ?").get(ws.id).c;
  if (docCount === 0) return res.json({ suggestions: [] });

  const docs = db.prepare("SELECT title, categorie, mots_cles FROM documents WHERE workspace_id = ? LIMIT 20").all(ws.id);
  const categories = [...new Set(docs.map(d => d.categorie).filter(Boolean))];
  const suggestions = [];

  if (categories.includes("Processus")) suggestions.push("Quelles sont les procédures documentées dans la base ?");
  if (categories.includes("Conformité") || categories.includes("Conformite")) suggestions.push("Quelles sont les règles de conformité à respecter ?");
  if (categories.includes("Formation")) suggestions.push("Quels modules de formation sont disponibles ?");
  if (categories.includes("Réclamations") || categories.includes("Reclamations")) suggestions.push("Comment fonctionne le processus de réclamation ?");
  if (categories.includes("Escalade")) suggestions.push("Quels sont les niveaux d'escalade et leurs délais ?");
  if (categories.includes("Ressources Humaines")) suggestions.push("Combien de collaborateurs sont référencés et quelles sont leurs formations ?");

  suggestions.push("Fais-moi un résumé global de la documentation disponible");
  suggestions.push("Quels sont les principaux sujets couverts par cette base documentaire ?");

  res.json({ suggestions: suggestions.slice(0, 6) });
});

// ── Chat Sessions ───────────────────────────────────────────────────────────
app.get("/api/w/:slug/chat-sessions", wsMiddleware, (req, res) => {
  const sessions = db.prepare("SELECT * FROM chat_sessions WHERE workspace_id = ? ORDER BY updated_at DESC").all(req.workspace.id);
  res.json({ sessions: sessions.map(s => ({ ...s, messages: JSON.parse(s.messages || "[]") })) });
});

app.post("/api/w/:slug/chat-sessions", wsMiddleware, (req, res) => {
  const id = uuid();
  db.prepare("INSERT INTO chat_sessions (id, workspace_id, title) VALUES (?, ?, ?)").run(id, req.workspace.id, req.body.title || "Nouvelle conversation");
  res.json({ id, title: req.body.title || "Nouvelle conversation" });
});

app.get("/api/w/:slug/chat-sessions/:id", wsMiddleware, (req, res) => {
  const session = db.prepare("SELECT * FROM chat_sessions WHERE id = ? AND workspace_id = ?").get(req.params.id, req.workspace.id);
  if (!session) return res.status(404).json({ error: "Not found" });
  res.json({ ...session, messages: JSON.parse(session.messages || "[]") });
});

app.patch("/api/w/:slug/chat-sessions/:id", wsMiddleware, (req, res) => {
  const { title, messages } = req.body;
  if (title) db.prepare("UPDATE chat_sessions SET title = ?, updated_at = datetime('now') WHERE id = ? AND workspace_id = ?").run(title, req.params.id, req.workspace.id);
  if (messages) db.prepare("UPDATE chat_sessions SET messages = ?, updated_at = datetime('now') WHERE id = ? AND workspace_id = ?").run(JSON.stringify(messages), req.params.id, req.workspace.id);
  res.json({ ok: true });
});

app.delete("/api/w/:slug/chat-sessions/:id", wsMiddleware, (req, res) => {
  db.prepare("DELETE FROM chat_sessions WHERE id = ? AND workspace_id = ?").run(req.params.id, req.workspace.id);
  res.json({ ok: true });
});

// ── Onboarding status ───────────────────────────────────────────────────────
app.get("/api/w/:slug/onboarding/status", wsMiddleware, (req, res) => {
  const ws = req.workspace;
  const docCount = db.prepare("SELECT COUNT(*) as c FROM documents WHERE workspace_id = ?").get(ws.id).c;
  const ctx = db.prepare("SELECT * FROM workspace_context WHERE workspace_id = ?").get(ws.id);

  let step = 1;
  if (docCount > 0) step = 2;
  if (ctx && ctx.project_name) step = 3;
  if (docCount > 0 && ctx && ctx.project_name) step = "complete";

  res.json({ step, docCount, hasContext: !!(ctx && ctx.project_name) });
});

// ── Stats ───────────────────────────────────────────────────────────────────
app.get("/api/w/:slug/stats", wsMiddleware, (req, res) => {
  const ws = req.workspace;
  const docCount = db.prepare("SELECT COUNT(*) as c FROM documents WHERE workspace_id = ?").get(ws.id).c;
  const chunkCount = db.prepare("SELECT COUNT(*) as c FROM chunks WHERE workspace_id = ?").get(ws.id).c;
  const embeddedCount = db.prepare("SELECT COUNT(*) as c FROM chunks WHERE workspace_id = ? AND embedding IS NOT NULL").get(ws.id).c;
  const categories = db.prepare("SELECT DISTINCT categorie FROM documents WHERE workspace_id = ? AND categorie != ''").all(ws.id);
  const types = db.prepare("SELECT type, COUNT(*) as c FROM documents WHERE workspace_id = ? GROUP BY type").all(ws.id);
  const embedModel = db.prepare("SELECT embed_model FROM chunks WHERE workspace_id = ? AND embed_model IS NOT NULL LIMIT 1").get(ws.id);

  res.json({
    documents: docCount,
    chunks: chunkCount,
    embedded_chunks: embeddedCount,
    embed_coverage: chunkCount > 0 ? Math.round((embeddedCount / chunkCount) * 100) : 0,
    embed_model: embedModel?.embed_model || null,
    categories: categories.map(c => c.categorie),
    types,
  });
});

// ── Serve frontend in production ────────────────────────────────────────────
const frontendDir = path.join(__dirname, "..", "app", "dist");
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
  app.get("*", (req, res) => {
    if (!req.path.startsWith("/api")) {
      res.sendFile(path.join(frontendDir, "index.html"));
    }
  });
}

// ── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  🚢 Sailor v0.2.0 — RAG avec embeddings vectoriels`);
  console.log(`  📡 Port: ${PORT}`);
  console.log(`  📂 Database: ${DB_PATH}`);
  console.log(`  🔑 Mistral API: ${process.env.MISTRAL_API_KEY ? "✓" : "✗"}`);
  console.log(`  🔑 Voyage AI: ${process.env.VOYAGE_API_KEY ? "✓" : "✗"}`);
  console.log(`  💾 Ollama fallback: ${process.env.OLLAMA_MODEL || "ministral:3b"}\n`);
});
