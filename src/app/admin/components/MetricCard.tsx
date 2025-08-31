
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { LucideIcon } from 'lucide-react';

interface MetricCardProps {
    title: string;
    value: number | string;
    icon: LucideIcon;
    description?: string;
}

export function MetricCard({ title, value, icon: Icon, description }: MetricCardProps) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                {description && <p className="text-xs text-muted-foreground">{description}</p>}
            </CardContent>
        </Card>
    );
}

export function MetricCardLoading() {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
                <Skeleton className="h-7 w-12" />
                <Skeleton className="h-3 w-24 mt-1" />
            </CardContent>
        </Card>
    )
}
