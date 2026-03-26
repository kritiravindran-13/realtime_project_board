"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { RealtimeMessage } from "../../lib/shared/types";
import {
  acquireProjectRoom,
  getProjectRoomStatus,
  releaseProjectRoom,
  subscribeProjectEvents,
  subscribeProjectStatus,
  type RealtimeConnectionStatus,
} from "@/lib/realtime/ws-hub";

export type { RealtimeConnectionStatus };

/**
 * One shared WebSocket per `projectId` (ref-counted). Parses `{ topic: "project", payload }`
 * and notifies subscribers. Protocol matches `server.ts` + `subscribe` messages.
 */
export function useRealtime(projectId: string | null) {
  useEffect(() => {
    if (!projectId) return;
    acquireProjectRoom(projectId);
    return () => releaseProjectRoom(projectId);
  }, [projectId]);

  const connectionStatus = useSyncExternalStore(
    (onChange) => {
      if (!projectId) return () => {};
      return subscribeProjectStatus(projectId, onChange);
    },
    () => (projectId ? getProjectRoomStatus(projectId) : "idle"),
    () => "idle" as RealtimeConnectionStatus,
  );

  const subscribe = useCallback(
    (handler: (message: RealtimeMessage) => void) => {
      if (!projectId) return () => {};
      return subscribeProjectEvents(projectId, handler);
    },
    [projectId],
  );

  return {
    connectionStatus: projectId ? connectionStatus : ("idle" as const),
    subscribe,
  };
}
