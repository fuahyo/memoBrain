import { loadConfig } from "../lib/config.mjs";
import { writeIndex } from "../lib/index-io.mjs";
import { scanMemory } from "../lib/scan.mjs";

const config = await loadConfig();
const result = await scanMemory(config);

for (const error of result.parseErrors) {
  console.warn(`parse error: ${error.path}: ${error.message}`);
}

reportDuplicates(result.duplicates, config.id.onDuplicate);
reportBrokenLinks(result.brokenLinks);

const { catalogPath, graphPath } = await writeIndex(config, result);
console.log(`Wrote ${result.catalog.notes.length} notes`);
console.log(catalogPath);
console.log(graphPath);

if (config.id.onDuplicate === "error" && result.duplicates.length) {
  process.exitCode = 1;
}

function reportDuplicates(duplicates, mode) {
  for (const item of duplicates) {
    const label = mode === "error" ? "error" : "warn";
    console[mode === "error" ? "error" : "warn"](
      `${label}: duplicate id "${item.id}" in ${item.paths.join(", ")}`,
    );
  }
}

function reportBrokenLinks(brokenLinks) {
  for (const item of brokenLinks) {
    console.warn(`warn: broken link ${item.from} -> ${item.to} (${item.path})`);
  }
}
