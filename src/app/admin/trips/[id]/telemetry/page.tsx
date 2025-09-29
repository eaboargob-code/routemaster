
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Map as MapIcon } from "lucide-react";

export default function TripTelemetryPage({ params }: { params: { id: string }}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
            <MapIcon />
            Trip Telemetry
        </CardTitle>
        <CardDescription>
          This is a placeholder page to display the breadcrumb trail for trip ID: {params.id}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert>
          <AlertTitle>Under Construction</AlertTitle>
          <AlertDescription>
            The functionality to display a map and replay the trip's location history will be implemented here.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
