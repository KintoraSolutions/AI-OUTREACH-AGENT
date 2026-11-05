/**
 * Production build into an isolated output directory.
 *
 * `next dev` and `next build` both write to `.next`. Running a production
 * build while a dev server is up replaces the chunks that server is serving:
 * the browser then 404s on every stylesheet and the app renders as unstyled
 * HTML, which looks like a catastrophic CSS failure rather than a build
 * collision.
 *
 * `next.config.ts` already honours `PREVIEW_DIST` for exactly this, and
 * `.gitignore` already excludes `.next-verify`. This script joins them up, and
 * sets the variable in-process so it behaves the same in cmd, PowerShell and a
 * POSIX shell.
 *
 * There is a second collision that isolating the output directory does NOT
 * solve. On Windows a running dev server holds the generated Prisma query
 * engine open, so `prisma generate` fails with EPERM while renaming the DLL
 * into place. That step only matters when the schema has changed, and the goal
 * here is to verify the Next build, so a failure is tolerated when a generated
 * client already exists. Run `npm run db:generate` with the dev server stopped
 * after changing `schema.prisma`.
 *
 * Usage: npm run build:verify
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const DIST = process.env.PREVIEW_DIST || ".next-verify";
const env = { ...process.env, PREVIEW_DIST: DIST };
const PRISMA_CLIENT = "node_modules/.prisma/client";

/** Whole command strings: with `shell: true` Node only concatenates an args
 *  array, which it warns about (DEP0190). These are fixed literals. */
function run(command) {
  console.log(`\n> ${command}  (distDir: ${DIST})\n`);
  const result = spawnSync(command, { env, stdio: "inherit", shell: true });
  if (result.error) {
    console.error(`Failed to start "${command}": ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

if (run("prisma generate") !== 0) {
  if (!existsSync(PRISMA_CLIENT)) {
    console.error(
      "\nprisma generate failed and no generated client exists, so the build " +
        "cannot proceed.\nStop the dev server and run: npm run db:generate\n",
    );
    process.exit(1);
  }
  console.warn(
    "\nprisma generate failed, most likely because a dev server holds the " +
      "query engine open.\nA generated client already exists, so the build " +
      "will continue with it. If you changed schema.prisma,\nstop the dev " +
      "server and run: npm run db:generate\n",
  );
}

/**
 * `next build` rewrites next-env.d.ts to point its routes reference at whatever
 * distDir it used, so building here would leave the file referencing
 * .next-verify and the working tree dirty after every run. It is generated and
 * marked "should not be edited", so snapshot it and put it back.
 */
const NEXT_ENV = "next-env.d.ts";
const nextEnvBefore = existsSync(NEXT_ENV) ? readFileSync(NEXT_ENV, "utf8") : null;

const status = run("next build");

if (nextEnvBefore !== null && readFileSync(NEXT_ENV, "utf8") !== nextEnvBefore) {
  writeFileSync(NEXT_ENV, nextEnvBefore);
  console.log(`Restored ${NEXT_ENV}, which the build had repointed at ${DIST}.`);
}

if (status !== 0) process.exit(status);

console.log(
  `\nBuild succeeded in ${DIST}. Your dev server's .next was not touched.\n`,
);
