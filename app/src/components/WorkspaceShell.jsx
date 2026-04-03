import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { WorkspaceProvider, useWorkspaceApi } from "../lib/WorkspaceContext";
import Sidebar from "./Sidebar";
import OnboardingWizard from "./OnboardingWizard";
import ChatPage from "./ChatPage";
import DocumentsPage from "./DocumentsPage";

function WorkspaceContent() {
  const api = useWorkspaceApi();
  const [page, setPage] = useState("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [onboarding, setOnboarding] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);

  useEffect(() => {
    checkOnboarding();
  }, []);

  const checkOnboarding = async () => {
    try {
      const status = await api.getOnboardingStatus();
      setOnboarding(status);
      if (status.step !== "complete") setShowOnboarding(true);
    } catch {
      setOnboarding({ step: 1 });
      setShowOnboarding(true);
    }
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    setOnboarding({ step: "complete" });
  };

  if (showOnboarding) {
    return (
      <OnboardingWizard
        onComplete={handleOnboardingComplete}
        initialStep={onboarding?.step || 1}
      />
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--mp-bg)" }}>
      <Sidebar
        page={page}
        setPage={setPage}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        onStartOnboarding={() => setShowOnboarding(true)}
      />
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {page === "chat" && <ChatPage previewDoc={previewDoc} setPreviewDoc={setPreviewDoc} />}
        {page === "documents" && <DocumentsPage setPreviewDoc={setPreviewDoc} />}
      </div>
    </div>
  );
}

export default function WorkspaceShell() {
  const { slug } = useParams();
  return (
    <WorkspaceProvider slug={slug}>
      <WorkspaceContent />
    </WorkspaceProvider>
  );
}
