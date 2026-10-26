import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Placeholder for a platform whose connection isn't built yet. */
export function ComingSoon({ title, description, needs }: { title: string; description: string; needs: string[] }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>This page will read our {title} numbers through Meta&apos;s free Graph API.</CardDescription>
          <CardAction>
            <Badge variant="outline">Not connected</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">What it needs:</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {needs.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
