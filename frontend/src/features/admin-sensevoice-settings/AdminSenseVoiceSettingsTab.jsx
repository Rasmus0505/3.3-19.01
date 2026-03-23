import { AlertTriangle } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../shared/ui";

export function AdminLegacyAsrRemovedTab() {
  return (
    <Card className="rounded-3xl border shadow-sm">
      <CardHeader className="space-y-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="size-4" />
            Legacy ASR Removed
          </CardTitle>
          <CardDescription>The retired upload model has been removed from the product and is no longer configurable.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Only Bottle 1.0 and Bottle 2.0 remain available.</p>
      </CardContent>
    </Card>
  );
}
