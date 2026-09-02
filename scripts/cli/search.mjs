import { loadConfig } from "../lib/config.mjs";
import { scanMemory, searchNotes } from "../lib/scan.mjs";

const args = process.argv.slice(2);
const tagFlag = args.indexOf("--tag");
const tag = tagFlag >= 0 ? String(args[tagFlag + 1] ?? "") : "";
const query = args.filter((arg, index) => {
  if (arg === "--tag") return false;
  if (tagFlag >= 0 && index === tagFlag + 1) return false;
  return true;
}).join(" ");

if (!query && !tag) {
  console.error("Usage: npm run search -- <keyword> [--tag <tag>]");
  process.exitCode = 1;
  process.exit();
}

const config = await loadConfig();
const { catalog } = await scanMemory(config);
const matches = searchNotes(catalog.notes, { query, tag });

if (!matches.length) {
  console.log("No matches.");
  process.exit(0);
}

for (const note of matches) {
  const tags = note.tags.length ? ` [${note.tags.join(", ")}]` : "";
  console.log(`${note.id}\t${note.title}\t${note.path}${tags}`);
}

process.exit(0);
