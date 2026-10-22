"use client";
import { useState } from "react";
import { Copy } from "lucide-react";

export function MessageActions({
  body,
  notify,
}: {
  body: string;
  notify: (message: string, tone?: "info" | "success" | "error") => void;
}) {
  const [fallback, setFallback] = useState(false);
  return (
    <div className="message-actions">
      <button
        className="copy-draft"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(body);
            setFallback(false);
            notify(
              "Approved draft copied. Use your normal messaging tools; nothing was sent or marked complete.",
            );
          } catch {
            setFallback(true);
            notify(
              "Clipboard access is unavailable. Select and copy the draft below.",
            );
          }
        }}
      >
        <Copy size={13} />
        Copy approved draft
      </button>
      {fallback && (
        <label className="copy-fallback">
          Select and copy this approved draft
          <textarea
            readOnly
            value={body}
            aria-label="Approved draft to copy"
            onFocus={(event) => event.target.select()}
            rows={5}
          />
        </label>
      )}
      <small>
        Use your own phone or CRM. Copying does not send a message or complete a
        follow-up.
      </small>
    </div>
  );
}
