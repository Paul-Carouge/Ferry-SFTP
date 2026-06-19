"use client";

import { useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { useConnectionsStore } from "@/lib/stores/connectionsStore";
import { useT } from "@/lib/i18n/useT";
import type { AuthMethod, ConnectionProfile } from "@/lib/api";

const COLORS = ["#6366f1", "#ef4444", "#f59e0b", "#22c55e", "#06b6d4", "#a855f7", "#6b7280"];

interface FormState {
  name: string;
  host: string;
  port: string;
  username: string;
  authMethod: AuthMethod;
  password: string;
  keyPath: string;
  passphrase: string;
  defaultRemotePath: string;
  color: string;
  favorite: boolean;
  save: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  host: "",
  port: "22",
  username: "",
  authMethod: "password",
  password: "",
  keyPath: "",
  passphrase: "",
  defaultRemotePath: "",
  color: COLORS[0],
  favorite: false,
  save: true,
};

export function ConnectionDialog({
  open,
  onClose,
  editingProfile,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  editingProfile?: ConnectionProfile | null;
  onConnected?: (sessionId: string) => void;
}) {
  const t = useT();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveProfile = useConnectionsStore((s) => s.saveProfile);
  const connectWithProfile = useConnectionsStore((s) => s.connectWithProfile);
  const quickConnect = useConnectionsStore((s) => s.quickConnect);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setError(null);
      if (editingProfile) {
        setForm({
          name: editingProfile.name,
          host: editingProfile.host,
          port: String(editingProfile.port),
          username: editingProfile.username,
          authMethod: editingProfile.authMethod,
          password: "",
          keyPath: editingProfile.keyPath ?? "",
          passphrase: "",
          defaultRemotePath: editingProfile.defaultRemotePath ?? "",
          color: editingProfile.color ?? COLORS[0],
          favorite: editingProfile.favorite,
          save: true,
        });
      } else {
        setForm(EMPTY_FORM);
      }
    }
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function browseForKey() {
    const path = await openFileDialog({ multiple: false, title: t("connDialog.selectKeyDialogTitle") });
    if (typeof path === "string") update("keyPath", path);
  }

  async function handleConnect() {
    setError(null);
    setConnecting(true);
    try {
      const port = Number.parseInt(form.port, 10) || 22;
      const secret = form.authMethod === "password" ? form.password : form.passphrase;

      if (form.save) {
        const profile = await saveProfile({
          id: editingProfile?.id ?? null,
          name: form.name || `${form.username}@${form.host}`,
          host: form.host,
          port,
          username: form.username,
          authMethod: form.authMethod,
          keyPath: form.authMethod === "key" ? form.keyPath : null,
          defaultRemotePath: form.defaultRemotePath || null,
          color: form.color,
          favorite: form.favorite,
          secret: secret || null,
        });
        const sessionId = await connectWithProfile(profile);
        onConnected?.(sessionId);
      } else {
        const sessionId = await quickConnect({
          host: form.host,
          port,
          username: form.username,
          authMethod: form.authMethod,
          password: form.authMethod === "password" ? form.password : undefined,
          keyPath: form.authMethod === "key" ? form.keyPath : undefined,
          passphrase: form.authMethod === "key" ? form.passphrase : undefined,
        });
        onConnected?.(sessionId);
      }
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setConnecting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} width="max-w-lg">
      <h2 className="text-sm font-semibold text-foreground">
        {editingProfile ? t("connDialog.editConnection") : t("connDialog.newConnection")}
      </h2>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label={t("connDialog.name")} className="col-span-2">
          <input
            className={inputClass}
            placeholder={t("connDialog.namePlaceholder")}
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </Field>

        <Field label={t("connDialog.host")} className="col-span-2">
          <input
            className={inputClass}
            placeholder={t("connDialog.hostPlaceholder")}
            value={form.host}
            onChange={(e) => update("host", e.target.value)}
          />
        </Field>

        <Field label={t("connDialog.port")}>
          <input
            className={inputClass}
            value={form.port}
            onChange={(e) => update("port", e.target.value.replace(/\D/g, ""))}
          />
        </Field>

        <Field label={t("connDialog.username")}>
          <input
            className={inputClass}
            value={form.username}
            onChange={(e) => update("username", e.target.value)}
          />
        </Field>

        <div className="col-span-2 flex gap-1.5 rounded-lg bg-surface-2 p-1">
          {(["password", "key"] as AuthMethod[]).map((method) => (
            <button
              key={method}
              onClick={() => update("authMethod", method)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                form.authMethod === method
                  ? "bg-surface-1 text-foreground shadow-sm"
                  : "text-foreground-muted hover:text-foreground"
              }`}
            >
              {method === "password" ? t("connDialog.password") : t("connDialog.sshKey")}
            </button>
          ))}
        </div>

        {form.authMethod === "password" ? (
          <Field label={t("connDialog.password")} className="col-span-2">
            <input
              type="password"
              className={inputClass}
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
            />
          </Field>
        ) : (
          <>
            <Field label={t("connDialog.privateKey")} className="col-span-2">
              <div className="flex gap-2">
                <input
                  className={inputClass}
                  placeholder={t("connDialog.keyPathPlaceholder")}
                  value={form.keyPath}
                  onChange={(e) => update("keyPath", e.target.value)}
                />
                <Button variant="secondary" onClick={browseForKey} type="button">
                  {t("connDialog.browse")}
                </Button>
              </div>
            </Field>
            <Field label={t("connDialog.passphrase")} className="col-span-2">
              <input
                type="password"
                className={inputClass}
                value={form.passphrase}
                onChange={(e) => update("passphrase", e.target.value)}
              />
            </Field>
          </>
        )}

        <Field label={t("connDialog.defaultRemotePath")} className="col-span-2">
          <input
            className={inputClass}
            placeholder="/"
            value={form.defaultRemotePath}
            onChange={(e) => update("defaultRemotePath", e.target.value)}
          />
        </Field>

        <div className="col-span-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => update("color", c)}
                style={{ background: c }}
                className={`size-5 rounded-full transition-transform ${
                  form.color === c ? "scale-110 ring-2 ring-offset-2 ring-offset-surface-1 ring-foreground/40" : ""
                }`}
              />
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-sm text-foreground-muted">
            <input
              type="checkbox"
              checked={form.favorite}
              onChange={(e) => update("favorite", e.target.checked)}
            />
            {t("connDialog.favorite")}
          </label>
        </div>

        <label className="col-span-2 flex items-center gap-1.5 text-sm text-foreground-muted">
          <input
            type="checkbox"
            checked={form.save}
            onChange={(e) => update("save", e.target.checked)}
          />
          {t("connDialog.saveConnection")}
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          disabled={connecting || !form.host || !form.username}
          onClick={handleConnect}
        >
          {connecting ? t("connDialog.connecting") : t("connDialog.connect")}
        </Button>
      </div>
    </Modal>
  );
}

const inputClass =
  "w-full rounded-lg border border-border bg-surface-0 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-medium text-foreground-muted">{label}</span>
      {children}
    </label>
  );
}
