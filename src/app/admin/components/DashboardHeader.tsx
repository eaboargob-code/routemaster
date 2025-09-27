"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Users,
  Bus,
  Route,
  Settings,
  Bell,
  ChevronDown,
  UserPlus,
  MapPin,
  Calendar,
} from "lucide-react";
import Link from "next/link";

interface DashboardHeaderProps {
  adminName: string;
  adminEmail: string;
  adminPhoto?: string;
  schoolName: string;
  schoolLocation?: string;
  activeTripsCount: number;
}

export function DashboardHeader({
  adminName,
  adminEmail,
  adminPhoto,
  schoolName,
  schoolLocation,
  activeTripsCount,
}: DashboardHeaderProps) {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const quickActions = [
    {
      label: "Add User",
      icon: UserPlus,
      href: "/admin/users",
      description: "Create new user account",
    },
    {
      label: "Add Route",
      icon: MapPin,
      href: "/admin/routes",
      description: "Create new bus route",
    },
    {
      label: "Add Bus",
      icon: Bus,
      href: "/admin/buses",
      description: "Register new bus",
    },
    {
      label: "View Reports",
      icon: Calendar,
      href: "/admin/reports",
      description: "Access analytics",
    },
  ];

  return (
    <Card className="mb-6 border-0 shadow-sm bg-gradient-to-r from-blue-50 to-indigo-50">
      <CardContent className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Welcome Section */}
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12 ring-2 ring-blue-200">
              <AvatarImage src={adminPhoto} alt={adminName} />
              <AvatarFallback className="bg-blue-600 text-white font-semibold">
                {adminName
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {getGreeting()}, {adminName}!
              </h1>
              <p className="text-sm text-gray-600">
                Welcome back to {schoolName} dashboard
                {schoolLocation && (
                  <span className="block text-xs text-gray-500 mt-0.5">
                    📍 {schoolLocation}
                  </span>
                )}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs">
                  Admin
                </Badge>
                {activeTripsCount > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {activeTripsCount} active trips
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Quick Actions
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {quickActions.map((action) => (
                  <DropdownMenuItem key={action.label} asChild>
                    <Link href={action.href} className="flex items-center gap-2">
                      <action.icon className="h-4 w-4" />
                      <div>
                        <div className="font-medium">{action.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {action.description}
                        </div>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="outline" size="icon" className="relative">
              <Bell className="h-4 w-4" />
              <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full text-xs"></span>
            </Button>

            <Button asChild>
              <Link href="/admin/settings">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}