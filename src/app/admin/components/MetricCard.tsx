
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
    title: string;
    value: number | string;
    icon: LucideIcon;
    description?: string;
    trend?: {
        value: number;
        label: string;
    };
    variant?: 'default' | 'success' | 'warning' | 'destructive';
}

export function MetricCard({ title, value, icon: Icon, description, trend, variant = 'default' }: MetricCardProps) {
    const getTrendIcon = () => {
        if (!trend) return null;
        if (trend.value > 0) return <TrendingUp className="h-3 w-3" />;
        if (trend.value < 0) return <TrendingDown className="h-3 w-3" />;
        return <Minus className="h-3 w-3" />;
    };

    const getTrendColor = () => {
        if (!trend) return '';
        if (trend.value > 0) return 'text-green-600';
        if (trend.value < 0) return 'text-red-600';
        return 'text-gray-500';
    };

    const getCardVariant = () => {
        switch (variant) {
            case 'success':
                return 'border-green-200 bg-green-50/50';
            case 'warning':
                return 'border-yellow-200 bg-yellow-50/50';
            case 'destructive':
                return 'border-red-200 bg-red-50/50';
            default:
                return '';
        }
    };

    const getIconColor = () => {
        switch (variant) {
            case 'success':
                return 'text-green-600';
            case 'warning':
                return 'text-yellow-600';
            case 'destructive':
                return 'text-red-600';
            default:
                return 'text-muted-foreground';
        }
    };

    return (
        <Card className={cn('transition-all duration-200 hover:shadow-md', getCardVariant())}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className={cn('h-5 w-5', getIconColor())} />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                <div className="flex items-center justify-between mt-2">
                    {description && <p className="text-xs text-muted-foreground flex-1">{description}</p>}
                    {trend && (
                        <div className={cn('flex items-center gap-1 text-xs font-medium', getTrendColor())}>
                            {getTrendIcon()}
                            <span>{Math.abs(trend.value)}%</span>
                            <span className="text-muted-foreground">{trend.label}</span>
                        </div>
                    )}
                </div>
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
