
"use client";

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { LineChart as RechartsLineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Line, CartesianGrid } from "recharts";
import { format } from 'date-fns';
import { Skeleton } from "@/components/ui/skeleton";
import type { DocumentData, Timestamp } from "firebase/firestore";
import { Activity, Package } from "lucide-react";

interface Trip extends DocumentData {
    startedAt: Timestamp;
}

interface DailyTripsChartProps {
    trips: Trip[];
}

export function DailyTripsChart({ trips }: DailyTripsChartProps) {
    const tripsByDay = trips.reduce((acc, trip) => {
        const day = format(trip.startedAt.toDate(), 'yyyy-MM-dd');
        acc[day] = (acc[day] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const chartData = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayKey = format(d, 'yyyy-MM-dd');
        return {
            date: format(d, 'MMM d'),
            count: tripsByDay[dayKey] || 0,
        };
    }).reverse();

    return (
        <Card>
            <CardHeader>
                <CardTitle>Trips Activity</CardTitle>
                <CardDescription>Number of trips started in the last 7 days.</CardDescription>
            </CardHeader>
            <CardContent>
                {trips.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                        <RechartsLineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                            <XAxis dataKey="date" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: "hsl(var(--background))",
                                    borderColor: "hsl(var(--border))",
                                }}
                            />
                            <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4, fill: "hsl(var(--primary))" }} />
                        </RechartsLineChart>
                    </ResponsiveContainer>
                 ) : (
                    <div className="flex flex-col items-center justify-center h-[300px] text-center">
                        <Activity className="h-12 w-12 text-muted-foreground" />
                        <p className="mt-4 text-lg font-semibold">No Recent Trip Data</p>
                        <p className="text-muted-foreground">No trips have been started in the last 7 days.</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export function DailyTripsChartLoading() {
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
