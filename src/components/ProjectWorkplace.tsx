"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FolderOpen } from "lucide-react";
import ProjectEditor from "./ProjectEditor";
import { flushWorkspace, initializeWorkspace } from "@/store/workspaceStore";

export default function ProjectWorkplace({ projectId }: { projectId: string }) {
  const [loaded, setLoaded] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void initializeWorkspace(projectId)
      .then(() => {
        if (active) {
          setLoaded(projectId);
          setError("");
        }
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      });
    return () => {
      active = false;
      void flushWorkspace().catch(() => {});
    };
  }, [projectId]);
  if (error || loaded !== projectId)
    return (
      <main className="workplace-state">
        <FolderOpen size={32} strokeWidth={1.5} />
        <h1>{error ? "Unable to open project" : "Opening your project…"}</h1>
        <p role={error ? "alert" : "status"}>
          {error || "Restoring your saved workspace."}
        </p>
        {error && (
          <Link href="/">
            <ArrowLeft size={16} /> Back to Home
          </Link>
        )}
      </main>
    );
  return <ProjectEditor />;
}
