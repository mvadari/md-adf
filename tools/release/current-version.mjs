import fs from "node:fs";

const jsPackage = JSON.parse(
  fs.readFileSync(new URL("../../packages/js/package.json", import.meta.url), "utf8"),
);
const pyProject = fs.readFileSync(
  new URL("../../packages/python/pyproject.toml", import.meta.url),
  "utf8",
);
const pyVersion = pyProject.match(/^version = "([^"]+)"$/m)?.[1];

if (jsPackage.version !== pyVersion) {
  throw new Error(
    `JS version (${jsPackage.version}) does not match Python version (${pyVersion ?? "missing"})`,
  );
}

process.stdout.write(jsPackage.version);
