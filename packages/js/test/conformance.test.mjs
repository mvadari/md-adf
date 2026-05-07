import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(here, "../../../fixtures/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

console.log(`JS conformance placeholder loaded ${manifest.cases.length} fixture cases.`);
console.log("Conversion fixtures are marked xfail until conversion logic is implemented.");
