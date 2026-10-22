import { mkdir, writeFile } from "node:fs/promises";
import { renderWorkProductPdf } from "../src/lib/work-product-pdf";
import { sellerPdfFixture } from "../tests/fixtures/work-product";

// Fictional fixtures only. This command does not connect to a database or AI provider.
async function main() {
  await mkdir("output/pdf", { recursive: true });
  const filename = "output/pdf/agentdesk-seller-preparation-sample.pdf";
  await writeFile(filename, await renderWorkProductPdf(sellerPdfFixture()));
  console.log(filename);
}
main().catch(() => { console.error("The fictional sample PDF could not be rendered."); process.exitCode = 1; });
