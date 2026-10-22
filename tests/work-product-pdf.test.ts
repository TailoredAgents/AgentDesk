import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { renderWorkProductPdf } from "../src/lib/work-product-pdf";
import { sellerPdfFixture } from "./fixtures/work-product";

test("seller work product produces a real, readable-sized, multipage PDF with metadata", async () => {
  const fixture = sellerPdfFixture();
  const bytes = await renderWorkProductPdf(fixture);
  assert.ok(bytes.subarray(0, 8).toString().startsWith("%PDF-"));
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getTitle(), fixture.content.title);
  assert.equal(pdf.getAuthor(), fixture.snapshot.agent.name);
  assert.ok(pdf.getPageCount() >= 2 && pdf.getPageCount() <= 5);
  for (const page of pdf.getPages()) assert.deepEqual(page.getSize(), { width: 612, height: 792 });
  assert.ok(bytes.length > 10000 && bytes.length < 1024 * 1024);
});
test("long edited content flows over additional pages without dropping the PDF structure", async () => {
  const fixture = sellerPdfFixture();
  fixture.content.sections.push({ title: "Additional preparation considerations", kind: "general_guidance", items: Array.from({ length: 10 }, (_, i) => ({ text: `Item ${i + 1}. ` + "Discuss these optional preparation ideas with your agent before making changes. ".repeat(10), certainty: "general", sourceId: null, sourceQuote: null })) });
  const pdf = await PDFDocument.load(await renderWorkProductPdf(fixture));
  assert.ok(pdf.getPageCount() >= 5 && pdf.getPageCount() <= 10);
  assert.equal(pdf.getPages().length, pdf.getPageCount());
});
