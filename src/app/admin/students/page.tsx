

"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  deleteField,
  writeBatch,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { useProfile } from "@/lib/useProfile";
import { listStudentsForSchool, listRoutesForSchool, listBusesForSchool, getSchoolProfile } from "@/lib/firestoreQueries";
import { scol, sdoc } from "@/lib/schoolPath";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle, Trash2, Pencil, Search, Route, Bus, GraduationCap, Upload, Camera, X, MapPin, XCircle, Link, CheckCircle, AlertCircle, Printer } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { db, storage } from "@/lib/firebase";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { parseLocationLink, formatCoordinates, type LocationCoordinates } from "@/lib/locationParser";
import QRCode from "qrcode";
import { generateQRCodeImage } from '@/lib/qrCodeGenerator';

const studentSchema = z.object({
  name: z.string().min(1, { message: "Student name is required." }),
  grade: z.string().max(15, "Grade is too long.").optional().nullable(),
  photoUrl: z.string().url("Must be a valid URL.").optional().nullable(),
  assignedRouteId: z.string().nullable().optional(),
  assignedBusId: z.string().nullable().optional(),
  pickupLat: z.coerce.number().min(-90).max(90, "Invalid latitude.").optional().nullable(),
  pickupLng: z.coerce.number().min(-180).max(180, "Invalid longitude.").optional().nullable(),
});

type StudentFormValues = z.infer<typeof studentSchema>;

interface Student {
  id: string;
  name: string;
  grade?: string;
  photoUrl?: string;
  photoUrlThumb?: string;
  assignedRouteId?: string | null;
  assignedBusId?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  schoolId: string;
}

interface RouteInfo {
    id: string;
    name: string;
}

interface BusInfo {
    id: string;
    busCode: string;
}

const NONE_SENTINEL = "__none__";


// --- Image & Camera Components ---

async function processImage(file: File): Promise<Blob> {
    const MAX_DIMENSION = 1024;
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;

                if (width > height) {
                    if (width > MAX_DIMENSION) {
                        height *= MAX_DIMENSION / width;
                        width = MAX_DIMENSION;
                    }
                } else {
                    if (height > MAX_DIMENSION) {
                        width *= MAX_DIMENSION / height;
                        height = MAX_DIMENSION;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject(new Error("Failed to get canvas context"));
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (!blob) return reject(new Error("Canvas to Blob conversion failed"));
                    resolve(blob);
                }, 'image/jpeg', 0.85);
            };
            img.onerror = reject;
            img.src = event.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}


