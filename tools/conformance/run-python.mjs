import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const result = spawnSync("npm", ["run", "test:python"], { cwd: root, stdio: "inherit" });
process.exitCode = result.status ?? 1;
