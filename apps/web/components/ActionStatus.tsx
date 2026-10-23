"use client";

import type { Action } from "@/lib/api";
import { ErrorBox } from "./ui";

export function ActionStatus({ action }: { action: Action }) {
  return (
    <div aria-live="polite">
      <ErrorBox error={action.error} />
      {action.message ? <div className="success">{action.message}</div> : null}
    </div>
  );
}
