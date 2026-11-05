"use client";

import { useState } from "react";
import { CircleAlert, CircleCheckBig, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OrgIdentityForm, type OrgIdentityDefaults } from "@/components/app/org-identity-form";
import { CompanyProfileForm } from "@/components/app/company-profile-form";
import type { CompanyProfile } from "@/lib/ai/company-profile";

/**
 * Campaign-wide email settings, on the campaign.
 *
 * Sender name, company name and the description of what the company does are
 * fed to the model on every single draft, but they lived only in Settings —
 * two pages away from the screen where they matter, and discoverable only if
 * you already knew they existed. A blank company name does not fail loudly; it
 * quietly produces drafts that introduce nobody.
 *
 * Both dialogs host the real Settings forms rather than copies, so there is one
 * validation path and one server action. Saving updates the organization, which
 * is shared across campaigns — stated plainly below rather than implied.
 */
export function CampaignSenderCard({
  identity,
  profile,
  canEdit,
  missing,
}: {
  identity: OrgIdentityDefaults;
  profile: CompanyProfile;
  canEdit: boolean;
  /** Labels of the checks currently failing, for the inline warning. */
  missing: string[];
}) {
  const [editIdentity, setEditIdentity] = useState(false);
  const [editProfile, setEditProfile] = useState(false);

  const summary = profile.companyDescription?.trim() || profile.offer?.trim() || null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Sender and company</CardTitle>
          <CardDescription>
            Applied to every email this campaign drafts. Shared across all campaigns in{" "}
            {identity.name}.
          </CardDescription>
        </div>
        {missing.length === 0 ? (
          <span className="flex shrink-0 items-center gap-1.5 text-caption1 text-[var(--fl-success-fg)]">
            <CircleCheckBig aria-hidden="true" className="size-4" />
            Ready
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1.5 text-caption1 text-[var(--fl-warning-fg)]">
            <CircleAlert aria-hidden="true" className="size-4" />
            {missing.length} to set
          </span>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Row label="Company name" value={identity.companyName} />
          <Row label="Sender name" value={identity.senderName} />
          <Row label="Reply-to address" value={identity.senderEmail} />
          <Row label="Contact / booking link" value={identity.contactUrl ?? identity.portfolioUrl} />
        </dl>

        <div className="border-t border-[var(--fl-stroke-2)] pt-3">
          <dt className="text-caption1 text-[var(--fl-fg-3)]">What your company does</dt>
          <dd className="mt-1 text-body1">
            {summary ? (
              <span className="line-clamp-2">{summary}</span>
            ) : (
              <span className="text-[var(--fl-warning-fg)]">
                Not set — drafts have no offer to make.
              </span>
            )}
          </dd>
        </div>

        {canEdit ? (
          <div className="flex flex-wrap gap-2 border-t border-[var(--fl-stroke-2)] pt-3">
            <Button variant="outline" size="sm" onClick={() => setEditIdentity(true)}>
              <Pencil aria-hidden="true" />
              Edit sender details
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditProfile(true)}>
              <Pencil aria-hidden="true" />
              Edit company profile
            </Button>
          </div>
        ) : (
          <p className="border-t border-[var(--fl-stroke-2)] pt-3 text-caption1 text-[var(--fl-fg-3)]">
            You need an Admin role to change these.
          </p>
        )}
      </CardContent>

      <Dialog open={editIdentity} onOpenChange={setEditIdentity}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sender details</DialogTitle>
            <DialogDescription>
              Who the email is from. These apply to every campaign in {identity.name}.
            </DialogDescription>
          </DialogHeader>
          <OrgIdentityForm defaults={identity} canEdit={canEdit} />
        </DialogContent>
      </Dialog>

      <Dialog open={editProfile} onOpenChange={setEditProfile}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Company profile</DialogTitle>
            <DialogDescription>
              What you do, what you sell, and who you target. Fed to the AI as sender context on
              every draft.
            </DialogDescription>
          </DialogHeader>
          <CompanyProfileForm profile={profile} canEdit={canEdit} />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption1 text-[var(--fl-fg-3)]">{label}</dt>
      <dd className="truncate text-body1">
        {value?.trim() ? (
          value
        ) : (
          <span className="text-[var(--fl-warning-fg)]">Not set</span>
        )}
      </dd>
    </div>
  );
}
