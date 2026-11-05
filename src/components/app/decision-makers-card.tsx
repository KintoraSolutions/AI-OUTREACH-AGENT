import Link from "next/link";
import { Confidence, type DecisionRole } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CONFIDENCE_LABELS } from "@/lib/leads/constants";
import { DECISION_ROLE_LABELS } from "@/lib/people/roles";
import type { PersonScoreResult } from "@/lib/people/scoring";

/**
 * The people a clinic publishes about itself, and where else they appear.
 *
 * The cross-clinic list is the point of the card. A physician who turns up at
 * three clinics in the pipeline is a different proposition from one who runs a
 * single site, and that is invisible from any one lead unless it is shown
 * here.
 *
 * Two things are stated rather than implied, because both decide whether an
 * operator should act on this. Confidence: a role is only a fact when the
 * clinic stated it in so many words. Provenance: an address is only ever one
 * the clinic published, so "no published address" is a real answer and not a
 * failure to look.
 */
export interface DecisionMakerView {
  id: string;
  fullName: string;
  role: DecisionRole;
  roleTitle: string | null;
  confidence: Confidence;
  isOwner: boolean;
  email: string | null;
  sourceUrl: string;
  score: PersonScoreResult;
  otherClinics: { id: string; name: string }[];
}

export function DecisionMakersCard({ people }: { people: DecisionMakerView[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Decision makers</CardTitle>
      </CardHeader>
      <CardContent>
        {people.length === 0 ? (
          <p className="text-body1 text-[var(--fl-fg-3)]">
            No decision makers were found on this clinic&rsquo;s own site. Outreach falls back to
            the clinic&rsquo;s general inbox.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {people.map((person) => (
              <li
                key={person.id}
                className="border-t border-[var(--fl-stroke-2)] pt-4 first:border-t-0 first:pt-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="font-mono text-body1 font-semibold tabular-nums"
                    title="Influence and reachability, out of 100"
                  >
                    {person.score.overallScore}
                  </span>
                  <span className="text-body1 font-semibold">{person.fullName}</span>
                  <Badge tone={person.isOwner ? "brand" : "neutral"}>
                    {person.roleTitle ?? DECISION_ROLE_LABELS[person.role]}
                  </Badge>
                  <Badge tone={person.confidence === Confidence.VERIFIED ? "success" : "neutral"}>
                    {CONFIDENCE_LABELS[person.confidence]}
                  </Badge>
                </div>

                <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-caption1 text-[var(--fl-fg-3)]">Published address</dt>
                    <dd className="text-body1">
                      {person.email ?? (
                        <span className="text-[var(--fl-fg-4)]">
                          None published. Never inferred.
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-caption1 text-[var(--fl-fg-3)]">Source</dt>
                    <dd className="text-body1">
                      <a
                        href={person.sourceUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="underline underline-offset-4"
                      >
                        {person.sourceUrl.replace(/^https?:\/\//, "")}
                      </a>
                    </dd>
                  </div>
                </dl>

                <details className="mt-2">
                  <summary className="cursor-pointer text-caption1 text-[var(--fl-fg-3)]">
                    Score breakdown
                  </summary>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {Object.values(person.score.breakdown.categories).flatMap((category) =>
                      category.contributions.map((contribution) => (
                        <li
                          key={contribution.ruleId}
                          className="flex items-baseline justify-between gap-3 text-caption1"
                        >
                          <span className="text-[var(--fl-fg-2)]">{contribution.label}</span>
                          <span className="font-mono tabular-nums text-[var(--fl-fg-3)]">
                            {contribution.basePoints} x {contribution.confidenceMultiplier} ={" "}
                            {contribution.points}
                          </span>
                        </li>
                      )),
                    )}
                    {person.score.breakdown.rejected.map((rejected) => (
                      <li
                        key={rejected.ruleId}
                        className="flex items-baseline justify-between gap-3 text-caption1"
                      >
                        <span className="text-[var(--fl-fg-4)]">{rejected.ruleId}</span>
                        <span className="text-[var(--fl-fg-4)]">{rejected.reason}</span>
                      </li>
                    ))}
                  </ul>
                </details>

                {person.otherClinics.length > 0 ? (
                  <p className="mt-2 text-caption1 text-[var(--fl-fg-3)]">
                    Also listed at{" "}
                    {person.otherClinics.map((clinic, index) => (
                      <span key={clinic.id}>
                        {index > 0 ? ", " : ""}
                        <Link
                          href={`/leads/${clinic.id}`}
                          className="underline underline-offset-4"
                        >
                          {clinic.name}
                        </Link>
                      </span>
                    ))}
                    .
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-caption1 text-[var(--fl-fg-3)]">
          Read from this clinic&rsquo;s public site, and ordered by influence and reachability out
          of 100. A role counts as a fact only where the clinic states it; everything else is an
          inference and is labelled as one.
        </p>
      </CardContent>
    </Card>
  );
}
