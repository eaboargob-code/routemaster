
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Pin } from "lucide-react";

export default function RouteStopsPage({ params }: { params: { id: string }}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
            <Pin />
            Manage Stops for Route
        </CardTitle>
        <CardDescription>
          This is a placeholder page to manage the stops for route ID: {params.id}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert>
          <AlertTitle>Under Construction</AlertTitle>
          <AlertDescription>
            The functionality to add, edit, and reorder stops for this route will be implemented here.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
