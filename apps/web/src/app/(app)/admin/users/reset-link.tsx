"use client";

import { useActionState, useRef, useState } from "react";

import { inputClass, subtleButtonClass } from "@/components/form";
import { Alert } from "@/components/ui";
import type { ResetLinkState } from "@/lib/user-admin";

import { createResetLinkAction } from "./actions";

const INITIAL_STATE: ResetLinkState = {};

/** Creates a one-time password reset link for one person and shows it for copying. */
export function ResetLink({ userId, label }: { userId: string; label: string }) {
  const [state, formAction, pending] = useActionState(createResetLinkAction, INITIAL_STATE);

  return (
    <div className="space-y-3">
      <form action={formAction}>
        <input type="hidden" name="userId" value={userId} />
        <button
          type="submit"
          disabled={pending}
          aria-label={`Create reset link for ${label}`}
          className={subtleButtonClass}
        >
          Create reset link
        </button>
      </form>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.url && <CopyableLink key={state.url} url={state.url} label={label} />}
    </div>
  );
}

function CopyableLink({ url, label }: { url: string; label: string }) {
  const field = useRef<HTMLInputElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    // navigator.clipboard exists only on HTTPS and localhost, and a self-hosted
    // instance is often on a plain HTTP address, so the older route has to work too.
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
    } catch {
      field.current?.select();
      setCopyState(document.execCommand("copy") ? "copied" : "failed");
    }
  }

  return (
    <Alert>
      <p className="mb-2">
        Send this link to {label}. It works once and expires in an hour. Anyone who has it can set a
        new password for this account, so send it only to them.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={field}
          readOnly
          aria-label={`Password reset link for ${label}`}
          value={url}
          onFocus={(event) => event.target.select()}
          className={`${inputClass} min-w-48 flex-1 font-mono text-xs`}
        />
        <button type="button" onClick={copy} className={subtleButtonClass}>
          {copyState === "copied" ? "Copied" : "Copy link"}
        </button>
      </div>
      {copyState === "failed" && (
        <p className="mt-2">Couldn&apos;t copy it automatically. Select the link and copy it.</p>
      )}
    </Alert>
  );
}
