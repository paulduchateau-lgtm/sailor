const API_BASE = "/api";

// ── Global API ──────────────────────────────────────────────────────────────

export async function listWorkspaces() {
  const res = await fetch(`${API_BASE}/workspaces`);
  return res.json();
}

export async function createWorkspace(name, description, industry) {
  const res = await fetch(`${API_BASE}/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description, industry }),
  });
  return res.json();
}

export async function getWorkspace(slug) {
  const res = await fetch(`${API_BASE}/workspaces/${slug}`);
  return res.json();
}

export async function deleteWorkspace(slug) {
  const res = await fetch(`${API_BASE}/workspaces/${slug}`, { method: "DELETE" });
  return res.json();
}

export async function getAiMode() {
  const res = await fetch(`${API_BASE}/ai/mode`);
  return res.json();
}

export async function setAiMode(mode) {
  const res = await fetch(`${API_BASE}/ai/mode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  return res.json();
}

// ── Workspace-scoped API ────────────────────────────────────────────────────

export function createWorkspaceApi(slug) {
  const BASE = `${API_BASE}/w/${slug}`;

  return {
    uploadFiles: async (files) => {
      const formData = new FormData();
      files.forEach(f => formData.append("files", f));
      const res = await fetch(`${BASE}/upload`, { method: "POST", body: formData });
      return res.json();
    },

    getDocuments: async () => {
      const res = await fetch(`${BASE}/documents`);
      return res.json();
    },

    getDocument: async (id) => {
      const res = await fetch(`${BASE}/documents/${id}`);
      return res.json();
    },

    getDocumentRawUrl: (id) => `${BASE}/documents/${id}/raw`,

    getContext: async () => {
      const res = await fetch(`${BASE}/context`);
      return res.json();
    },

    saveContext: async (context) => {
      const res = await fetch(`${BASE}/context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(context),
      });
      return res.json();
    },

    chat: async (message, history) => {
      const res = await fetch(`${BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      return res.json();
    },

    getSuggestions: async () => {
      const res = await fetch(`${BASE}/suggestions`);
      return res.json();
    },

    getStats: async () => {
      const res = await fetch(`${BASE}/stats`);
      return res.json();
    },

    getOnboardingStatus: async () => {
      const res = await fetch(`${BASE}/onboarding/status`);
      return res.json();
    },

    // Chat sessions
    getChatSessions: async () => {
      const res = await fetch(`${BASE}/chat-sessions`);
      return res.json();
    },
    createChatSession: async (title) => {
      const res = await fetch(`${BASE}/chat-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      return res.json();
    },
    getChatSession: async (id) => {
      const res = await fetch(`${BASE}/chat-sessions/${id}`);
      return res.json();
    },
    updateChatSession: async (id, data) => {
      const res = await fetch(`${BASE}/chat-sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    deleteChatSession: async (id) => {
      const res = await fetch(`${BASE}/chat-sessions/${id}`, { method: "DELETE" });
      return res.json();
    },
  };
}
