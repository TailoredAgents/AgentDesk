import type { Property, Task, WorkspaceData } from "./types";

export function isOverdue(task: Task, referenceDate: string) {
  return (
    task.status === "open" &&
    Boolean(task.dueDate && task.dueDate.slice(0, 10) < referenceDate)
  );
}

export function orderedTasks(tasks: Task[], referenceDate: string) {
  return [...tasks].sort(
    (a, b) =>
      Number(isOverdue(b, referenceDate)) -
        Number(isOverdue(a, referenceDate)) ||
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
      Number(b.priority === "high") - Number(a.priority === "high") ||
      a.title.localeCompare(b.title),
  );
}

// A later listing stage is not evidence that an individual preparation task was completed.
export function listingMilestones(property: Property, tasks: Task[]) {
  const linked = tasks.filter((task) => task.propertyId === property.id);
  const photography = linked.filter((task) =>
    /photo|photograph/i.test(task.title),
  );
  const preparation = linked.filter((task) => !photography.includes(task));
  const group = (title: string, records: Task[]) => ({
    title,
    complete:
      records.length > 0 && records.every((task) => task.status === "done"),
    detail: records.length
      ? `${records.filter((task) => task.status === "done").length} of ${records.length} tasks complete`
      : "No task evidence recorded",
  });
  return [
    group("Preparation", preparation),
    group("Photography", photography),
    {
      title: "Launch target",
      complete: false,
      detail: property.targetDate
        ? `${property.targetDate.slice(0, 10)} · target only`
        : "No target recorded",
    },
    { title: "Listing status", complete: false, detail: property.stage },
  ];
}

export function teamInsights(data: WorkspaceData) {
  const open = data.tasks.filter((task) => task.status === "open");
  const overdue = open.filter((task) =>
    isOverdue(task, data.workspace.referenceDate),
  );
  const pending = data.packages.filter((pkg) => pkg.status === "pending");
  const agentReviews = new Set(pending.map((pkg) => pkg.agentId)).size;
  const dependencies = data.commitments.filter(
    (item) => item.status === "open" && item.kind === "dependency",
  );
  const listings = data.properties.filter(
    (property) =>
      open.some((task) => task.propertyId === property.id) ||
      dependencies.some((item) => item.propertyId === property.id),
  );
  const livePackages = data.packages.filter((pkg) => pkg.origin === "openai");
  return {
    overdue,
    pending,
    dependencies,
    listings,
    agentReviews,
    livePackages,
    liveUsers: new Set(livePackages.map((pkg) => pkg.agentId)).size,
    summary: `${agentReviews} ${agentReviews === 1 ? "agent has" : "agents have"} work awaiting review. ${overdue.length} open ${overdue.length === 1 ? "task is" : "tasks are"} overdue against the workspace date. ${listings.length} ${listings.length === 1 ? "listing has" : "listings have"} outstanding tasks or dependencies.`,
    coaching: dependencies.length
      ? `Clarify ownership and confirmation steps for “${dependencies[0].title}”. Review a pending draft together before discussing communication style.`
      : overdue.length
        ? "Review the overdue commitments together and agree on the next recorded step. A saved draft does not establish that a client was contacted."
        : pending.length
          ? "Use one pending package to practice checking source evidence and approving only the actions that are ready."
          : "Use the next conversation to practice source checking and deliberate approvals.",
  };
}
