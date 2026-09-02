import { loadConfig } from "../lib/config.mjs";
import { scanMemory } from "../lib/scan.mjs";

const config = await loadConfig();
const { catalog, duplicates, brokenLinks, parseErrors } = await scanMemory(config);

let warnings = 0;
let errors = 0;

for (const item of parseErrors) {
  errors += 1;
  console.error(`error: ${item.path}: ${item.message}`);
}

for (const item of duplicates) {
  const asError = config.id.onDuplicate === "error";
  if (asError) errors += 1;
  else warnings += 1;
  const label = asError ? "error" : "warn";
  console[asError ? "error" : "warn"](
    `${label}: duplicate id "${item.id}" in ${item.paths.join(", ")}`,
  );
}

for (const item of brokenLinks) {
  warnings += 1;
  console.warn(`warn: broken link ${item.from} -> ${item.to} (${item.path})`);
}

console.log(
  `Checked ${catalog.notes.length} notes. ${warnings} warning(s), ${errors} error(s).`,
);

if (errors) process.exitCode = 1;
