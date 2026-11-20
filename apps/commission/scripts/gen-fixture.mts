/** Writes the committed synthetic e2e fixture from the in-memory builder. */
import { writeFileSync } from "node:fs";
import { buildSyntheticWorkbook } from "@/../tests/unit/import/synthetic";
const bytes = await buildSyntheticWorkbook();
writeFileSync("tests/fixtures/synthetic-workbook.xlsx", bytes);
console.log("wrote tests/fixtures/synthetic-workbook.xlsx", bytes.length, "bytes");
