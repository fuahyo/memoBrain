import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeIndex(config, { catalog, graph }) {
  await mkdir(config.paths.index, { recursive: true });
  const catalogPath = path.join(config.paths.index, "catalog.json");
  const graphPath = path.join(config.paths.index, "graph.json");
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");
  await writeFile(graphPath, JSON.stringify(graph, null, 2) + "\n", "utf8");
  return { catalogPath, graphPath };
}
