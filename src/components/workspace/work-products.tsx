"use client";
import { situationImpacts } from "@/lib/intelligence";
import { useId, useRef, useState } from "react";
import {
  FileText,
  Plus,
  Download,
  Check,
  X,
  LoaderCircle,
  Copy,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import type { WorkspaceData } from "@/lib/types";
import type {
  WorkProduct,
  WorkProductContent,
  WorkProductKind,
  WorkProductVersion,
} from "@/lib/work-product-types";
import {
  Badge,
  Modal,
  SectionTitle,
  SectionNav,
  AutoTextarea,
  useDraftGuard,
  shortDate,
} from "../ui";
import { request } from "./client-api";
import { workProductContentSchema } from "@/lib/work-product-schema";

export type ProductContext = {
  kind: WorkProductKind;
  agentId: string;
  clientId?: string | null;
  propertyId?: string | null;
  sourcePackageId?: string | null;
  appointmentId?: string | null;
};
type ProductFilter = Partial<
  Pick<
    WorkProduct,
    "agentId" | "clientId" | "propertyId" | "sourcePackageId" | "appointmentId"
  >
>;
const kindName = (kind: WorkProductKind) =>
  kind === "seller_preparation"
    ? "Seller preparation package"
    : "Appointment briefing";
const sectionNames = {
  recorded_facts: "Recorded information",
  general_guidance: "General recommendations",
  open_questions: "Open questions",
  next_steps: "Proposed next steps",
};
const newest = (product: WorkProduct) =>
  [...product.versions].sort((a, b) => b.version - a.version)[0];

export function WorkProducts({
  data,
  onUpdate,
  notify,
  context,
  filter = {},
  pendingOnly = false,
  title = "Documents",
  open,
  onClose,
}: {
  data: WorkspaceData;
  onUpdate: (data: WorkspaceData) => void;
  notify: (message: string, tone?: "info" | "success" | "error") => void;
  context?: ProductContext;
  filter?: ProductFilter;
  pendingOnly?: boolean;
  title?: string;
  open?: { productId: string; versionId?: string };
  onClose?: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(
    open?.productId ?? null,
  );
  const [selectedVersion, setSelectedVersion] = useState<string | null>(
    open?.versionId ?? null,
  );
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const products = (data.workProducts || [])
    .filter((product) =>
      Object.entries(filter).every(
        ([key, value]) => product[key as keyof WorkProduct] === value,
      ),
    )
    .filter(
      (product) =>
        !pendingOnly ||
        product.versions.some((version) => version.status === "pending"),
    );
  const selectedProduct = (data.workProducts || []).find(
    (product) => product.id === selected,
  );
  const selectedRecord =
    selectedProduct?.versions.find(
      (version) => version.id === selectedVersion,
    ) || (selectedProduct ? newest(selectedProduct) : undefined);
  const generate = async (
    product?: WorkProduct,
    copyVersionId?: string,
    refreshFromCurrent?: boolean,
  ) => {
    if (submitting.current || (!context && !product)) return;
    submitting.current = true;
    setBusy(true);
    const body = product
      ? {
          kind: product.kind,
          agentId: product.agentId,
          productId: product.id,
          ...(copyVersionId ? { copyVersionId } : {}),
          ...(refreshFromCurrent ? { refreshFromCurrent: true } : {}),
        }
      : context!;
    // Unrelated workspace changes must not turn a retry of the same work into
    // a fresh request if the server saved it but its response was lost.
    const key = JSON.stringify(body) + ":" + data.workspace.id;
    if (attempt.current?.key !== key)
      attempt.current = { key, id: crypto.randomUUID() };
    try {
      const result = await request<{
        workspace: WorkspaceData;
        productId: string;
        versionId: string;
      }>("/api/work-products", "POST", {
        ...body,
        requestId: attempt.current.id,
      });
      onUpdate(result.workspace);
      setSelected(result.productId);
      setSelectedVersion(result.versionId);
      attempt.current = null;
      notify(
        copyVersionId
          ? "A new draft version is ready to edit. Earlier versions are unchanged."
          : "Document prepared for your review. Nothing has been delivered.",
      );
    } catch (error) {
      notify((error as Error).message, "error");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  if (!context && !products.length && !selectedProduct) return null;
  return (
    <section className="work-products-section">
      {!open && (
        <>
          <SectionTitle
            title={title}
            aside={
              context ? (
                <button
                  className="text-link"
                  disabled={busy || !data.capabilities.ai}
                  title={
                    !data.capabilities.ai
                      ? "Live AI is not configured; open a saved sample below."
                      : undefined
                  }
                  onClick={() => generate()}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={14} />
                  ) : (
                    <Plus size={14} />
                  )}
                  {context.kind === "seller_preparation"
                    ? "Prepare seller package"
                    : "Prepare briefing"}
                </button>
              ) : undefined
            }
          />
          {products.map((product) => {
            const latest = newest(product);
            const pending = [...product.versions]
              .sort((a, b) => b.version - a.version)
              .find((version) => version.status === "pending");
            const display = pending || latest;
            return (
              <button
                key={product.id}
                className="work-product-row"
                onClick={() => {
                  setSelected(product.id);
                  setSelectedVersion(display.id);
                }}
              >
                <span className="work-product-icon">
                  <FileText size={20} />
                </span>
                <span>
                  <strong>{display.content.title}</strong>
                  <small>
                    {kindName(product.kind)} · Version {display.version} ·{" "}
                    {data.clients.find(
                      (client) => client.id === product.clientId,
                    )?.name ||
                      data.agents.find((agent) => agent.id === product.agentId)
                        ?.name}
                  </small>
                  {situationImpacts(data).some(
                    (i) => i.versionId === display.id,
                  ) && (
                    <small className="intelligence-warning">
                      Contains information to review after a change
                    </small>
                  )}
                  {display.origin === "sample" && (
                    <small>Saved sample output</small>
                  )}
                  {product.versions.length > 1 && (
                    <small>
                      {product.versions.length} saved versions ·{" "}
                      {
                        product.versions.filter(
                          (version) => version.status === "pending",
                        ).length
                      }{" "}
                      awaiting review
                    </small>
                  )}
                </span>
                <Badge
                  tone={
                    display.status === "approved"
                      ? "green"
                      : display.status === "pending"
                        ? "blue"
                        : "neutral"
                  }
                >
                  {display.status === "approved"
                    ? "PDF ready"
                    : display.status === "pending"
                      ? "Needs review"
                      : "Rejected"}
                </Badge>
                <ChevronRight size={15} />
              </button>
            );
          })}
          {!products.length && context && (
            <p className="work-product-note">
              {data.capabilities.ai
                ? "Prepare a document from the linked records, then review its facts and recommendations before finalizing."
                : "Live generation is unavailable. Saved sample documents in the Willow Lane listing can be edited, approved, and downloaded without an API key."}
            </p>
          )}
        </>
      )}
      {selectedProduct && selectedRecord && (
        <WorkProductEditor
          key={selectedRecord.id}
          product={selectedProduct}
          version={selectedRecord}
          data={data}
          onClose={() => {
            if (!busy) {
              setSelected(null);
              setSelectedVersion(null);
              onClose?.();
            }
          }}
          onVersion={setSelectedVersion}
          onUpdate={onUpdate}
          notify={notify}
          generating={busy}
          onGenerate={(copyId, refresh) =>
            generate(selectedProduct, copyId, refresh)
          }
        />
      )}
    </section>
  );
}

function WorkProductEditor({
  product,
  version,
  data,
  onClose,
  onVersion,
  onUpdate,
  notify,
  generating,
  onGenerate,
}: {
  product: WorkProduct;
  version: WorkProductVersion;
  data: WorkspaceData;
  onClose: () => void;
  onVersion: (id: string) => void;
  onUpdate: (data: WorkspaceData) => void;
  notify: (message: string, tone?: "info" | "success" | "error") => void;
  generating: boolean;
  onGenerate: (copyVersionId?: string, refreshFromCurrent?: boolean) => void;
}) {
  const sectionId = useId();
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [content, setContent] = useState<WorkProductContent>(() =>
    structuredClone(version.content),
  );
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify(version.content),
  );
  const [editRevision, setEditRevision] = useState(version.editRevision);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const pending = version.status === "pending";
  const dirty = JSON.stringify(content) !== baseline;
  const guard = useDraftGuard(dirty);
  const editing = pending && mode === "edit";
  const validContent = workProductContentSchema.safeParse(content).success;
  const locked = !!busy || generating;
  const stale = version.editRevision !== editRevision;
  const displayed = pending ? content : version.content;
  const base = `/api/work-products/${encodeURIComponent(product.id)}/versions/${encodeURIComponent(version.id)}`;
  const save = async (decision?: "approved" | "rejected") => {
    if (submitting.current || generating || !pending) return;
    submitting.current = true;
    setBusy(decision || "save");
    setError("");
    try {
      const updated = await request<WorkspaceData>(
        decision ? base + "/review" : base,
        decision ? "POST" : "PATCH",
        {
          content,
          expectedEditRevision: editRevision,
          ...(decision ? { decision } : {}),
        },
      );
      const record = updated.workProducts
        .find((item) => item.id === product.id)
        ?.versions.find((item) => item.id === version.id);
      if (record) {
        setContent(structuredClone(record.content));
        setBaseline(JSON.stringify(record.content));
        setEditRevision(record.editRevision);
      }
      onUpdate(updated);
      notify(
        decision === "approved"
          ? "Approved PDF saved. Ready to download; nothing has been delivered."
          : decision === "rejected"
            ? "Version rejected. Earlier approved documents remain unchanged."
            : "Draft edits saved.",
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      submitting.current = false;
      setBusy("");
    }
  };
  const resetEdits = () => {
    setContent(structuredClone(version.content));
    setBaseline(JSON.stringify(version.content));
    setEditRevision(version.editRevision);
    setError("");
  };
  const editItem = (section: number, item: number, text: string) =>
    setContent((current) => ({
      ...current,
      sections: current.sections.map((value, index) =>
        index === section
          ? {
              ...value,
              items: value.items.map((entry, i) =>
                i === item ? { ...entry, text } : entry,
              ),
            }
          : value,
      ),
    }));
  return (
    <Modal
      wide
      className="document-modal"
      title={kindName(product.kind)}
      subtitle="Prepared by your workforce. Finalized by you."
      onClose={() => {
        if (!locked) guard.requestLeave(onClose);
      }}
    >
      {guard.dialog}
      <div className="work-product-editor">
        {situationImpacts(data).some((i) => i.versionId === version.id) && (
          <div className="intelligence-exceptions">
            <strong>This version contains previous information</strong>
            {situationImpacts(data)
              .filter((i) => i.versionId === version.id)
              .map((i) => (
                <p key={i.id}>{i.detail}</p>
              ))}
            <button
              className="button secondary"
              disabled={locked || dirty}
              onClick={() => onGenerate(version.id, true)}
            >
              Update draft from approved facts
            </button>
            <p className="small-text">
              Replaces affected items, retains the other sections, and creates a
              new draft for review. No AI call is needed. Earlier PDFs remain
              unchanged.
            </p>
          </div>
        )}

        <div className="product-version-toolbar">
          <label>
            Version
            <select
              aria-label="Document version"
              value={version.id}
              disabled={locked || dirty}
              onChange={(event) => onVersion(event.target.value)}
            >
              {[...product.versions]
                .sort((a, b) => b.version - a.version)
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    Version {item.version} · {item.status}
                  </option>
                ))}
            </select>
          </label>
          <Badge
            tone={
              version.status === "approved"
                ? "green"
                : version.status === "pending"
                  ? "blue"
                  : "neutral"
            }
          >
            {version.status}
          </Badge>
          <Badge>
            {version.origin === "sample"
              ? "Saved sample output"
              : "AI-prepared output"}
          </Badge>
        </div>
        <p className="work-product-note">
          {[
            version.snapshot.client?.name,
            version.snapshot.property &&
              `${version.snapshot.property.address}, ${version.snapshot.property.city}`,
            version.snapshot.agent.name,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {version.status === "approved" && version.hasPdf && (
          <div className="product-actions approved-document-access">
            <a
              className="button primary"
              href={base + "/pdf"}
              target="_blank"
              rel="noreferrer"
            >
              <FileText size={16} /> Open approved PDF
            </a>
            <a className="button secondary" href={base + "/pdf?download=1"}>
              <Download size={16} /> Download PDF
            </a>
          </div>
        )}
        <div className="document-mode-bar">
          {pending && (
            <nav className="segmented-nav" aria-label="Document mode">
              <button
                aria-pressed={mode === "preview"}
                onClick={() => setMode("preview")}
              >
                Preview
              </button>
              <button
                aria-pressed={mode === "edit"}
                onClick={() => setMode("edit")}
              >
                Edit document
              </button>
            </nav>
          )}
          <span className="save-status" role="status">
            {dirty
              ? "Unsaved edits · included in preview"
              : pending
                ? "Draft · ready for your review"
                : "Saved version"}
          </span>
        </div>
        <SectionNav
          mobileSelect
          label="Document sections"
          items={displayed.sections.map((section, index) => ({
            id: `${sectionId}-${index}`,
            label: `${index + 1}. ${section.title}`,
          }))}
        />
        {stale && pending && (
          <div className="form-error" role="alert">
            This version changed elsewhere. Reload the saved draft before
            editing or confirming.
            <button className="text-link" onClick={resetEdits}>
              Reload saved draft
            </button>
          </div>
        )}
        {editing ? (
          <div className="product-edit-fields">
            <label>
              Document title
              <input
                value={content.title}
                maxLength={160}
                disabled={locked}
                onChange={(event) =>
                  setContent({ ...content, title: event.target.value })
                }
              />
            </label>
            <label>
              Introduction
              <AutoTextarea
                rows={3}
                value={content.introduction}
                maxLength={1200}
                disabled={locked}
                onChange={(event) =>
                  setContent({ ...content, introduction: event.target.value })
                }
              />
            </label>
          </div>
        ) : (
          <>
            <h2 className="product-document-title">{displayed.title}</h2>
            <p className="product-introduction">{displayed.introduction}</p>
          </>
        )}
        {displayed.sections.map((section, sectionIndex) => (
          <section
            className="product-section"
            id={`${sectionId}-${sectionIndex}`}
            tabIndex={-1}
            key={sectionIndex}
          >
            <Badge
              tone={
                section.kind === "general_guidance"
                  ? "neutral"
                  : section.kind === "open_questions"
                    ? "amber"
                    : "blue"
              }
            >
              {sectionNames[section.kind]}
            </Badge>
            {editing ? (
              <input
                className="product-section-title"
                aria-label={`Section ${sectionIndex + 1} title`}
                value={section.title}
                maxLength={120}
                disabled={locked}
                onChange={(event) =>
                  setContent((current) => ({
                    ...current,
                    sections: current.sections.map((item, index) =>
                      index === sectionIndex
                        ? { ...item, title: event.target.value }
                        : item,
                    ),
                  }))
                }
              />
            ) : (
              <h3>{section.title}</h3>
            )}
            {section.kind === "general_guidance" && (
              <p className="work-product-note">
                Optional suggestions to discuss with your agent, not agreed
                commitments.
              </p>
            )}
            {section.items.map((item, index) => (
              <div className="product-item" key={index}>
                {!(
                  item.certainty === "general" &&
                  section.kind === "general_guidance"
                ) && (
                  <span className="product-item-label">
                    {item.certainty === "general"
                      ? "General guidance · not an agreed commitment"
                      : item.certainty}
                  </span>
                )}
                {editing ? (
                  <AutoTextarea
                    aria-label={`${section.title} item ${index + 1}`}
                    rows={2}
                    value={item.text}
                    maxLength={1000}
                    disabled={locked}
                    onChange={(event) =>
                      editItem(sectionIndex, index, event.target.value)
                    }
                  />
                ) : (
                  <p>{item.text}</p>
                )}
                {item.sourceQuote && (
                  <details className="source-evidence">
                    <summary>Source evidence</summary>
                    <p>“{item.sourceQuote}”</p>
                    <small>
                      {version.snapshot.sources.find(
                        (source) => source.id === item.sourceId,
                      )?.label || "Recorded source"}
                    </small>
                  </details>
                )}
              </div>
            ))}
          </section>
        ))}
        <details className="source-evidence product-source-history">
          <summary>Original proposal, sources & history</summary>
          <p>
            Prepared {shortDate(version.createdAt)}. Source records are
            preserved with this version; later workspace changes do not silently
            alter it.
          </p>
          <details>
            <summary>Original proposed document</summary>
            <h4>{version.originalContent.title}</h4>
            <p>{version.originalContent.introduction}</p>
            {version.originalContent.sections.map((section, index) => (
              <div key={index}>
                <strong>{section.title}</strong>
                <ul>
                  {section.items.map((item, i) => (
                    <li key={i}>{item.text}</li>
                  ))}
                </ul>
              </div>
            ))}
          </details>
          {version.snapshot.sources.map((source) => (
            <details key={source.id}>
              <summary>{source.label}</summary>
              <p>{source.text}</p>
            </details>
          ))}
          {(version.history || []).map((event) => (
            <details key={event.id}>
              <summary>
                {event.event} · {new Date(event.createdAt).toLocaleString()} ·{" "}
                {event.actor}
              </summary>
              <p>
                Saved revision {event.editRevision}: {event.content.title}
              </p>
              <p>{event.content.introduction}</p>
              {event.content.sections.map((section, index) => (
                <div key={index}>
                  <strong>{section.title}</strong>
                  <ul>
                    {section.items.map((item, i) => (
                      <li key={i}>{item.text}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </details>
          ))}
        </details>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        {pending && !validContent && (
          <p className="form-error" role="alert">
            Each title and checklist item needs at least 3 characters, and the
            introduction needs at least 10. Complete the text before saving a
            decision.
          </p>
        )}
        {pending ? (
          <>
            <div className="review-effects-preview">
              <strong>When you approve</strong>
              <p>
                Save your edited content, record your approval, and generate a
                durable PDF for this version. No email, text, calendar event, or
                external CRM update will occur.
              </p>
              <p>
                Check dates and source evidence. General recommendations are
                suggestions, not commitments the seller has made.
              </p>
            </div>
            <button
              className="button secondary"
              disabled={locked || stale || !validContent}
              onClick={() => save("rejected")}
            >
              <X size={15} />
              Reject version
            </button>
            {dirty && (
              <p className="work-product-note">
                You have unsaved edits. Save or discard them before switching
                versions or making another draft.
              </p>
            )}
            <div className="product-actions sticky-actions document-review-actions">
              {(editing || dirty) && (
                <button
                  className="button secondary"
                  disabled={locked || !dirty || stale || !validContent}
                  onClick={() => save()}
                >
                  {busy === "save" ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : (
                    <Check size={15} />
                  )}
                  Save draft edits
                </button>
              )}
              {dirty && (
                <button
                  className="text-link"
                  disabled={locked}
                  onClick={resetEdits}
                >
                  Discard unsaved edits
                </button>
              )}
              <button
                className="button primary"
                disabled={
                  locked ||
                  stale ||
                  !validContent ||
                  !content.title.trim() ||
                  !content.introduction.trim() ||
                  content.sections.some((section) =>
                    section.items.some((item) => !item.text.trim()),
                  )
                }
                onClick={() => save("approved")}
              >
                {busy === "approved" ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Check size={16} />
                )}
                Approve & generate PDF
              </button>
            </div>
          </>
        ) : (
          <div className="review-effects-preview">
            <strong>
              {version.status === "approved"
                ? "Approved version · content is locked"
                : "Rejected version · retained in history"}
            </strong>
            <p>
              {version.reviewedAt
                ? `Reviewed ${new Date(version.reviewedAt).toLocaleString()} by ${version.reviewer || "the shared workspace reviewer"}.`
                : ""}{" "}
              Create a new draft version to make changes. Existing approved PDFs
              remain unchanged.
            </p>
          </div>
        )}
        <div className="product-actions product-version-actions">
          <button
            className="button secondary"
            disabled={locked || dirty}
            onClick={() => onGenerate(version.id)}
          >
            <Copy size={15} />
            New draft version
          </button>
          <button
            className="text-link"
            disabled={locked || dirty || !data.capabilities.ai}
            title={
              !data.capabilities.ai
                ? "Live generation requires a server API key."
                : undefined
            }
            onClick={() => onGenerate()}
          >
            {generating ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <RefreshCw size={15} />
            )}
            Regenerate with AI
          </button>
        </div>
        <p className="work-product-note">
          Downloading a PDF does not prove delivery. Share it using your normal
          tools. No client follow-up is completed automatically.
        </p>
      </div>
    </Modal>
  );
}