function CameraCaptureDialog({ onCapture, onClose, isOpen }: { onCapture: (blob: Blob) => void, onClose: () => void, isOpen: boolean }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isVideoReady, setIsVideoReady] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        if (!isOpen) return; // Only run when dialog is open
        
        let activeStream: MediaStream | null = null;
        let isMounted = true;
        
        const getCameraPermission = async () => {
            console.log('🎥 Requesting camera permission...');
            setIsLoading(true);
            setError(null);
            setIsVideoReady(false);
            
            // Wait for the dialog to be fully rendered and video element to be available
            let retries = 0;
            const maxRetries = 10;
            
            while (retries < maxRetries && !videoRef.current && isMounted) {
                console.log(`⏳ Waiting for video element... (attempt ${retries + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, 200));
                retries++;
            }
            
            if (!videoRef.current) {
                console.log('❌ Video ref not available after retries');
                if (isMounted) {
                    setError('Video element could not be initialized. Please try again.');
                    setIsLoading(false);
                }
                return;
            }
            
            console.log('✅ Video element is ready!');

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
                
                if (!isMounted) {
                    mediaStream.getTracks().forEach(track => track.stop());
                    return;
                }
                
                console.log('✅ Camera access granted, setting up video stream...');
                console.log('📊 Stream details:', {
                    active: mediaStream.active,
                    tracks: mediaStream.getTracks().length,
                    videoTracks: mediaStream.getVideoTracks().length
                });
                
                activeStream = mediaStream;
                setStream(activeStream);
                
                if (videoRef.current && isMounted) {
                    videoRef.current.srcObject = activeStream;
                    
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
                        if (isMounted) {
                            setIsVideoReady(true);
                            setIsLoading(false);
                        }
                    };
                    
                    const handleCanPlay = () => {
                        console.log('▶️ Video can play');
                        if (isMounted) {
                            setIsVideoReady(true);
                            setIsLoading(false);
                        }
                    };
                    
                    videoRef.current.onloadedmetadata = handleLoadedMetadata;
                    videoRef.current.oncanplay = handleCanPlay;
                    
                    // Fallback timeout
                    setTimeout(() => {
                        if (isMounted && !isVideoReady) {
                            console.log('⏰ Video ready timeout, assuming ready');
                            setIsVideoReady(true);
                            setIsLoading(false);
                        }
                    }, 5000);
                }
            } catch (err: any) {
                console.error("❌ Camera access error:", err);
                if (!isMounted) return;
                
                setIsLoading(false);
                
                let errorMessage = 'Camera access denied. Please enable camera permissions in your browser settings.';
                
                if (err.name === 'NotFoundError') {
                    errorMessage = 'No camera found on this device.';
                } else if (err.name === 'NotAllowedError') {
                    errorMessage = 'Camera access denied. Please allow camera permissions and try again.';
                } else if (err.name === 'NotSupportedError') {
                    errorMessage = 'Camera not supported by this browser.';
                } else if (err.name === 'NotReadableError') {
                    errorMessage = 'Camera is already in use by another application.';
                } else if (err.message) {
                    errorMessage = err.message;
                }
                
                setError(errorMessage);
                toast({
                    variant: 'destructive',
                    title: 'Camera Error',
                    description: errorMessage,
                });
            }
        };

        getCameraPermission();

        return () => {
            console.log('🧹 Cleaning up camera stream...');
            isMounted = false;
            if (activeStream) {
                activeStream.getTracks().forEach(track => {
                    track.stop();
                    console.log('🛑 Stopped camera track');
                });
            }
        };
    }, [isOpen, toast]);

    const handleCapture = () => {
        if (!videoRef.current) return;
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
            if (blob) {
                onCapture(blob);
                onClose();
            }
        }, 'image/jpeg', 0.85);
    };

    return (
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Take Photo</DialogTitle>
            </DialogHeader>
            <div className="relative">
                <video 
                    ref={videoRef} 
                    className="w-full aspect-video rounded-md bg-muted" 
                    autoPlay 
                    playsInline 
                    muted 
                    style={{ display: isVideoReady && !error ? 'block' : 'none' }}
                />
                {isLoading && !error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted rounded-md p-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
                        <p className="text-sm text-muted-foreground text-center">Starting camera...</p>
                    </div>
                )}
                {error && (
                     <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50 rounded-md p-4">
                        <XCircle className="h-8 w-8 text-red-500 mb-2" />
                        <p className="text-red-700 text-center text-sm">{error}</p>
                    </div>
                )}
                {!isLoading && !error && !isVideoReady && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted rounded-md p-4">
                        <Camera className="h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground text-center">Connecting to camera...</p>
                    </div>
                )}
            </div>
            <DialogFooter>
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
                <Button onClick={handleCapture} disabled={!stream || !!error || !isVideoReady || isLoading}>
                    <Camera className="mr-2" /> 
                    {isLoading ? 'Starting...' : 'Capture'}
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}

function ImageUploader({ schoolId, studentId, currentPhotoUrl, onUrlChange }: { schoolId: string, studentId: string, currentPhotoUrl?: string | null, onUrlChange: (url: string | null) => void }) {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleUpload = async (file: File | Blob) => {
        console.log("Starting upload...", file);
        setUploading(true);
        setProgress(10);
        
        try {
            console.log("Processing image...");
            const imageBlob = file instanceof File ? await processImage(file) : file;
            setProgress(30);
            
            console.log("Creating FormData...");
            // Create FormData for the API request
            const formData = new FormData();
            formData.append('file', imageBlob, 'profile.jpg');
            formData.append('schoolId', schoolId);
            formData.append('studentId', studentId);
            setProgress(50);

            console.log("Sending to API...");
            // Upload via API route
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });
            setProgress(80);

            console.log("Response received:", response.status);
            if (!response.ok) {
                const errorData = await response.json();
                console.error("API Error:", errorData);
                throw new Error(errorData.error || 'Upload failed');
            }

            const result = await response.json();
            console.log("Upload successful:", result);
            onUrlChange(result.downloadURL);
            toast({ title: "Photo Updated!" });
            setProgress(100);
            
            // Keep the progress visible for a moment
            setTimeout(() => {
                setUploading(false);
                setProgress(0);
            }, 1000);
        } catch (error) {
            console.error("Upload failed:", error);
            toast({ variant: "destructive", title: "Upload Failed", description: (error as Error).message });
            setUploading(false);
            setProgress(0);
        }
    };
    
    const handleRemove = async () => {
        if (!currentPhotoUrl) return;
        // The Functions-based thumbnailer uses this naming convention
        const mainPhotoRef = ref(storage, `schools/${schoolId}/students/${studentId}/profile.jpg`);
        const thumbPhotoRef = ref(storage, `schools/${schoolId}/students/${studentId}/profile_128.jpg`);
        
        try {
            // Attempt to delete both, ignoring "not found" errors.
            await Promise.all([
                deleteObject(mainPhotoRef).catch(e => e.code !== 'storage/object-not-found' && Promise.reject(e)),
                deleteObject(thumbPhotoRef).catch(e => e.code !== 'storage/object-not-found' && Promise.reject(e)),
            ]);
        } catch (error: any) {
             console.error("Failed to delete photo from Storage", error);
             toast({ variant: "destructive", title: "Deletion Failed", description: "Could not remove the old photo from storage." });
             return; // Stop if we can't delete the file.
        }
        onUrlChange(null);
        toast({ title: "Photo Removed" });
    }

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            handleUpload(file);
        }
    };
    
    return (
        <div className="space-y-2">
            <FormLabel>Student Photo</FormLabel>
            <div className="flex items-center gap-4">
                <Avatar className="h-24 w-24 rounded-md">
                    <AvatarImage src={currentPhotoUrl || undefined} alt="Student photo" className="object-cover" />
                    <AvatarFallback className="rounded-md">
                        <GraduationCap className="h-10 w-10 text-muted-foreground" />
                    </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2">
                     <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
                     <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                            <Upload className="mr-2" /> Upload
                        </Button>
                        <Dialog open={isCameraOpen} onOpenChange={setIsCameraOpen}>
                           <DialogTrigger asChild>
                              <Button type="button" variant="outline" disabled={uploading}><Camera className="mr-2"/> Camera</Button>
                           </DialogTrigger>
                           <CameraCaptureDialog 
                               onCapture={(blob) => handleUpload(blob)} 
                               onClose={() => setIsCameraOpen(false)}
                               isOpen={isCameraOpen}
                           />
                        </Dialog>
                     </div>
                    {currentPhotoUrl && (
                        <Button type="button" variant="ghost" className="text-red-500" onClick={handleRemove} disabled={uploading}>
                            <X className="mr-2" /> Remove Photo
                        </Button>
                    )}
                    {uploading && <Progress value={progress} className="w-full" />}
                </div>
            </div>
        </div>
    );
}

function StudentForm({ student, onComplete, routes, buses, schoolId }: { student?: Student, onComplete: () => void, routes: RouteInfo[], buses: BusInfo[], schoolId: string }) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [locationLink, setLocationLink] = useState("");
    const [locationParseResult, setLocationParseResult] = useState<{ success: boolean; coordinates?: LocationCoordinates; error?: string } | null>(null);
    const isEditMode = !!student;

    // Handle location link parsing
    const handleLocationLinkChange = (value: string) => {
        setLocationLink(value);
        
        if (!value.trim()) {
            setLocationParseResult(null);
            return;
        }

        const result = parseLocationLink(value);
        setLocationParseResult(result);

        if (result.success && result.coordinates) {
            // Auto-fill the latitude and longitude fields
            form.setValue('pickupLat', result.coordinates.latitude, { shouldDirty: true });
            form.setValue('pickupLng', result.coordinates.longitude, { shouldDirty: true });
            
            toast({
                title: "Location Parsed Successfully!",
                description: `Coordinates: ${formatCoordinates(result.coordinates)}`,
                className: 'bg-accent text-accent-foreground border-0',
            });
        }
    };

    const form = useForm<StudentFormValues>({
        resolver: zodResolver(studentSchema),
        defaultValues: {
            name: student?.name || "",
            grade: student?.grade || "",
            photoUrl: student?.photoUrl || null,
            assignedRouteId: student?.assignedRouteId || null,
            assignedBusId: student?.assignedBusId || null,
            pickupLat: student?.pickupLat || null,
            pickupLng: student?.pickupLng || null,
        },
    });

    const onSubmit = async (data: StudentFormValues) => {
        setIsSubmitting(true);
        try {
            let studentId = student?.id;
            const isNewStudent = !isEditMode;

            // For new students, create the doc first to get an ID.
            if (isNewStudent) {
                 const newStudentRef = await addDoc(scol(schoolId, "students"), { 
                     name: data.name, 
                     schoolId,
                     createdAt: serverTimestamp(),
                 });
                 studentId = newStudentRef.id;
                 toast({ title: "Student Created!", description: "You can now edit the student to add assignments and a photo."});
            }
            if (!studentId) throw new Error("Could not determine student ID.");

            const studentData: any = {
                name: data.name,
                grade: data.grade || deleteField(),
                photoUrl: data.photoUrl || deleteField(),
                pickupLat: data.pickupLat ?? deleteField(),
                pickupLng: data.pickupLng ?? deleteField(),
                updatedAt: serverTimestamp()
            };
            
            // Only add photoUpdatedAt if the URL is being set/changed
            if (data.photoUrl && data.photoUrl !== student?.photoUrl) {
                studentData.photoUpdatedAt = serverTimestamp();
            } else if (!data.photoUrl && student?.photoUrl) {
                // If removing URL, also remove the timestamp.
                 studentData.photoUpdatedAt = deleteField();
            }

            const selectedRoute = routes.find(r => r.id === data.assignedRouteId);
            const selectedBus = buses.find(b => b.id === data.assignedBusId);

            if (selectedRoute) {
                studentData.assignedRouteId = selectedRoute.id;
                studentData.routeName = selectedRoute.name;
            } else {
                studentData.assignedRouteId = deleteField();
                studentData.routeName = deleteField();
            }

            if (selectedBus) {
                studentData.assignedBusId = selectedBus.id;
                studentData.busCode = selectedBus.busCode;
            } else {
                studentData.assignedBusId = deleteField();
                studentData.busCode = deleteField();
            }

            const studentRef = sdoc(schoolId, "students", studentId);
            await updateDoc(studentRef, studentData);

            if (!isNewStudent) {
                toast({
                    title: "Success!",
                    description: `Student has been updated.`,
                    className: 'bg-accent text-accent-foreground border-0',
                });
            }
            
            form.reset();
            onComplete();
        } catch (error) {
            console.error("[students save]", error);
            toast({
                variant: "destructive",
                title: "Uh oh! Something went wrong.",
                description: "There was a problem saving the student.",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
         <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {isEditMode && student && (
                <ImageUploader 
                    schoolId={schoolId} 
                    studentId={student.id} 
                    currentPhotoUrl={form.watch('photoUrl')}
                    onUrlChange={(url) => form.setValue('photoUrl', url, { shouldDirty: true })}
                />
            )}
            <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>Student Name</FormLabel><FormControl><Input placeholder="e.g., Jane Doe" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={form.control} name="grade" render={({ field }) => (
                    <FormItem><FormLabel>Grade</FormLabel><FormControl><Input placeholder="e.g., 5" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )}/>
            </div>
            
             <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="assignedRouteId" render={({ field }) => (
                    <FormItem><FormLabel>Assign to Route (Optional)</FormLabel>
                    <Select value={field.value ?? NONE_SENTINEL} onValueChange={(value) => field.onChange(value === NONE_SENTINEL ? null : value)}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select a route" /></SelectTrigger></FormControl>
                        <SelectContent><SelectItem value={NONE_SENTINEL}>Not Assigned</SelectItem>{routes.map((route) => (<SelectItem key={route.id} value={route.id}>{route.name}</SelectItem>))}</SelectContent>
                    </Select><FormMessage /></FormItem>
                )}/>
                <FormField control={form.control} name="assignedBusId" render={({ field }) => (
                    <FormItem><FormLabel>Assign to Bus (Optional)</FormLabel>
                    <Select value={field.value ?? NONE_SENTINEL} onValueChange={(value) => field.onChange(value === NONE_SENTINEL ? null : value)}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select a bus" /></SelectTrigger></FormControl>
                        <SelectContent><SelectItem value={NONE_SENTINEL}>Not Assigned</SelectItem>{buses.map((bus) => (<SelectItem key={bus.id} value={bus.id}>{bus.busCode}</SelectItem>))}</SelectContent>
                    </Select><FormMessage /></FormItem>
                )}/>
            </div>
            
            {/* Location Link Input */}
            <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Import Location from WhatsApp/Google Maps Link
                </label>
                <div className="relative">
                    <Link className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Paste WhatsApp or Google Maps location link here..."
                        value={locationLink}
                        onChange={(e) => handleLocationLinkChange(e.target.value)}
                        className="pl-10"
                    />
                    {locationParseResult && (
                        <div className="absolute right-3 top-3">
                            {locationParseResult.success ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                                <AlertCircle className="h-4 w-4 text-red-500" />
                            )}
                        </div>
                    )}
                </div>
                {locationParseResult && !locationParseResult.success && (
                    <p className="text-sm text-red-500 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {locationParseResult.error}
                    </p>
                )}
                {locationParseResult && locationParseResult.success && locationParseResult.coordinates && (
                    <p className="text-sm text-green-600 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Location parsed: {formatCoordinates(locationParseResult.coordinates)}
                    </p>
                )}
            </div>

             <div className="grid grid-cols-2 gap-4">
                 <FormField control={form.control} name="pickupLat" render={({ field }) => (
                    <FormItem><FormLabel>Pickup Latitude</FormLabel><FormControl><Input type="number" step="any" placeholder="e.g., 32.8853" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )}/>
                 <FormField control={form.control} name="pickupLng" render={({ field }) => (
                    <FormItem><FormLabel>Pickup Longitude</FormLabel><FormControl><Input type="number" step="any" placeholder="e.g., 13.1802" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )}/>
            </div>
            
             <DialogFooter>
                <DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : (isEditMode ? "Save Changes" : "Add Student")}
                </Button>
            </DialogFooter>
          </form>
        </Form>
    );
}

function StudentDialog({ children, student, onComplete, routes, buses, schoolId }: { children: React.ReactNode, student?: Student, onComplete: () => void, routes: RouteInfo[], buses: BusInfo[], schoolId: string }) {
    const [isOpen, setIsOpen] = useState(false);

    const handleComplete = () => {
        setIsOpen(false);
        onComplete();
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="sm:max-w-[625px]">
                <DialogHeader>
                    <DialogTitle>{student ? 'Edit Student' : 'Add New Student'}</DialogTitle>
                    <DialogDescription>
                       {student ? 'Update the details for this student.' : 'Fill in the details for the new student.'}
                    </DialogDescription>
                </DialogHeader>
                <StudentForm student={student} routes={routes} buses={buses} schoolId={schoolId} onComplete={handleComplete} />
            </DialogContent>
        </Dialog>
    );
}

const importSchema = z.object({
    studentId: z.string().min(1),
    grade: z.string().optional(),
    photoUrl: z.string().url().optional().or(z.literal('')),
    pickupLat: z.coerce.number().optional(),
    pickupLng: z.coerce.number().optional(),
    pickupLocationLink: z.string().optional(),
});
type StudentImportRow = z.infer<typeof importSchema>;

function ImportDialog({ onComplete, schoolId }: { onComplete: () => void, schoolId: string }) {
    const [isOpen, setIsOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [logs, setLogs] = useState<string[]>([]);
    const { toast } = useToast();

    const resetState = () => {
        setFile(null);
        setIsProcessing(false);
        setProgress(0);
        setLogs([]);
    }

    const handleOpenChange = (open: boolean) => {
        if (!open) {
            resetState();
        }
        setIsOpen(open);
    }
    
    const downloadTemplate = () => {
        const headers = "studentId,grade,photoUrl,pickupLat,pickupLng,pickupLocationLink";
        const content = "student001,5,https://example.com/photo.jpg,32.88,13.18,\nstudent002,3,,,https://maps.google.com/maps?q=32.88,13.18\nstudent003,4,,,https://www.google.com/maps/place/School+Name/@32.88,13.18,17z\n";
        const blob = new Blob([headers + "\n" + content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "students_template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImport = async () => {
        if (!file) {
            toast({ variant: "destructive", title: "No file selected" });
            return;
        }

        setIsProcessing(true);
        setLogs(['Reading and validating student data...']);
        
        const text = await file.text();
        const lines = text.split('\n').filter(Boolean);
        const headers = lines.shift()?.trim().split(',') || [];
        
        const validRows: StudentImportRow[] = [];
        const studentIds = new Set<string>();

        // Pre-fetch all students to validate existence
        const allStudentsSnap = await getDocs(scol(schoolId, 'students'));
        const existingStudentIds = new Set(allStudentsSnap.docs.map(doc => doc.id));
        setLogs(prev => [...prev, `Found ${existingStudentIds.size} existing student documents.`]);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const values = line.split(',');
            const rowData: any = headers.reduce((obj, header, index) => {
                obj[header.trim()] = values[index]?.trim() || '';
                return obj;
            }, {} as any);

            const result = importSchema.safeParse(rowData);
            if (!result.success) {
                setLogs(prev => [...prev, `[FAIL] Row ${i + 1}: Invalid data - ${result.error.errors.map(e => e.message).join(', ')}`]);
                continue;
            }
            if (!existingStudentIds.has(result.data.studentId)) {
                setLogs(prev => [...prev, `[FAIL] Row ${i + 1}: Student with ID "${result.data.studentId}" does not exist.`]);
                continue;
            }
            if (studentIds.has(result.data.studentId)) {
                setLogs(prev => [...prev, `[WARN] Row ${i + 1}: Duplicate student ID "${result.data.studentId}" in CSV. Skipping.`]);
                continue;
            }

            studentIds.add(result.data.studentId);
            validRows.push(result.data);
        }

        if (validRows.length === 0) {
            setLogs(prev => [...prev, 'No valid rows to import.']);
            setIsProcessing(false);
            return;
        }

        setLogs(prev => [...prev, `Validated ${validRows.length} rows. Starting batched writes...`]);
        setProgress(10);
        
        try {
            const BATCH_SIZE = 100;
            for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
                const batch = writeBatch(db);
                const chunk = validRows.slice(i, i + BATCH_SIZE);
                
                for (const row of chunk) {
                    const studentRef = sdoc(schoolId, "students", row.studentId);
                    const updateData: Record<string, any> = {};
                    if (row.grade !== undefined) updateData.grade = row.grade;
                    if (row.photoUrl !== undefined) updateData.photoUrl = row.photoUrl || deleteField();
                    
                    // Handle pickup location - prioritize coordinates, then try to parse location link
                    if (row.pickupLat !== undefined && row.pickupLng !== undefined) {
                        updateData.pickupLat = row.pickupLat;
                        updateData.pickupLng = row.pickupLng;
                    } else if (row.pickupLocationLink && row.pickupLocationLink.trim()) {
                        try {
                            const parseResult = parseLocationLink(row.pickupLocationLink.trim());
                            if (parseResult.success && parseResult.coordinates) {
                                updateData.pickupLat = parseResult.coordinates.lat;
                                updateData.pickupLng = parseResult.coordinates.lng;
                                setLogs(prev => [...prev, `[INFO] Parsed location link for student ${row.studentId}: ${parseResult.coordinates.lat}, ${parseResult.coordinates.lng}`]);
                            } else {
                                setLogs(prev => [...prev, `[WARN] Could not parse location link for student ${row.studentId}: ${parseResult.error || 'Unknown error'}`]);
                            }
                        } catch (error) {
                            setLogs(prev => [...prev, `[WARN] Error parsing location link for student ${row.studentId}: ${(error as Error).message}`]);
                        }
                    }
                    
                    if (Object.keys(updateData).length > 0) {
                        batch.update(studentRef, updateData);
                    }
                }
                
                await batch.commit();
                const currentProgress = ((i + chunk.length) / validRows.length) * 100;
                setProgress(currentProgress);
                setLogs(prev => [...prev, `Batch ${Math.floor(i / BATCH_SIZE) + 1} complete. ${Math.min(i + BATCH_SIZE, validRows.length)}/${validRows.length} students updated.`]);
            }

            toast({ title: "Import Successful!", description: `${validRows.length} students updated.` });
            onComplete();
            setIsOpen(false);
        } catch (error) {
            console.error("[import]", error);
            setLogs(prev => [...prev, `[FATAL] Error during Firestore write: ${(error as Error).message}`]);
            toast({ variant: "destructive", title: "Import Failed", description: "An error occurred during the write process." });
        } finally {
            setIsProcessing(false);
        }
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline">
                    <Upload className="mr-2 h-4 w-4" />
                    Import
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Import Students from CSV</DialogTitle>
                    <DialogDescription>
                        Update existing students in bulk. The CSV must contain a 'studentId' column that matches the document ID of the student.
                        You can set pickup locations using either coordinates (pickupLat, pickupLng) or Google Maps links (pickupLocationLink).
                    </DialogDescription>
                </DialogHeader>
                 <div className="space-y-4 py-4">
                    <Button variant="link" onClick={downloadTemplate} className="p-0 h-auto">
                        Download sample CSV template
                    </Button>
                     <Input
                        type="file"
                        accept=".csv"
                        onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                        disabled={isProcessing}
                    />
                    {isProcessing && (
                        <div className="space-y-2">
                             <Progress value={progress} />
                             <Card className="max-h-48 overflow-y-auto">
                                <CardContent className="p-2 text-xs font-mono">
                                    {logs.map((log, i) => <p key={i}>{log}</p>)}
                                </CardContent>
                             </Card>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                    <Button onClick={handleImport} disabled={!file || isProcessing}>
                        {isProcessing ? `Importing... (${Math.round(progress)}%)` : "Import"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


function StudentsList({ routes, buses, schoolId, onDataNeedsRefresh }: { routes: RouteInfo[], buses: BusInfo[], schoolId: string, onDataNeedsRefresh: () => void }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGrade, setSelectedGrade] = useState<string>("all");
  const [selectedRoute, setSelectedRoute] = useState<string>("all");
  const [selectedBus, setSelectedBus] = useState<string>("all");
  const [selectedPickupLocation, setSelectedPickupLocation] = useState<string>("all");
  const { toast } = useToast();

  useEffect(() => {
    const fetchStudents = async () => {
        if (!schoolId) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const studentsData = await listStudentsForSchool(schoolId);
            setStudents(studentsData as Student[]);
        } catch (error) {
            console.error("Error fetching students:", error);
            toast({ variant: "destructive", title: "Error fetching students", description: (error as Error).message });
        } finally {
            setIsLoading(false);
        }
    };
    fetchStudents();
  }, [schoolId, toast, onDataNeedsRefresh]);

  const handleDelete = async (studentId: string, studentName: string) => {
      try {
          await deleteDoc(sdoc(schoolId, "students", studentId));
          toast({
              title: "Student Deleted",
              description: `Student "${studentName}" has been removed.`,
          });
          onDataNeedsRefresh();
      } catch (error) {
          console.error("[students delete]", error);
          toast({
              variant: "destructive",
              title: "Deletion Failed",
              description: "There was a problem deleting the student.",
          });
      }
  };

  const generateQRCard = async (student: Student) => {
    try {
      // Fetch school profile for school name
      const schoolProfile = await getSchoolProfile(schoolId);
      const schoolName = schoolProfile?.name || "School Name";

      // Generate QR code using the proper generator that matches driver scanning format
      const qrCodeDataURL = await generateQRCodeImage(
        student.id,
        student.name,
        schoolId,
        {
          width: 300, // ~25mm at 300 DPI
          margin: 4, // Proper quiet zone
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        }
      );

      // Create a new window for printing
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast({
          variant: "destructive",
          title: "Print Failed",
          description: "Please allow popups to print the QR card.",
        });
        return;
      }

      // Create the CR80 vertical card HTML (53.98mm × 85.60mm)
      const cardHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Student ID Card - ${student.name}</title>
          <style>
            @page {
              size: 54mm 86mm;
              margin: 0;
            }
            
            body {
              margin: 0;
              padding: 0;
              font-family: 'Arial', sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              background-color: #f5f5f5;
            }
            
            .card {
              /* CR80 dimensions: 53.98mm × 85.60mm */
              width: 53.98mm;
              height: 85.60mm;
              background: white;
              border-radius: 3mm; /* Standard CR80 corner radius */
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
              display: flex;
              flex-direction: column;
              align-items: center;
              padding: 2.5mm;
              box-sizing: border-box;
              position: relative;
              overflow: hidden;
            }
            
            .app-header {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 1.5mm;
              margin-bottom: 2mm;
              width: 100%;
            }
            
            .app-logo {
              width: 6mm;
              height: 6mm;
              border-radius: 1mm;
            }
            
            .app-name {
              font-size: 3mm;
              font-weight: bold;
              color: #2563eb;
              text-transform: uppercase;
              letter-spacing: 0.3mm;
            }
            
            .school-name {
              font-size: 3.2mm;
              font-weight: bold;
              color: #000000;
              text-align: center;
              margin: 0 0 2.5mm 0;
              line-height: 1.2;
              text-transform: uppercase;
              letter-spacing: 0.2mm;
            }
            
            .photo-container {
              width: 26mm;
              height: 32mm;
              background-color: #f8f9fa;
              border: 1px solid #dee2e6;
              border-radius: 2mm;
              display: flex;
              align-items: center;
              justify-content: center;
              margin-bottom: 2.5mm;
              overflow: hidden;
            }
            
            .photo-container img {
              width: 100%;
              height: 100%;
              object-fit: cover;
            }
            
            .photo-placeholder {
              font-size: 8mm;
              color: #6c757d;
            }
            
            .student-name {
              font-size: 3.2mm;
              font-weight: bold;
              color: #000000;
              text-align: center;
              margin: 0 0 1mm 0;
              line-height: 1.1;
              max-width: 100%;
              word-wrap: break-word;
            }
            
            .student-grade {
              font-size: 2.5mm;
              color: #495057;
              text-align: center;
              margin: 0 0 4mm 0;
              line-height: 1.1;
            }
            
            .qr-container {
              width: 23mm;
              height: 23mm;
              background: white;
              padding: 1.5mm; /* Quiet zone */
              border-radius: 1mm;
              display: flex;
              align-items: center;
              justify-content: center;
              margin-bottom: 1.5mm;
            }
            
            .qr-code {
              width: 20mm;
              height: 20mm;
              display: block;
            }
            
            .footer-text {
              font-size: 2mm;
              color: #6c757d;
              text-align: center;
              margin: 0;
              line-height: 1.1;
            }
            
            @media print {
              body {
                background-color: white;
                padding: 0;
                margin: 0;
              }
              
              .card {
                box-shadow: none;
                border: 0.5pt solid #000000;
                page-break-inside: avoid;
              }
              
              /* Ensure high contrast for printing */
              .school-name,
              .student-name {
                color: #000000 !important;
              }
              
              .student-grade,
              .footer-text {
                color: #333333 !important;
              }
            }
            
            /* High DPI support */
            @media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
              .card {
                image-rendering: -webkit-optimize-contrast;
                image-rendering: crisp-edges;
              }
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="app-header">
              <svg class="app-logo" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #3b82f6;">
                <path d="M8 6v6h8V6"/>
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                <path d="M2 12h20"/>
                <circle cx="7" cy="19" r="2"/>
                <circle cx="17" cy="19" r="2"/>
              </svg>
              <div class="app-name">RouteMaster</div>
            </div>
            <div class="school-name">${schoolName}</div>
            
            <div class="photo-container">
              ${student.photoUrl ? 
                `<img src="${student.photoUrl}" alt="${student.name}" />` : 
                '<div class="photo-placeholder">🎓</div>'
              }
            </div>
            
            <div class="student-name">${student.name}</div>
            <div class="student-grade">Grade: ${student.grade || 'N/A'}</div>
            
            <div class="qr-container">
              <img src="${qrCodeDataURL}" alt="QR Code" class="qr-code" />
            </div>
            
            <div class="footer-text">Scan for details</div>
          </div>
        </body>
        </html>
      `;

      printWindow.document.write(cardHTML);
      printWindow.document.close();
      
      // Wait for images to load then print
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 500);
      };

      toast({
        title: "QR Card Generated",
        description: `QR card for ${student.name} is ready to print.`,
      });

    } catch (error) {
      console.error("Error generating QR card:", error);
      toast({
        variant: "destructive",
        title: "QR Generation Failed",
        description: "Failed to generate QR card. Please try again.",
      });
    }
  };
  
  const filteredStudents = useMemo(() => {
       return students.filter(student => {
         // Name filter
         const search = searchTerm.trim().toLowerCase();
         const nameMatch = !search || (student.name?.toLowerCase?.() ?? "").includes(search);
         
         // Grade filter
         const gradeMatch = !selectedGrade || selectedGrade === "all" || student.grade === selectedGrade;
         
         // Route filter
         const routeMatch = !selectedRoute || selectedRoute === "all" || 
           (selectedRoute === "unassigned" ? !student.assignedRouteId : student.assignedRouteId === selectedRoute);
         
         // Bus filter
         const busMatch = !selectedBus || selectedBus === "all" || 
           (selectedBus === "unassigned" ? !student.assignedBusId : student.assignedBusId === selectedBus);
         
         // Pickup location filter
         const pickupLocationMatch = !selectedPickupLocation || selectedPickupLocation === "all" || 
           (selectedPickupLocation === "not_set" ? (student.pickupLat == null || student.pickupLng == null) : 
            selectedPickupLocation === "set" ? (student.pickupLat != null && student.pickupLng != null) : true);
         
         return nameMatch && gradeMatch && routeMatch && busMatch && pickupLocationMatch;
       });
   }, [students, searchTerm, selectedGrade, selectedRoute, selectedBus, selectedPickupLocation]);

  // Get unique grades from students
  const uniqueGrades = useMemo(() => {
    const grades = students
      .map(student => student.grade)
      .filter((grade): grade is string => Boolean(grade))
      .filter((grade, index, array) => array.indexOf(grade) === index)
      .sort();
    return grades;
  }, [students]);

  // Clear all filters
  const clearAllFilters = () => {
    setSearchTerm("");
    setSelectedGrade("all");
    setSelectedRoute("all");
    setSelectedBus("all");
    setSelectedPickupLocation("all");
  };
  
  const getRouteName = (student: Student) => {
      if (!student.assignedRouteId) return <span className="text-muted-foreground">Not Assigned</span>;
      const route = routes.find(r => r.id === student.assignedRouteId);
      return route ? (
          <div className="flex items-center gap-2">
            <Route className="h-4 w-4 text-muted-foreground"/>
            {route.name}
          </div>
      ) : <span className="text-muted-foreground">Unknown Route</span>;
  }
  
  const getBusCode = (student: Student) => {
      if (!student.assignedBusId) return <span className="text-muted-foreground">Not Assigned</span>;
      const bus = buses.find(b => b.id === student.assignedBusId);
      return bus ? (
          <div className="flex items-center gap-2">
            <Bus className="h-4 w-4 text-muted-foreground"/>
            {bus.busCode}
          </div>
      ) : <span className="text-muted-foreground">Unknown Bus</span>;
  }

  const getPickupLocation = (student: Student) => {
      if (student.pickupLat != null && student.pickupLng != null) {
          return <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground"/>
            <span>{student.pickupLat.toFixed(4)}, {student.pickupLng.toFixed(4)}</span>
          </div>
      }
      return <span className="text-muted-foreground">Not Set</span>;
  }

  // Calculate students without pickup locations
  const studentsWithoutPickup = useMemo(() => {
    return students.filter(student => student.pickupLat == null || student.pickupLng == null);
  }, [students]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
            <CardTitle>Student Management</CardTitle>
            <CardDescription>
            Manage students for school {schoolId}.
            </CardDescription>
        </div>
        <div className="flex items-center gap-2">
            <ImportDialog schoolId={schoolId} onComplete={onDataNeedsRefresh} />
            <StudentDialog onComplete={onDataNeedsRefresh} routes={routes} buses={buses} schoolId={schoolId}>
                <Button disabled={!schoolId}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Student
                </Button>
            </StudentDialog>
        </div>
      </CardHeader>
      <CardContent>
        {/* Pickup Location Warning */}
        {studentsWithoutPickup.length > 0 && (
          <Alert className="mb-6 border-orange-200 bg-orange-50">
            <AlertCircle className="h-4 w-4 text-orange-600" />
            <AlertTitle className="text-orange-800">Pickup Locations Missing</AlertTitle>
            <AlertDescription className="text-orange-700">
              <div className="space-y-2">
                <p>
                  <strong>{studentsWithoutPickup.length}</strong> student{studentsWithoutPickup.length !== 1 ? 's' : ''} {studentsWithoutPickup.length !== 1 ? 'have' : 'has'} not set pickup locations yet.
                </p>
                <p className="text-sm">
                  Students need pickup locations for route optimization to work properly. 
                  You can filter by "Location Not Set" to view and manage these students, 
                  or use the bulk import feature to set multiple locations at once.
                </p>
                <div className="flex gap-2 mt-3">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setSelectedPickupLocation("not_set")}
                    className="border-orange-300 text-orange-700 hover:bg-orange-100"
                  >
                    <MapPin className="h-4 w-4 mr-1" />
                    View Students Without Locations
                  </Button>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}
         <div className="space-y-4 mb-6">
            {/* Search by Name */}
            <div className="relative w-full">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search by Name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                />
            </div>
            
            {/* Filter Controls */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {/* Grade Filter */}
                <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                        <GraduationCap className="h-4 w-4" />
                        Grade
                    </label>
                    <Select value={selectedGrade} onValueChange={setSelectedGrade}>
                         <SelectTrigger>
                             <SelectValue placeholder="All Grades" />
                         </SelectTrigger>
                         <SelectContent>
                             <SelectItem value="all">All Grades</SelectItem>
                             {uniqueGrades.map(grade => (
                                 <SelectItem key={grade} value={grade}>{grade}</SelectItem>
                             ))}
                         </SelectContent>
                     </Select>
                </div>

                {/* Route Filter */}
                <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                        <Route className="h-4 w-4" />
                        Route
                    </label>
                    <Select value={selectedRoute} onValueChange={setSelectedRoute}>
                         <SelectTrigger>
                             <SelectValue placeholder="All Routes" />
                         </SelectTrigger>
                         <SelectContent>
                             <SelectItem value="all">All Routes</SelectItem>
                             <SelectItem value="unassigned">Unassigned</SelectItem>
                             {routes.map(route => (
                                 <SelectItem key={route.id} value={route.id}>{route.name}</SelectItem>
                             ))}
                         </SelectContent>
                     </Select>
                </div>

                {/* Bus Filter */}
                <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                        <Bus className="h-4 w-4" />
                        Bus
                    </label>
                    <Select value={selectedBus} onValueChange={setSelectedBus}>
                         <SelectTrigger>
                             <SelectValue placeholder="All Buses" />
                         </SelectTrigger>
                         <SelectContent>
                             <SelectItem value="all">All Buses</SelectItem>
                             <SelectItem value="unassigned">Unassigned</SelectItem>
                             {buses.map(bus => (
                                 <SelectItem key={bus.id} value={bus.id}>{bus.busCode}</SelectItem>
                             ))}
                         </SelectContent>
                     </Select>
                </div>

                {/* Pickup Location Filter */}
                <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Pickup Location
                    </label>
                    <Select value={selectedPickupLocation} onValueChange={setSelectedPickupLocation}>
                         <SelectTrigger>
                             <SelectValue placeholder="All Locations" />
                         </SelectTrigger>
                         <SelectContent>
                             <SelectItem value="all">All Students</SelectItem>
                             <SelectItem value="set">Location Set</SelectItem>
                             <SelectItem value="not_set">Location Not Set</SelectItem>
                         </SelectContent>
                     </Select>
                </div>

                {/* Clear Filters Button */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-transparent">Clear</label>
                    <Button 
                         variant="outline" 
                         onClick={clearAllFilters}
                         className="w-full"
                         disabled={!searchTerm && (!selectedGrade || selectedGrade === "all") && (!selectedRoute || selectedRoute === "all") && (!selectedBus || selectedBus === "all") && (!selectedPickupLocation || selectedPickupLocation === "all")}
                     >
                         <X className="h-4 w-4 mr-2" />
                         Clear All
                     </Button>
                </div>
            </div>

            {/* Filter Summary */}
             {(searchTerm || (selectedGrade && selectedGrade !== "all") || (selectedRoute && selectedRoute !== "all") || (selectedBus && selectedBus !== "all") || (selectedPickupLocation && selectedPickupLocation !== "all")) && (
                 <div className="text-sm text-muted-foreground">
                     Showing {filteredStudents.length} of {students.length} students
                     {searchTerm && ` • Name: "${searchTerm}"`}
                     {selectedGrade && selectedGrade !== "all" && ` • Grade: ${selectedGrade}`}
                     {selectedRoute && selectedRoute !== "all" && ` • Route: ${selectedRoute === "unassigned" ? "Unassigned" : routes.find(r => r.id === selectedRoute)?.name || "Unknown"}`}
                     {selectedBus && selectedBus !== "all" && ` • Bus: ${selectedBus === "unassigned" ? "Unassigned" : buses.find(b => b.id === selectedBus)?.busCode || "Unknown"}`}
                     {selectedPickupLocation && selectedPickupLocation !== "all" && ` • Pickup: ${selectedPickupLocation === "set" ? "Location Set" : "Location Not Set"}`}
                 </div>
             )}
         </div>
        {/* Mobile-responsive table wrapper */}
        <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">Name</TableHead>
              <TableHead className="min-w-[80px]">Grade</TableHead>
              <TableHead className="min-w-[150px]">Assigned Route</TableHead>
              <TableHead className="min-w-[120px]">Assigned Bus</TableHead>
              <TableHead className="min-w-[180px]">Pickup Location</TableHead>
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
            ) : filteredStudents.length > 0 ? (
              filteredStudents.map((student) => (
                <TableRow key={student.id}>
                    <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                            <Avatar>
                                <AvatarImage src={student.photoUrlThumb || student.photoUrl} alt={student.name} />
                                <AvatarFallback>
                                    <GraduationCap className="h-5 w-5 text-muted-foreground" />
                                </AvatarFallback>
                            </Avatar>
                           <span>{student.name}</span>
                        </div>
                    </TableCell>
                    <TableCell>{student.grade || "N/A"}</TableCell>
                    <TableCell>{getRouteName(student)}</TableCell>
                    <TableCell>{getBusCode(student)}</TableCell>
                    <TableCell>{getPickupLocation(student)}</TableCell>
                    <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => generateQRCard(student)}
                                title="Print QR Card"
                            >
                                <Printer className="h-4 w-4" />
                            </Button>
                            <StudentDialog student={student} onComplete={onDataNeedsRefresh} routes={routes} buses={buses} schoolId={schoolId}>
                                <Button variant="ghost" size="icon">
                                    <Pencil className="h-4 w-4" />
                                </Button>
                            </StudentDialog>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" aria-label="Delete student">
                                       <Trash2 className="h-4 w-4" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                    <AlertDialogTitle>Delete this student?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This action cannot be undone. This will permanently delete student "{student.name}".
                                    </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(student.id, student.name)} className="bg-destructive hover:bg-destructive/90">
                                        Delete
                                    </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No students found. Add one to get started!
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

export default function StudentsPage() {
    const { profile, loading: profileLoading, error: profileError } = useProfile();
    const [routes, setRoutes] = useState<RouteInfo[]>([]);
    const [buses, setBuses] = useState<BusInfo[]>([]);
    const [key, setKey] = useState(0); 
    const [isLoading, setIsLoading] = useState(true);
    const schoolId = profile?.schoolId;

    const onDataNeedsRefresh = useCallback(() => setKey(k => k+1), []);

    useEffect(() => {
        const fetchData = async () => {
            if (!schoolId) return;
            setIsLoading(true);

            try {
                const [routesData, busesData] = await Promise.all([
                    listRoutesForSchool(schoolId),
                    listBusesForSchool(schoolId)
                ]);
                setRoutes(routesData as RouteInfo[]);
                setBuses(busesData as BusInfo[]);
            } catch(error) {
                console.error("Error fetching related data:", error);
            } finally {
                setIsLoading(false);
            }
        };
        if (schoolId) {
          fetchData();
        }
      }, [schoolId, key]);

    if (profileLoading || (isLoading && !profileError)) {
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
        return <Alert><AlertTitle>No Profile</AlertTitle><AlertDescription>User profile not found. Access denied.</AlertDescription></Alert>
    }

    return (
        <div className="grid gap-8">
            <StudentsList key={key} routes={routes} buses={buses} schoolId={profile.schoolId} onDataNeedsRefresh={onDataNeedsRefresh} />
        </div>
    );
}
