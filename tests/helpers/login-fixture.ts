import {
  emptyProject,
  captureProject,
  restoreProject,
} from "../../src/lib/project/workspace";
import { useBackendStore } from "../../src/store/backendStore";

export function loginProject() {
  const initial = emptyProject("Login workflow");
  restoreProject(initial);
  useBackendStore.getState().loadAuthTemplate();
  return captureProject(initial.id, initial.name);
}
