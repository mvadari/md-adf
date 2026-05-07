const message = [
  "Do not pack or publish the repository root.",
  "Use `npm run pack:js -- --dry-run` to inspect the JavaScript package.",
  "Use `npm run publish:js` to publish the JavaScript package.",
].join("\n");

console.error(message);
process.exit(1);
