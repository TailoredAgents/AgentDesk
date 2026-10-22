import PDFDocument from "pdfkit";
import path from "node:path";
import type { WorkProduct, WorkProductContent, WorkProductSnapshot } from "./work-product-types";

const NAVY = "#182F4D", BLUE = "#3554E8", INK = "#26354A", MUTED = "#657386", RULE = "#DEE4EA";
const sectionLabels = {
  recorded_facts: "FROM YOUR RECORDS",
  general_guidance: "GENERAL RECOMMENDATIONS",
  open_questions: "TO CONFIRM TOGETHER",
  next_steps: "YOUR NEXT STEPS",
};
const certaintyLabels = { confirmed: "Recorded", requested: "Requested - not confirmed", uncertain: "Needs confirmation", general: "Optional guidance" };
// Normalize nonbreaking punctuation that can disrupt wrapping, without altering words.
const clean = (value: string) => value.normalize("NFC").replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\u00a0/g, " ").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

/** Server-side, bounded in-memory rendering. The approved bytes are persisted in PostgreSQL. */
export async function renderWorkProductPdf(input: {
  productId: string;
  kind: WorkProduct["kind"];
  version: number;
  content: WorkProductContent;
  snapshot: WorkProductSnapshot;
  createdAt: string;
}): Promise<Buffer> {
  const { content, snapshot } = input;
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 54, bottom: 72, left: 48, right: 48 }, bufferPages: true, autoFirstPage: false,
    info: { Title: clean(content.title), Author: clean(snapshot.agent.name), Subject: input.kind === "seller_preparation" ? "Seller preparation guide" : "Appointment preparation briefing", Creator: "AgentDesk", CreationDate: new Date(input.createdAt) } });
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    let size = 0;
    doc.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 4 * 1024 * 1024) { doc.destroy(new Error("Document exceeds the supported size.")); return; } chunks.push(chunk); });
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const fontRoot = path.join(process.cwd(), "node_modules", "@fontsource", "inter", "files");
  doc.registerFont("Body", path.join(fontRoot, "inter-latin-400-normal.woff"));
  doc.registerFont("Strong", path.join(fontRoot, "inter-latin-600-normal.woff"));
  const left = 48, width = 516, bottom = 716;
  let y = 0;
  function text(value: string, x: number, top: number, size = 10, font = "Body", color = INK, w = width) {
    doc.font(font).fontSize(size).fillColor(color.startsWith("#") ? color : `#${color}`).text(clean(value), x, top, { width: w, lineGap: 3 });
    return doc.y;
  }
  function height(value: string, size = 10, font = "Body", w = width) {
    return doc.font(font).fontSize(size).heightOfString(clean(value), { width: w, lineGap: 3 });
  }
  function newPage(first = false) {
    if (doc.bufferedPageRange().count >= 24) throw new Error("Please shorten this document before finalizing it.");
    doc.addPage();
    if (first) {
      doc.rect(0, 0, 612, 119).fill(NAVY);
      doc.roundedRect(left, 35, 26, 26, 7).fill(BLUE);
      text("a", left + 7, 35, 21, "Strong", "FFFFFF", 20);
      text("AgentDesk.", left + 38, 37, 19, "Strong", "FFFFFF", 300);
      text(input.kind === "seller_preparation" ? "A THOUGHTFUL START TO YOUR NEXT CHAPTER" : "A CLEARER PICTURE BEFORE YOU MEET", left, 86, 8, "Strong", "D8E1F3");
      y = 147;
    } else {
      text("AgentDesk.", left, 28, 12, "Strong", NAVY, 180);
      text(snapshot.property?.address || snapshot.client?.name || "Appointment preparation", 240, 30, 8, "Body", MUTED, 324);
      doc.moveTo(left, 53).lineTo(564, 53).lineWidth(0.6).strokeColor(RULE).stroke();
      y = 72;
    }
  }
  function reserve(amount: number) { if (y + amount > bottom) newPage(); }
  try {
    newPage(true);
    if (snapshot.sample) { y = text("FICTIONAL PRESENTATION SAMPLE", left, y, 8, "Strong", BLUE) + 14; }
    y = text(content.title, left, y, 30, "Times-Roman", NAVY) + 14;
    const location = snapshot.property ? `${snapshot.property.address}\n${snapshot.property.city}` : snapshot.appointment?.title || "Your upcoming appointment";
    reserve(height(location, 14, "Strong") + 75);
    y = text(location, left, y, 14, "Strong", INK) + 12;
    const forWhom = snapshot.client ? `Prepared for ${snapshot.client.name}` : "Prepared for your appointment";
    y = text(`${forWhom}  |  ${snapshot.agent.name}`, left, y, 9, "Body", MUTED) + 21;
    reserve(height(content.introduction, 11) + 25);
    y = text(content.introduction, left, y, 11) + 26;
    for (const section of content.sections) {
      const sectionHeight = height(section.title, 20, "Times-Roman") + 38;
      const itemsHeight = section.items.reduce((total, item) => total + height(item.text, 10, "Body", width - 28) + (item.certainty === "general" && section.kind === "general_guidance" ? 16 : 32), 0);
      const sectionTotal = sectionHeight + itemsHeight + (section.kind === "general_guidance" ? 48 : 10);
      // Keep a normal-sized section together; very long edits may span pages.
      reserve(sectionTotal <= bottom - 72 ? sectionTotal : sectionHeight + height(section.items[0].text, 10, "Body", width - 28) + 32);
      doc.moveTo(left, y).lineTo(564, y).lineWidth(0.6).strokeColor(RULE).stroke();
      y += 16;
      y = text(sectionLabels[section.kind], left, y, 7.5, "Strong", BLUE) + 7;
      y = text(section.title, left, y, 20, "Times-Roman", NAVY) + 12;
      if (section.kind === "general_guidance") {
        reserve(42);
        y = text("Suggestions to consider with your agent. These are not recorded commitments or confirmed property conditions.", left, y, 8.5, "Body", MUTED) + 13;
      }
      for (const item of section.items) {
        const showLabel = item.certainty !== "general" || section.kind !== "general_guidance";
        const itemHeight = height(item.text, 10, "Body", width - 28) + (showLabel ? 32 : 16);
        reserve(itemHeight);
        if (section.kind === "general_guidance" || section.kind === "next_steps") doc.roundedRect(left + 1, y + (showLabel ? 20 : 4), 8, 8, 1.5).lineWidth(0.7).strokeColor("#AAB6C7").stroke();
        else doc.circle(left + 5, y + 24, 2.2).fill(BLUE);
        if (showLabel) y = text(certaintyLabels[item.certainty], left + 23, y, 7.5, "Strong", item.certainty === "uncertain" || item.certainty === "requested" ? "936D2D" : MUTED, width - 23) + 5;
        y = text(item.text, left + 23, y, 10, "Body", INK, width - 28) + 15;
      }
      y += 10;
    }
    const contact = `${snapshot.agent.name}${snapshot.agent.email ? `\n${snapshot.agent.email}` : ""}`;
    reserve(height(contact, 10, "Strong") + 109);
    doc.roundedRect(left, y, width, height(contact, 10, "Strong") + 50, 8).fill("#F1F4F8");
    text("LET'S TAKE THE NEXT STEP TOGETHER", left + 18, y + 14, 7.5, "Strong", BLUE, width - 36);
    y = text(contact, left + 18, y + 33, 10, "Strong", NAVY, width - 36) + 35;
    y = text("Agent-reviewed preparation material. General guidance is optional; requested dates remain subject to confirmation. This is not a contract or legal advice.", left, y, 8, "Body", MUTED) + 10;
    const pages = doc.bufferedPageRange();
    for (let page = pages.start; page < pages.start + pages.count; page++) {
      doc.switchToPage(page);
      doc.moveTo(left, 742).lineTo(564, 742).lineWidth(0.6).strokeColor(RULE).stroke();
      // Footer is below the body margin; disable automatic wrapping/page creation.
      doc.font("Body").fontSize(7).fillColor(MUTED).text(`AGENTDESK  /  VERSION ${input.version}  /  ${input.productId.slice(0, 8)}`, left, 754, { lineBreak: false });
      doc.text(`${page + 1} / ${pages.count}`, 535, 754, { lineBreak: false });
    }
    doc.end();
  } catch (error) { doc.destroy(error as Error); }
  return output;
}
