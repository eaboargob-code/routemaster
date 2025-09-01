"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useProfile } from "@/lib/useProfile";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { HeartHandshake } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";

const loginSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(1, { message: "Password is required." }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function ParentLoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
  // Use profile to check if a parent is already logged in
  const { profile, loading: profileLoading } = useProfile();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // Redirect if already logged in as a parent
  useEffect(() => {
    if (!profileLoading && profile?.role === 'parent') {
      router.replace('/parent');
    }
  }, [profile, profileLoading, router]);

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);
      const user = userCredential.user;

      // After sign-in, verify the user's role from Firestore
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists() && userDoc.data().role === 'parent' && userDoc.data().schoolId) {
        // Role is correct, proceed to dashboard
        router.replace("/parent");
      } else {
        // Not a valid parent account, sign out and show error
        await signOut(auth);
        toast({
          variant: "destructive",
          title: "Access Denied",
          description: "This account is not registered as a parent.",
        });
      }
    } catch (error) {
      console.error("Parent login failed:", error);
      toast({
        variant: "destructive",
        title: "Login Failed",
        description: "Invalid email or password. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  if (profileLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
             <Card className="w-full max-w-sm">
                 <CardHeader><Skeleton className="h-8 w-3/4 mx-auto" /><Skeleton className="h-4 w-1/2 mx-auto mt-2" /></CardHeader>
                 <CardContent className="space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></CardContent>
             </Card>
        </div>
      )
  }
  
  // Don't show login form if redirecting
  if (profile?.role === 'parent') {
      return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <HeartHandshake className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Parent Portal</CardTitle>
          <CardDescription>Sign in to view your child's status.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="parent@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Signing In..." : "Sign In"}
              </Button>
            </form>
          </Form>
           <div className="mt-4 text-center text-sm">
            Are you an admin?{" "}
            <Link href="/login" className="underline hover:text-primary">
                Admin Login
            </Link>
           </div>
        </CardContent>
      </Card>
    </div>
  );
}
