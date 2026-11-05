import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-3xl font-semibold">404</p>
      <p className="text-sm text-muted-foreground">This page could not be found.</p>
      {/* The only link used to be /dashboard, which bounces a signed-out
          visitor to /signin — a dead end for the visitor most likely to hit a
          404. Both audiences now have a door. */}
      <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row">
        <Link
          href="/"
          className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
        >
          Back to the site
        </Link>
        <Link href="/signin" className="text-sm text-primary underline underline-offset-4">
          Sign in
        </Link>
      </div>
    </main>
  );
}
