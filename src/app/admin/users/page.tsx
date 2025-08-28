
"use client";

import { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  onSnapshot,
  getDocs,
  limit,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useProfile } from "@/lib/useProfile";


import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Pencil, Shield, CaseSensitive, PersonStanding, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const UserRole = z.enum(["admin", "driver", "supervisor", "parent"]);
type UserRoleType = z.infer<typeof UserRole>;

const inviteSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
  role: UserRole,
});

type InviteFormValues = z.infer<typeof inviteSchema>;

interface User {
  id: string;
  displayName?: string;
  email: string;
  role: UserRoleType;
  active: boolean;
  schoolId: string;
  pending?: boolean;
}

const roleIcons: Record<UserRoleType, React.ElementType> = {
    admin: Shield,
    driver: CaseSensitive,
    supervisor: PersonStanding,
    parent: Users,
};

function InviteUserDialog({ onUserInvited, schoolId }: { onUserInvited: () => void, schoolId: string }) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: "",
      role: "parent",
    },
  });

  const onSubmit = async (data: InviteFormValues) => {
    setIsSubmitting(true);
    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", data.email), where("schoolId", "==", schoolId), limit(1));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const existingUserDoc = querySnapshot.docs[0];
        await updateDoc(doc(db, "users", existingUserDoc.id), {
          role: data.role,
        });
        toast({
            title: "User Updated",
            description: `User ${data.email}'s role has been updated to ${data.role}.`,
            className: 'bg-accent text-accent-foreground border-0',
        });

      } else {
        await addDoc(collection(db, "users"), {
            email: data.email,
            role: data.role,
            schoolId: schoolId,
            pending: true,
            active: false,
            displayName: "Invited User"
        });
        toast({
            title: "Invitation Sent!",
            description: `An invitation has been sent to ${data.email}.`,
            className: 'bg-accent text-accent-foreground border-0',
        });
      }
      
      form.reset();
      onUserInvited();
      setIsOpen(false);
    } catch (error) {
      console.error("Error inviting user: ", error);
      toast({
        variant: "destructive",
        title: "Uh oh! Something went wrong.",
        description: "There was a problem sending the invitation.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />
          Invite User
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
         <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
                <DialogHeader>
                    <DialogTitle>Invite New User</DialogTitle>
                    <DialogDescription>
                        Enter the email and role for the new user. They will receive an email to complete their registration.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                            <Input placeholder="user@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Role</FormLabel>
                             <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a role" />
                                </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {UserRole.options.map((role) => {
                                        const Icon = roleIcons[role];
                                        return (
                                            <SelectItem key={role} value={role}>
                                                <div className="flex items-center gap-2">
                                                   <Icon className="h-4 w-4 text-muted-foreground" />
                                                   <span className="capitalize">{role}</span>
                                                </div>
                                            </SelectItem>
                                        )
                                    })}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                    />
                </div>
                 <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="ghost">Cancel</Button>
                    </DialogClose>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "Sending..." : "Send Invite"}
                    </Button>
                </DialogFooter>
            </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditableUserRow({ user }: { user: User }) {
    const { toast } = useToast();

    const handleActiveToggle = async (newActiveState: boolean) => {
        const userRef = doc(db, "users", user.id);
        try {
            await updateDoc(userRef, { 
                active: newActiveState,
                pending: false
            });
            toast({
                title: "Success!",
                description: `User has been ${newActiveState ? 'activated' : 'deactivated'}.`,
                className: 'bg-accent text-accent-foreground border-0',
            });
        } catch (error) {
            console.error("Error updating user active state: ", error);
            toast({
                variant: "destructive",
                title: "Update Failed",
                description: "There was a problem updating the user.",
            });
        }
    };
    
    const handleRoleUpdate = async (newRole: UserRoleType) => {
        const userRef = doc(db, "users", user.id);
        try {
            await updateDoc(userRef, { role: newRole });
            toast({
                title: "Success!",
                description: `User role has been updated.`,
                className: 'bg-accent text-accent-foreground border-0',
            });
        } catch (error) {
            console.error("Error updating user role: ", error);
            toast({
                variant: "destructive",
                title: "Update Failed",
                description: "There was a problem updating the user role.",
            });
        }
    };
    
    const RoleIcon = roleIcons[user.role];
    
    const getStatusBadge = () => {
        if (user.pending) {
            return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">Pending</Badge>;
        }
        if (user.active) {
            return <Badge className="bg-green-100 text-green-800 hover:bg-green-100/80 border-green-200">Active</Badge>;
        }
        return <Badge variant="secondary">Inactive</Badge>;
    };

    return (
        <TableRow key={user.id}>
            <TableCell className="font-medium">{user.displayName || 'N/A'}</TableCell>
            <TableCell>{user.email}</TableCell>
            <TableCell>
                <div className="flex items-center gap-2">
                   <RoleIcon className="h-4 w-4 text-muted-foreground" />
                   <span className="capitalize">{user.role}</span>
                </div>
            </TableCell>
             <TableCell>
                <Switch
                    checked={user.active}
                    onCheckedChange={handleActiveToggle}
                    aria-label="Toggle Active Status"
                />
            </TableCell>
            <TableCell className="text-right">
                {getStatusBadge()}
            </TableCell>
            <TableCell className="text-right">
                 <Select onValueChange={handleRoleUpdate} defaultValue={user.role}>
                    <SelectTrigger className="w-[120px] h-9">
                        <div className="flex items-center gap-1">
                           <Pencil className="h-3 w-3" />
                           <span>Edit Role</span>
                        </div>
                    </SelectTrigger>
                    <SelectContent>
                        {UserRole.options.map((role) => (
                             <SelectItem key={role} value={role} className="capitalize">{role}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </TableCell>
        </TableRow>
    );
}

function UsersList({ onUserInvited, schoolId }: { onUserInvited: () => void, schoolId: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (!schoolId) {
        setIsLoading(false);
        return;
    };

    const q = query(
      collection(db, "users"),
      where("schoolId", "==", schoolId)
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const usersData = querySnapshot.docs.map(
        (doc: QueryDocumentSnapshot<DocumentData>) => ({
          id: doc.id,
          ...(doc.data() as Omit<User, 'id'>),
        })
      );
      setUsers(usersData);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching users:", error);
      toast({ variant: "destructive", title: "Error fetching users", description: error.message });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [schoolId, toast]);
  
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
            <CardTitle>User Management</CardTitle>
            <CardDescription>
            Invite and manage users for school {schoolId}.
            </CardDescription>
        </div>
        <InviteUserDialog onUserInvited={onUserInvited} schoolId={schoolId} />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Display Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  Loading users...
                </TableCell>
              </TableRow>
            ) : users.length > 0 ? (
              users.map((user) => (
                <EditableUserRow key={user.id} user={user} />
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No users found. Invite one to get started!
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function UsersPage() {
    const { profile, loading: profileLoading, error: profileError } = useProfile();
    const [key, setKey] = useState(0);
    const forceRerender = useCallback(() => setKey(k => k + 1), []);

    if (profileLoading) {
        return (
             <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-1/4" />
                    <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-40 w-full" />
                </CardContent>
            </Card>
        )
    }

    if (profileError) {
        return <div className="text-red-500">Error loading profile: {profileError.message}</div>
    }

    if (!profile) {
        return <div>No user profile found. Access denied.</div>
    }

    return (
        <div className="grid gap-8">
            <UsersList key={key} onUserInvited={forceRerender} schoolId={profile.schoolId} />
        </div>
    );
}

    