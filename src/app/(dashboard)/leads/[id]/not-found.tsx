import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";

export default function LeadNotFound() {
  return (
    <div className="py-10">
      <EmptyState
        icon={FileQuestion}
        title="Lead not found"
        description="This lead may have been deleted, or it belongs to a different organization."
        action={
          <Button asChild size="sm">
            <Link href="/leads">Back to leads</Link>
          </Button>
        }
      />
    </div>
  );
}
