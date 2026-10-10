import { create } from "zustand";
export type Collaboration = {
  actorId: string;
  ownerId: string;
  projectId: string;
  role: "owner" | "editor" | "viewer";
  revision: number;
};
export const useCollaborationStore = create<{ project: Collaboration | null }>(
  () => ({ project: null }),
);
export function sharedProjectPath(ownerId: string, projectId: string) {
  return `/shared/${encodeURIComponent(ownerId)}/${encodeURIComponent(projectId)}`;
}
