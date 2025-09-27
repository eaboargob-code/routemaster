
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  getDocs,
  limit,
  type DocumentData,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useProfile } from "@/lib/useProfile";
import { listUsersForSchool } from "@/lib/firestoreQueries";
import { scol } from "@/lib/schoolPath";

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
import { UserPlus, Pencil, Shield, CaseSensitive, PersonStanding, Users, Send, Camera, User, Save, X, Video, Square } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";

const UserRole = z.enum(["admin", "driver", "supervisor", "parent"]);
type UserRoleType = z.infer<typeof UserRole>;

const inviteSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
  role: UserRole,
});

type InviteFormValues = z.infer<typeof inviteSchema>;

interface User extends DocumentData {
  id: string;
  displayName?: string;
  email: string;
  role: UserRoleType;
  active: boolean;
  schoolId: string;
  pending?: boolean;
  photoUrl?: string;
  phoneNumber?: string;
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
      role: "driver",
    },
  });

  const onSubmit = async (data: InviteFormValues) => {
    setIsSubmitting(true);
    if (!schoolId) {
        toast({ variant: "destructive", title: "Error", description: "School ID is missing." });
        setIsSubmitting(false);
        return;
    }

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
        const batch = writeBatch(db);
        const newUserRef = doc(collection(db, "users")); // create a new doc ref with auto-id
        
        batch.set(newUserRef, {
            email: data.email,
            role: data.role,
            schoolId: schoolId,
            pending: true,
            active: false,
            displayName: "Invited User",
            invitedAt: Timestamp.now(),
        });
        
        // If the new user is a parent, also create their parentStudents doc
        if (data.role === 'parent') {
            const parentLinkRef = doc(scol(schoolId, "parentStudents"), newUserRef.id);
            batch.set(parentLinkRef, { studentIds: [] });
        }
        
        await batch.commit();

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
      console.error("[users invite]", error);
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

function EditUserDialog({ user, onUpdate, schoolId }: { user: User, onUpdate: () => void, schoolId: string }) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [formData, setFormData] = useState({
    displayName: user.displayName || "",
    phoneNumber: user.phoneNumber || "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        displayName: user.displayName || "",
        phoneNumber: user.phoneNumber || "",
      });
      setSelectedFile(null);
      setPreviewUrl(null);
      setShowCamera(false);
      stopCamera();
    }
  }, [isOpen, user]);

  // Cleanup camera stream when component unmounts or dialog closes
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    setCameraLoading(true);
    setShowCamera(true); // Show camera UI first so video element gets rendered
    
    try {
      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera not supported by this browser');
      }

      console.log('📹 Requesting camera access...');
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        }, 
        audio: false 
      });
      
      console.log('✅ Camera access granted, setting up video stream...');
      console.log('📊 Stream details:', {
        active: mediaStream.active,
        tracks: mediaStream.getTracks().length,
        videoTracks: mediaStream.getVideoTracks().length
      });
      
      setStream(mediaStream);
      
      // Wait for the video element to be available with retries
      let retries = 0;
      const maxRetries = 10;
      
      while (retries < maxRetries && !videoRef.current) {
        console.log(`⏳ Waiting for video element... (attempt ${retries + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 200));
        retries++;
      }
      
      if (!videoRef.current) {
        console.log('❌ Video ref not available after retries');
        throw new Error('Video element could not be initialized. Please try again.');
      }
      
      console.log('✅ Video element is ready!');
      
      videoRef.current.srcObject = mediaStream;
      
      // Force play the video
      try {
        await videoRef.current.play();
        console.log('🎬 Video started playing');
      } catch (playError) {
        console.log('⚠️ Video play error (might be normal):', playError);
      }
      
      // Wait for video to be ready
      const handleLoadedMetadata = () => {
        console.log('📺 Video metadata loaded');
        setCameraLoading(false);
      };
      
      const handleCanPlay = () => {
        console.log('▶️ Video can play');
        setCameraLoading(false);
      };
      
      videoRef.current.onloadedmetadata = handleLoadedMetadata;
      videoRef.current.oncanplay = handleCanPlay;
      
      // Fallback timeout
      setTimeout(() => {
        console.log('⏰ Video ready timeout, assuming ready');
        setCameraLoading(false);
      }, 5000);
      
    } catch (error: any) {
      console.error("❌ Camera access error:", error);
      setCameraLoading(false);
      setShowCamera(false); // Hide camera UI on error
      
      let errorMessage = 'Camera access denied. Please enable camera permissions in your browser settings.';
      
      if (error.name === 'NotFoundError') {
        errorMessage = 'No camera found on this device.';
      } else if (error.name === 'NotAllowedError') {
        errorMessage = 'Camera access denied. Please allow camera permissions and try again.';
      } else if (error.name === 'NotSupportedError') {
        errorMessage = 'Camera not supported by this browser.';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Camera is already in use by another application.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        variant: "destructive",
        title: "Camera Error",
        description: errorMessage
      });
    }
  };

  const stopCamera = () => {
    console.log('🧹 Cleaning up camera stream...');
    
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
        console.log('🛑 Stopped camera track');
      });
      setStream(null);
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.onloadedmetadata = null;
      videoRef.current.oncanplay = null;
    }
    
    setShowCamera(false);
    setCameraLoading(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw the video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert canvas to blob
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `camera-capture-${Date.now()}.jpg`, {
          type: 'image/jpeg'
        });
        
        setSelectedFile(file);
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        
        // Stop camera after capture
        stopCamera();
        
        toast({
          title: "Photo captured",
          description: "Photo has been captured successfully.",
        });
      }
    }, 'image/jpeg', 0.9);
  };

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      toast({
        title: "File too large",
        description: "Please select an image smaller than 5MB.",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const uploadPhoto = async (): Promise<string | null> => {
    if (!selectedFile) return null;

    setIsUploading(true);
    try {
      const fileExtension = selectedFile.name.split('.').pop();
      const fileName = `profile-${user.id}.${fileExtension}`;
      const storageRef = ref(storage, `schools/${schoolId}/users/${fileName}`);
      
      await uploadBytes(storageRef, selectedFile);
      const downloadURL = await getDownloadURL(storageRef);
      
      return downloadURL;
    } catch (error) {
      console.error("Error uploading photo:", error);
      toast({
        title: "Upload failed",
        description: "Failed to upload photo. Please try again.",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let photoUrl = user.photoUrl;

      // Upload new photo if selected
      if (selectedFile) {
        const newPhotoUrl = await uploadPhoto();
        if (newPhotoUrl) {
          photoUrl = newPhotoUrl;
        } else {
          // If photo upload failed, don't proceed with saving
          setIsSaving(false);
          return;
        }
      }

      // Update user document in school users collection only
      // Global users collection doesn't allow updates per Firestore rules
      const schoolUserRef = doc(db, `schools/${schoolId}/users`, user.id);
      
      const updateData = {
        displayName: formData.displayName.trim() || null,
        phoneNumber: formData.phoneNumber.trim() || null,
        ...(photoUrl !== user.photoUrl && { photoUrl }),
      };

      await updateDoc(schoolUserRef, updateData);

      toast({
        title: "User updated",
        description: "User profile has been updated successfully.",
      });

      setIsOpen(false);
      onUpdate();
    } catch (error) {
      console.error("Error updating user:", error);
      toast({
        title: "Update failed",
        description: "Failed to update user profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsOpen(false);
    setFormData({
      displayName: user.displayName || "",
      phoneNumber: user.phoneNumber || "",
    });
    setSelectedFile(null);
    setPreviewUrl(null);
    setShowCamera(false);
    stopCamera();
  };

  // Show edit button for drivers, supervisors, and parents
  if (user.role !== 'driver' && user.role !== 'supervisor' && user.role !== 'parent') {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 w-8 p-0">
          <User className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit User Profile</DialogTitle>
          <DialogDescription>
            Update {user.displayName || user.email}'s profile photo and contact information.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Profile Photo Section */}
          <div className="space-y-4">
            <Label>Profile Photo</Label>
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarImage 
                  src={previewUrl || user.photoUrl} 
                  alt={user.displayName || "Profile"} 
                />
                <AvatarFallback>
                  <User className="h-8 w-8" />
                </AvatarFallback>
              </Avatar>
              
              <div className="space-y-2 flex-1">
                {!showCamera ? (
                  <>
                    <div
                      className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center cursor-pointer hover:border-muted-foreground/50 transition-colors"
                      onDrop={handleDrop}
                      onDragOver={(e) => e.preventDefault()}
                      onClick={() => document.getElementById('photo-upload')?.click()}
                    >
                      <Camera className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Drop an image here or click to select
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Max 5MB, JPG/PNG only
                      </p>
                    </div>
                    <input
                      id="photo-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleFileInput}
                      className="hidden"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={startCamera}
                        disabled={cameraLoading}
                        className="flex-1"
                      >
                        <Video className="h-4 w-4 mr-2" />
                        {cameraLoading ? "Starting Camera..." : "Use Camera"}
                      </Button>
                    </div>
                    {selectedFile && (
                      <p className="text-sm text-green-600">
                        Selected: {selectedFile.name}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        controls={false}
                        style={{ 
                          transform: 'scaleX(-1)',
                          width: '100%',
                          height: '192px',
                          backgroundColor: '#000',
                          borderRadius: '8px',
                          objectFit: 'cover'
                        }}
                        className="block"
                      />
                      {cameraLoading && (
                        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg">
                          <div className="text-white text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                            <p className="text-sm">Starting camera...</p>
                          </div>
                        </div>
                      )}
                      <canvas
                        ref={canvasRef}
                        className="hidden"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={capturePhoto}
                        className="flex-1"
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        Capture Photo
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={stopCamera}
                      >
                        <Square className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={formData.displayName}
                onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                placeholder="Enter display name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={user.email}
                disabled
                className="bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                value={formData.phoneNumber}
                onChange={(e) => setFormData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                placeholder="Enter phone number"
                type="tel"
              />
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <Input
                value={user.role}
                disabled
                className="bg-muted capitalize"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={handleCancel}
            disabled={isSaving || isUploading}
          >
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={isSaving || isUploading}
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditableUserRow({ user, onUpdate, schoolId }: { user: User, onUpdate: () => void, schoolId: string }) {
    const { toast } = useToast();

    const handleActiveToggle = async (newActiveState: boolean) => {
        const userRef = doc(db, `schools/${schoolId}/users`, user.id);
        try {
            await updateDoc(userRef, { 
                active: newActiveState,
                ...(user.pending && newActiveState && { pending: false })
            });
            toast({
                title: "Success!",
                description: `User has been ${newActiveState ? 'activated' : 'deactivated'}.`,
                className: 'bg-accent text-accent-foreground border-0',
            });
            onUpdate();
        } catch (error) {
            console.error("[users toggle active]", error);
            toast({
                variant: "destructive",
                title: "Update Failed",
                description: "There was a problem updating the user.",
            });
        }
    };
    
    const handleRoleUpdate = async (newRole: UserRoleType) => {
        const userRef = doc(db, `schools/${schoolId}/users`, user.id);
        try {
            await updateDoc(userRef, { role: newRole });
            toast({
                title: "Success!",
                description: `User role has been updated.`,
                className: 'bg-accent text-accent-foreground border-0',
            });
            onUpdate();
        } catch (error) {
            console.error("[users update role]", error);
            toast({
                variant: "destructive",
                title: "Update Failed",
                description: "There was a problem updating the user role.",
            });
        }
    };

    const handleResendInvite = async () => {
        const userRef = doc(db, "users", user.id);
        try {
            await updateDoc(userRef, {
                invitedAt: Timestamp.now(),
            });
            toast({
                title: "Invite Resent",
                description: `A new invitation has been sent to ${user.email}.`,
                className: 'bg-accent text-accent-foreground border-0',
            });
            onUpdate();
        } catch (error) {
            console.error("[users resend invite]", error);
            toast({
                variant: "destructive",
                title: "Invite Failed",
                description: "There was a problem resending the invitation.",
            });
        }
    };
    
    const RoleIcon = roleIcons[user.role] || Users;
    
    const getStatusBadge = () => {
        if (user.pending) {
            return (
                <div className="flex items-center gap-2">
                     <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">Pending</Badge>
                     <Button variant="ghost" size="sm" onClick={handleResendInvite} className="h-7 gap-1 text-xs">
                        <Send className="h-3 w-3" />
                        Resend Invite
                     </Button>
                </div>
            );
        }
        if (user.active) {
            return <Badge className="bg-green-100 text-green-800 hover:bg-green-100/80 border-green-200">Active</Badge>;
        }
        return <Badge variant="secondary">Inactive</Badge>;
    };

    return (
        <TableRow key={user.id}>
            <TableCell className="font-medium">{user.displayName || 'Invited User'}</TableCell>
            <TableCell>{user.email}</TableCell>
            <TableCell>
                <div className="flex items-center gap-2">
                   <RoleIcon className="h-4 w-4 text-muted-foreground" />
                   <span className="capitalize">{user.role}</span>
                </div>
            </TableCell>
             <TableCell>
                <Switch
                    checked={!!user.active}
                    onCheckedChange={handleActiveToggle}
                    aria-label="Toggle Active Status"
                    disabled={user.pending}
                />
            </TableCell>
            <TableCell className="text-right">
                {getStatusBadge()}
            </TableCell>
            <TableCell className="text-right">
                <div className="flex items-center gap-2 justify-end">
                     <EditUserDialog user={user} onUpdate={onUpdate} schoolId={schoolId} />
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
                </div>
            </TableCell>
        </TableRow>
    );
}

function UsersList({ onUserInvited, schoolId }: { onUserInvited: () => void, schoolId: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadUsers = async () => {
        if (!schoolId) {
            setIsLoading(false);
            return;
        };
        setIsLoading(true);
        setError(null);
        try {
            const usersData = await listUsersForSchool(schoolId);
            setUsers(usersData as User[]);
        } catch (e: any) {
            console.error("[users load]", e);
            const errorMessage = e.code === 'permission-denied'
                ? "You do not have permission to view users."
                : e.message ?? "An unknown error occurred.";
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };
    loadUsers();
  }, [schoolId, onUserInvited]);
  
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
        {error && <Alert variant="destructive" className="mb-4"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        {/* Mobile responsive table wrapper */}
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[150px]">Display Name</TableHead>
              <TableHead className="min-w-[200px]">Email</TableHead>
              <TableHead className="min-w-[100px]">Role</TableHead>
              <TableHead className="min-w-[80px]">Active</TableHead>
              <TableHead className="text-right min-w-[100px]">Status</TableHead>
              <TableHead className="text-right min-w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Skeleton className="h-4 w-1/2 mx-auto" />
                </TableCell>
              </TableRow>
            ) : users.length > 0 ? (
              users.map((user) => (
                <EditableUserRow key={user.id} user={user} onUpdate={onUserInvited} schoolId={schoolId} />
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No users found for this school. Invite one to get started!
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
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
        return <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{profileError.message}</AlertDescription></Alert>
    }

    if (!profile) {
        return <Alert><AlertTitle>Access Denied</AlertTitle><AlertDescription>No user profile found.</AlertDescription></Alert>
    }

    return (
        <div className="grid gap-8">
            <UsersList key={key} onUserInvited={forceRerender} schoolId={profile.schoolId} />
        </div>
    );
}

    