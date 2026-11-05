"use client";

import * as React from "react";
import Link from "next/link";
import { Search, SearchX, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ARTICLES, HELP_SECTIONS, searchArticles, type Article } from "@/lib/help/content";

/**
 * The Help Centre's search field and the article list it filters.
 *
 * Search runs in the browser against the same pure `searchArticles` the tests
 * cover, so results appear as you type with no round trip. The whole article
 * list is grouped by section when the field is empty, which makes the page
 * useful for browsing as well as for searching.
 *
 * Accessibility notes:
 *  - The result count lives in an `aria-live="polite"` region, debounced, so a
 *    screen-reader user hears "7 articles match" once they stop typing rather
 *    than on every keystroke.
 *  - Each section is a real <section> with an <h2>, and each group of results
 *    is a <ul>, so the page can be navigated by heading or by list.
 *  - The clear button is icon-only and carries an `aria-label`.
 */

const DEBOUNCE_MS = 400;

export function HelpSearch() {
  const [query, setQuery] = React.useState("");
  const [announced, setAnnounced] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const trimmed = query.trim();
  const results = React.useMemo(
    () => (trimmed ? searchArticles(trimmed) : ARTICLES),
    [trimmed],
  );

  // Debounced so the live region speaks once the reader pauses, not per key.
  React.useEffect(() => {
    if (!trimmed) {
      setAnnounced("");
      return;
    }
    const t = window.setTimeout(() => {
      setAnnounced(
        results.length === 1
          ? `1 article matches ${trimmed}.`
          : `${results.length} articles match ${trimmed}.`,
      );
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [trimmed, results.length]);

  function clear() {
    setQuery("");
    inputRef.current?.focus();
  }

  const bySection = HELP_SECTIONS.map((section) => ({
    section,
    articles: results.filter((a) => a.section === section.key),
  })).filter((group) => group.articles.length > 0);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Label htmlFor="help-search" className="text-body1 font-semibold">
          Search help
        </Label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fl-fg-3)]"
            strokeWidth={2}
          />
          <Input
            id="help-search"
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try scoring, blocked draft, or CSV"
            autoComplete="off"
            // type="search" gives the field its searchbox role; WebKit's own
            // clear affordance is hidden so it does not sit beside ours.
            className="h-11 pl-9 pr-10 text-body2 [&::-webkit-search-cancel-button]:appearance-none"
            aria-describedby="help-search-hint"
          />
          {query ? (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-[var(--fl-fg-3)] transition-colors duration-100 ease-[var(--ease-easy)] hover:bg-[var(--fl-subtle-hover)] hover:text-foreground"
            >
              <X aria-hidden="true" className="size-4" strokeWidth={2} />
            </button>
          ) : null}
        </div>
        <p id="help-search-hint" className="text-caption1 text-[var(--fl-fg-3)]">
          Searches every word of every article, not just the titles.
        </p>
      </div>

      {/* Announced when the reader stops typing. Empty until then. */}
      <p aria-live="polite" className="sr-only">
        {announced}
      </p>

      {trimmed ? (
        <p className="text-body1 text-[var(--fl-fg-2)]">
          <span className="font-semibold text-foreground">{results.length}</span>{" "}
          {results.length === 1 ? "article" : "articles"} matching{" "}
          <span className="font-semibold text-foreground">{trimmed}</span>
        </p>
      ) : null}

      {results.length === 0 ? (
        <NoResults query={trimmed} onClear={clear} />
      ) : (
        <div className="space-y-10">
          {bySection.map(({ section, articles }) => (
            <section key={section.key} aria-labelledby={`help-section-${section.key}`}>
              <div className="mb-3">
                <h2
                  id={`help-section-${section.key}`}
                  className="text-subtitle2 font-semibold text-foreground"
                >
                  {section.title}
                </h2>
                <p className="text-body1 text-[var(--fl-fg-3)]">{section.description}</p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {articles.map((article) => (
                  <li key={article.slug}>
                    <ArticleCard article={article} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ArticleCard({ article }: { article: Article }) {
  return (
    <Card elevation="interactive" className="h-full">
      <Link
        href={`/help/${article.slug}`}
        className="flex h-full flex-col gap-1.5 rounded-md p-4 transition-colors duration-100 ease-[var(--ease-easy)]"
      >
        <span className="text-body2 font-semibold text-foreground">{article.title}</span>
        <span className="text-body1 leading-6 text-[var(--fl-fg-2)]">{article.summary}</span>
      </Link>
    </Card>
  );
}

function NoResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="rounded-md border border-dashed border-[var(--fl-stroke-1)] px-6 py-12 text-center">
      <SearchX
        aria-hidden="true"
        className="mx-auto size-8 text-[var(--fl-fg-3)]"
        strokeWidth={1.5}
      />
      <h2 className="mt-3 text-subtitle2 font-semibold text-foreground">
        Nothing matches {query}
      </h2>
      <p className="mx-auto mt-1 max-w-md text-body1 text-[var(--fl-fg-2)]">
        Every word you type has to appear in the article, so a shorter search finds more. Try one
        word, or the name of the button you are looking at.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-4 rounded-md text-body1 font-semibold text-[var(--fl-brand-text)] hover:underline"
      >
        Clear the search and show all {ARTICLES.length} articles
      </button>
    </div>
  );
}
