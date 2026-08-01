import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";

export default function CampaignNotFound() {
  return (
    <div className="py-10">
      <EmptyState
        icon={FileQuestion}
        title="Campaign not found"
        description="This campaign may have been deleted, or it belongs to a different organization."
        action={
          <Button asChild size="sm">
            <Link href="/campaigns">Back to campaigns</Link>
          </Button>
        }
      />
    </div>
  );
}
