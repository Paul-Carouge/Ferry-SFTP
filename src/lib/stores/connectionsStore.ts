import { create } from "zustand";
import {
  connectionsApi,
  onConnectionStatus,
  sftpApi,
  type AuthMethod,
  type ConnectionProfile,
  type ConnectionStatusState,
} from "@/lib/api";

export interface QuickConnectInput {
  host: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  password?: string;
  keyPath?: string;
  passphrase?: string;
}

export interface ConnectionSession {
  /** Equal to the backend `connectionId` once connected. */
  id: string;
  profileId: string | null;
  label: string;
  host: string;
  port: number;
  username: string;
  defaultRemotePath: string | null;
  homeDir: string | null;
  status: ConnectionStatusState;
  errorMessage: string | null;
}

export interface PendingHostKey {
  profile: ConnectionProfile;
  fingerprint: string;
}

interface ConnectionsState {
  profiles: ConnectionProfile[];
  sessions: ConnectionSession[];
  activeSessionId: string | null;
  profilesLoaded: boolean;
  eventsInitialized: boolean;
  /** Set when a first-time host key needs the user's trust decision. */
  pendingHostKey: PendingHostKey | null;
  init: () => Promise<void>;
  refreshProfiles: () => Promise<void>;
  saveProfile: (input: Parameters<typeof connectionsApi.save>[0]) => Promise<ConnectionProfile>;
  deleteProfile: (id: string) => Promise<void>;
  connectWithProfile: (profile: ConnectionProfile, trustHostKey?: boolean) => Promise<string | null>;
  confirmHostKey: () => Promise<void>;
  cancelHostKey: () => void;
  quickConnect: (input: QuickConnectInput) => Promise<string>;
  disconnectSession: (sessionId: string) => Promise<void>;
  setActiveSession: (id: string | null) => void;
  applyStatus: (connectionId: string, status: ConnectionStatusState, message: string | null) => void;
}

export const useConnectionsStore = create<ConnectionsState>((set, get) => ({
  profiles: [],
  sessions: [],
  activeSessionId: null,
  profilesLoaded: false,
  eventsInitialized: false,
  pendingHostKey: null,

  init: async () => {
    if (!get().eventsInitialized) {
      set({ eventsInitialized: true });
      await onConnectionStatus(({ connectionId, state, message }) => {
        get().applyStatus(connectionId, state, message);
      });
    }
    await get().refreshProfiles();
  },

  refreshProfiles: async () => {
    const profiles = await connectionsApi.list();
    set({ profiles, profilesLoaded: true });
  },

  saveProfile: async (input) => {
    const profiles = await connectionsApi.save(input);
    set({ profiles });
    const saved = profiles.find((p) => p.name === input.name && p.host === input.host);
    return saved ?? profiles[profiles.length - 1];
  },

  deleteProfile: async (id) => {
    const profiles = await connectionsApi.delete(id);
    set({ profiles });
  },

  connectWithProfile: async (profile, trustHostKey) => {
    const tempId = `pending-${profile.id}`;
    const session: ConnectionSession = {
      id: tempId,
      profileId: profile.id,
      label: profile.name,
      host: profile.host,
      port: profile.port,
      username: profile.username,
      defaultRemotePath: profile.defaultRemotePath,
      homeDir: null,
      status: "connecting",
      errorMessage: null,
    };
    set((state) => ({ sessions: [...state.sessions, session], activeSessionId: tempId }));

    const dropPending = () =>
      set((state) => ({ sessions: state.sessions.filter((s) => s.id !== tempId) }));

    try {
      const secret = await connectionsApi.getSecret(profile.id, profile.authMethod);
      const outcome = await sftpApi.connect({
        host: profile.host,
        port: profile.port,
        username: profile.username,
        authMethod: profile.authMethod,
        password: profile.authMethod === "password" ? secret : undefined,
        keyPath: profile.keyPath,
        passphrase: profile.authMethod === "key" ? secret : undefined,
        profileId: profile.id,
        trustHostKey,
      });

      if (outcome.kind === "hostKeyPrompt") {
        // Not connected yet — drop the pending session and surface the trust
        // prompt; the dialog re-calls with trustHostKey on accept.
        dropPending();
        set({ pendingHostKey: { profile, fingerprint: outcome.fingerprint } });
        return null;
      }

      const { connectionId, homeDir } = outcome;
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === tempId ? { ...s, id: connectionId, homeDir, status: "connected" } : s,
        ),
        activeSessionId: connectionId,
      }));
      void connectionsApi.touch(profile.id);
      return connectionId;
    } catch (err) {
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === tempId ? { ...s, status: "error", errorMessage: String(err) } : s,
        ),
      }));
      throw err;
    }
  },

  confirmHostKey: async () => {
    const pending = get().pendingHostKey;
    if (!pending) return;
    set({ pendingHostKey: null });
    await get().connectWithProfile(pending.profile, true);
  },

  cancelHostKey: () => set({ pendingHostKey: null }),

  quickConnect: async (input) => {
    const tempId = `pending-quick-${input.host}-${Date.now()}`;
    const session: ConnectionSession = {
      id: tempId,
      profileId: null,
      label: `${input.username}@${input.host}`,
      host: input.host,
      port: input.port,
      username: input.username,
      defaultRemotePath: null,
      homeDir: null,
      status: "connecting",
      errorMessage: null,
    };
    set((state) => ({ sessions: [...state.sessions, session], activeSessionId: tempId }));

    try {
      // Quick connect has no saved profile, so host-key TOFU is skipped and
      // the backend always returns "connected".
      const outcome = await sftpApi.connect(input);
      if (outcome.kind !== "connected") {
        throw new Error("unexpected host key prompt for ad-hoc connection");
      }
      const { connectionId, homeDir } = outcome;
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === tempId ? { ...s, id: connectionId, homeDir, status: "connected" } : s,
        ),
        activeSessionId: connectionId,
      }));
      return connectionId;
    } catch (err) {
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === tempId ? { ...s, status: "error", errorMessage: String(err) } : s,
        ),
      }));
      throw err;
    }
  },

  disconnectSession: async (sessionId) => {
    await sftpApi.disconnect(sessionId).catch(() => {});
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== sessionId);
      const activeSessionId =
        state.activeSessionId === sessionId ? sessions[0]?.id ?? null : state.activeSessionId;
      return { sessions, activeSessionId };
    });
  },

  setActiveSession: (id) => set({ activeSessionId: id }),

  applyStatus: (connectionId, status, message) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === connectionId ? { ...s, status, errorMessage: message } : s,
      ),
    }));
    if (status === "disconnected" || status === "error") {
      const session = get().sessions.find((s) => s.id === connectionId);
      if (session && status === "disconnected") {
        set((state) => ({ sessions: state.sessions.filter((s) => s.id !== connectionId) }));
      }
    }
  },
}));
