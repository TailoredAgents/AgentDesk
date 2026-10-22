"use client";
import { useState } from "react";
import { Copy, Check } from "lucide-react";
export function MessageReview({
  workId,
  original,
  approved,
  disabled,
  onReview,
  notify,
}: {
  workId: string;
  original: string;
  approved?: string;
  disabled: boolean;
  onReview: (workId: string, body: string) => Promise<boolean>;
  notify: (message: string, error?: boolean) => void;
}) {
  const [body, setBody] = useState(approved || original);
  return (
    <div className="crm-draft">
      <h4>Personal-phone follow-up</h4>
      <p className="crm-footnote">
        Review a draft for your own use. Approval does not send it or change
        Lofty. If workstyle suggestions are enabled, your final edit can
        contribute one example.
      </p>
      {approved ? (
        <p>{approved}</p>
      ) : (
        <label>
          Edit your follow-up
          <textarea
            rows={4}
            maxLength={2500}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={disabled}
          />
        </label>
      )}
      <div className="crm-actions">
        {!approved && (
          <button
            className="button primary"
            disabled={disabled || body.trim().length < 3}
            onClick={() => void onReview(workId, body)}
          >
            <Check size={14} />
            Approve draft for copying
          </button>
        )}
        <button
          className="button secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(approved || body);
              notify("Draft copied. Nothing was sent.");
            } catch {
              notify(
                "Copy was unavailable. Select the text to copy it manually.",
                true,
              );
            }
          }}
        >
          <Copy size={15} />
          {approved ? "Copy approved draft" : "Copy draft"}
        </button>
      </div>
      {approved && (
        <p className="crm-footnote">Approved for copying · not sent</p>
      )}
    </div>
  );
}
