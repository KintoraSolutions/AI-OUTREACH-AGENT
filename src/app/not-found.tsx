import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-3xl font-semibold">404</p>
      <p className="text-sm text-muted-foreground">This page could not be found.</p>
      <Link href="/dashboard" className="text-sm text-primary underline underline-offset-4">
        Go to dashboard
      </Link>
    </main>
  );
}
