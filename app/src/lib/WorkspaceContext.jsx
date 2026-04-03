import { createContext, useContext, useMemo, useState, useEffect } from "react";
import { createWorkspaceApi, getWorkspace } from "./api";

const Ctx = createContext(null);

export function WorkspaceProvider({ slug, children }) {
  const api = useMemo(() => createWorkspaceApi(slug), [slug]);
  const [workspace, setWorkspace] = useState(null);

  useEffect(() => {
    getWorkspace(slug).then(setWorkspace).catch(() => {});
  }, [slug]);

  return (
    <Ctx.Provider value={{ api, workspace, slug }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWorkspace() {
  return useContext(Ctx);
}

export function useWorkspaceApi() {
  return useContext(Ctx)?.api;
}
