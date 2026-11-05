"use client";

import { useEffect, useRef, useState } from "react";

/** True when the visitor has asked the OS to minimise animation. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Flips `data-shown` on a wrapper the first time it scrolls into view, which the
 * `.mk-*` rules in globals.css key off. One observer drives a whole subtree, so
 * a table of rows animates from a single element rather than twenty observers.
 *
 * Reveals are one-way on purpose: re-hiding content when it scrolls back up is
 * the kind of motion that reads as a gimmick and costs you the content twice.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
  id,
  style,
}: {
  children: React.ReactNode;
  /** Milliseconds, applied via the --mk-delay custom property. */
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "tr" | "header";
  id?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Anything already on screen reveals on the spot. Waiting for an observer
    // callback for content the visitor can already see risks a section that is
    // briefly — or, if a callback is dropped, permanently — blank. The observer
    // is only needed for what is still below the fold.
    const rect = node.getBoundingClientRect();
    const limit = window.innerHeight * 0.88;
    if (typeof IntersectionObserver === "undefined" || (rect.top < limit && rect.bottom > 0)) {
      setShown(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      id={id}
      data-shown={shown ? "true" : "false"}
      className={["mk-reveal", className].filter(Boolean).join(" ")}
      style={{ ...style, ["--mk-delay" as string]: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
