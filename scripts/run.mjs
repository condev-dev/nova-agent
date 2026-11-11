import { spawn } from "node:child_process";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/run.mjs <js-entry> [args...]");
  process.exit(1);
}

const withScheme = (value) =>
  !value || /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`;

for (const key of ["HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy"]) {
  const fixed = withScheme(process.env[key]);
  if (fixed) process.env[key] = fixed;
}

const proxyValue =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy;
if (proxyValue) {
  for (const key of ["HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy"]) {
    if (!process.env[key]) process.env[key] = proxyValue;
  }
}

const nodeOptions = [process.env.NODE_OPTIONS, "--import ./scripts/proxy-preload.mjs"]
  .filter(Boolean)
  .join(" ");
process.env.NODE_OPTIONS = nodeOptions;

const child = spawn(process.execPath, ["--use-env-proxy", ...args], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 1));
