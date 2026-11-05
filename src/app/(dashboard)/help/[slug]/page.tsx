import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { HelpBlocks } from "@/components/app/help-article";
import {
  ARTICLES,
  getArticle,
  getSection,
  headingId,
  sectionNeighbours,
} from "@/lib/help/content";

/**
 * One help article.
 *
 * Every article is known at build time, so the whole Help Centre is
 * pre-rendered: `generateStaticParams` enumerates the slugs and
 * `generateMetadata` gives each page its own title and description.
 *
 * On a wide screen the article sits beside a sticky table of contents built
 * from its own heading blocks. The contents nav comes FIRST in the document
 * order and is moved into the right-hand column with grid placement, so a
 * keyboard or screen-reader user reaches "jump to a section" before wading
 * through the prose, while sighted readers still see the familiar docs layout.
 */

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return { title: "Help" };
  return {
    title: `${article.title} | Help`,
    description: article.summary,
  };
}

export default async function HelpArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  const section = getSection(article.section);
  const headings = article.blocks.filter((b) => b.kind === "heading");
  const { prev, next } = sectionNeighbours(article.slug);
  const related = (article.related ?? [])
    .map((s) => getArticle(s))
    .filter((a): a is NonNullable<typeof a> => a !== null);

  return (
    <div className="pb-16">
      {/* The dashboard shell already renders the breadcrumb trail for this
          route, so the article does not draw a second one. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-10">
        {headings.length > 0 ? (
          <nav
            aria-label="On this page"
            className="hidden lg:col-start-2 lg:row-start-1 lg:block"
          >
            <div className="sticky top-20">
              <p className="mb-2 text-caption1 font-semibold text-[var(--fl-fg-3)]">On this page</p>
              <ol className="space-y-1 border-l border-[var(--fl-stroke-2)]">
                {headings.map((h) => (
                  <li key={h.text}>
                    <a
                      href={`#${headingId(h.text)}`}
                      className="-ml-px block border-l-2 border-transparent py-1 pl-3 text-body1 leading-5 text-[var(--fl-fg-2)] transition-colors duration-100 ease-[var(--ease-easy)] hover:border-[var(--fl-brand-text)] hover:text-[var(--fl-brand-text)]"
                    >
                      {h.text}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>
        ) : null}

        <article className="min-w-0 lg:col-start-1 lg:row-start-1">
          <header className="mb-7 border-b border-[var(--fl-stroke-2)] pb-6">
            {section ? (
              <p className="text-caption1 font-semibold uppercase tracking-wide text-[var(--fl-brand-text)]">
                {section.title}
              </p>
            ) : null}
            <h1 className="mt-1.5 text-title2 font-semibold tracking-tight text-foreground">
              {article.title}
            </h1>
            <p className="mt-2 max-w-2xl text-body2 leading-7 text-[var(--fl-fg-2)]">
              {article.summary}
            </p>
          </header>

          <div className="max-w-2xl">
            <HelpBlocks blocks={article.blocks} />
          </div>

          <footer className="mt-12 space-y-8">
            {related.length > 0 ? (
              <section aria-labelledby="related-articles">
                <h2
                  id="related-articles"
                  className="mb-3 text-subtitle2 font-semibold text-foreground"
                >
                  Related articles
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {related.map((r) => (
                    <li key={r.slug}>
                      <Card elevation="interactive" className="h-full">
                        <Link
                          href={`/help/${r.slug}`}
                          className="flex h-full flex-col gap-1 rounded-md p-4"
                        >
                          <span className="text-body1 font-semibold text-foreground">
                            {r.title}
                          </span>
                          <span className="text-caption1 leading-5 text-[var(--fl-fg-2)]">
                            {r.summary}
                          </span>
                        </Link>
                      </Card>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {prev || next ? (
              <nav
                aria-label={`More in ${section?.title ?? "this section"}`}
                className="grid gap-3 border-t border-[var(--fl-stroke-2)] pt-6 sm:grid-cols-2"
              >
                {prev ? (
                  <Link
                    href={`/help/${prev.slug}`}
                    className="group flex items-center gap-2.5 rounded-md border border-[var(--fl-stroke-2)] p-3 transition-colors duration-100 ease-[var(--ease-easy)] hover:border-[var(--fl-stroke-1)] hover:bg-[var(--fl-subtle-hover)]"
                  >
                    <ArrowLeft
                      aria-hidden="true"
                      className="size-4 shrink-0 text-[var(--fl-fg-3)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-caption1 text-[var(--fl-fg-3)]">Previous</span>
                      <span className="block truncate text-body1 font-semibold text-foreground">
                        {prev.title}
                      </span>
                    </span>
                  </Link>
                ) : (
                  <span aria-hidden="true" className="hidden sm:block" />
                )}
                {next ? (
                  <Link
                    href={`/help/${next.slug}`}
                    className="group flex items-center justify-end gap-2.5 rounded-md border border-[var(--fl-stroke-2)] p-3 text-right transition-colors duration-100 ease-[var(--ease-easy)] hover:border-[var(--fl-stroke-1)] hover:bg-[var(--fl-subtle-hover)]"
                  >
                    <span className="min-w-0">
                      <span className="block text-caption1 text-[var(--fl-fg-3)]">Next</span>
                      <span className="block truncate text-body1 font-semibold text-foreground">
                        {next.title}
                      </span>
                    </span>
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-[var(--fl-fg-3)]"
                    />
                  </Link>
                ) : null}
              </nav>
            ) : null}

            <p className="text-body1 text-[var(--fl-fg-3)]">
              <Link
                href="/help"
                className="font-semibold text-[var(--fl-brand-text)] hover:underline"
              >
                Back to the Help Centre
              </Link>{" "}
              or{" "}
              <Link
                href="/tutorial"
                className="font-semibold text-[var(--fl-brand-text)] hover:underline"
              >
                take the guided tutorial
              </Link>
              .
            </p>
          </footer>
        </article>
      </div>
    </div>
  );
}
