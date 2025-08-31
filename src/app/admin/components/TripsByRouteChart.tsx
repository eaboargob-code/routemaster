
"use client"

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { BarChart, Package } from 'lucide-react';
import { Bar, BarChart as RechartsBarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import type { DocumentData, Timestamp } from "firebase/firestore";

interface Trip extends DocumentData {
    id: string;
    routeId?: string;
}

interface Route extends DocumentData {
    id: string;
    name: string;
}

interface TripsByRouteChartProps {
    activeTrips: Trip[];
    routes: Route[];
}

export function TripsByRouteChart({ activeTrips, routes }: TripsByRouteChartProps) {
    const routeMap = new Map(routes.map(route => [route.id, route.name]));
    routeMap.set('unassigned', 'Unassigned');

    const tripsByRoute = activeTrips.reduce((acc, trip) => {
        const routeId = trip.routeId || 'unassigned';
        const routeName = routeMap.get(routeId) || 'Unknown Route';
        acc[routeName] = (acc[routeName] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const chartData = Object.entries(tripsByRoute).map(([name, count]) => ({ name, count }));

    return (
        <Card>
            <CardHeader>
                <CardTitle>Active Trips by Route</CardTitle>
                <CardDescription>A live view of ongoing trips for each route.</CardDescription>
            </CardHeader>
            <CardContent>
                {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                        <RechartsBarChart data={chartData}>
                            <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: "hsl(var(--background))",
                                    borderColor: "hsl(var(--border))",
                                }}
                            />
                            <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        </RechartsBarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex flex-col items-center justify-center h-[300px] text-center">
                        <Package className="h-12 w-12 text-muted-foreground" />
                        <p className="mt-4 text-lg font-semibold">No Active Trips</p>
                        <p className="text-muted-foreground">There are no active trips to display at the moment.</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export function TripsByRouteChartLoading() {
    return (
        <Card>
            <CardHeader>
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
            </CardHeader>
            <CardContent>
                <Skeleton className="h-[300px] w-full" />
            </CardContent>
        </Card>
    )
}
