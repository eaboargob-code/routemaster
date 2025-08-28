
"use client";

import { type User } from "firebase/auth";
import { Bug } from "lucide-react";

export interface UserProfile {
    role: string;
    schoolId: string;
}

interface DebugBannerProps {
    user: User | null;
    profile: UserProfile | null;
    loading: boolean;
}

export function DebugBanner({ user, profile, loading }: DebugBannerProps) {
    if (!user) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-yellow-300 text-yellow-900 text-xs p-2 z-50 flex items-center gap-4 font-mono">
            <Bug className="h-5 w-5 text-yellow-700" />
            <div className="flex-1 overflow-x-auto whitespace-nowrap">
                <span className="font-bold">[DEBUG]</span>
                <span className="mx-2">|</span>
                <span>uid: {user.uid}</span>
                <span className="mx-2">|</span>
                {loading ? (
                    <span>Loading profile...</span>
                ) : profile ? (
                    <>
                        <span>role: {profile.role || "N/A"}</span>
                        <span className="mx-2">|</span>
                        <span>schoolId: {profile.schoolId || "N/A"}</span>
                    </>
                ) : (
                    <span>No profile found for uid.</span>
                )}
            </div>
        </div>
    );
}

    