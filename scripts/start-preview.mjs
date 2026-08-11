// Serves the isolated production build (.next-verify) on a separate port so a
// UI-verification server never collides with another running dev server's .next.
import { spawn } from "node:child_process";

process.env.PREVIEW_DIST = ".next-verify";
const port = process.env.PORT || "3010";

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["next", "start", "-p", port],
  { stdio: "inherit", env: process.env },
);

child.on("exit", (code) => process.exit(code ?? 0));
