

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
} from "firebase/firestore";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { useProfile } from "@/lib/useProfile";
import { listStudentsForSchool, listRoutesForSchool, listBusesForSchool } from "@/lib/firestoreQueries";
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
import { PlusCircle, Trash2, Pencil, Search, Route, Bus, GraduationCap, Upload, Camera, X, MapPin } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/firebase";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";

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


function CameraCaptureDialog({ onCapture, onClose }: { onCapture: (blob: Blob) => void, onClose: () => void }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        let stream: MediaStream | null = null;
        const getCameraPermission = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
                setHasPermission(true);
            } catch (error) {
                console.error("Camera access denied:", error);
                setHasPermission(false);
                toast({
                    variant: 'destructive',
                    title: 'Camera Access Denied',
                    description: 'Please enable camera permissions to use this feature.',
                });
            }
        };
        getCameraPermission();
        return () => {
            stream?.getTracks().forEach(track => track.stop());
        };
    }, [toast]);

    const handleCanPlay = () => {
        videoRef.current?.play();
    };

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
                <video ref={videoRef} className="w-full aspect-video rounded-md bg-muted" muted playsInline onCanPlay={handleCanPlay} />
                {hasPermission === false && (
                     <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-md">
                        <p className="text-white text-center p-4">Camera access is required. Please enable it in your browser settings.</p>
                    </div>
                )}
            </div>
            <DialogFooter>
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
                <Button onClick={handleCapture} disabled={!hasPermission}>
                    <Camera className="mr-2" /> Capture
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
        setUploading(true);
        setProgress(0);
        try {
            const imageBlob = file instanceof File ? await processImage(file) : file;
            const storage = getStorage();
            const storageRef = ref(storage, `schools/${schoolId}/students/${studentId}/profile.jpg`);
            const uploadTask = uploadBytesResumable(storageRef, imageBlob, { contentType: 'image/jpeg' });

            uploadTask.on('state_changed',
                (snapshot) => {
                    const prog = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    setProgress(prog);
                },
                (error) => {
                    console.error("Upload failed:", error);
                    toast({ variant: "destructive", title: "Upload Failed", description: error.message });
                    setUploading(false);
                },
                () => {
                    getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
                        onUrlChange(downloadURL);
                        toast({ title: "Photo Updated!" });
                        setUploading(false);
                    });
                }
            );
        } catch (error) {
            console.error("Image processing failed:", error);
            toast({ variant: "destructive", title: "Image Processing Failed", description: (error as Error).message });
            setUploading(false);
        }
    };
    
    const handleRemove = async () => {
        if (!currentPhotoUrl) return;
        const storage = getStorage();
        const photoRef = ref(storage, `schools/${schoolId}/students/${studentId}/profile.jpg`);
        try {
            await deleteObject(photoRef);
        } catch (error: any) {
            // Ignore "object-not-found" error if the file doesn't exist.
            if (error.code !== 'storage/object-not-found') {
                 console.error("Failed to delete photo from Storage", error);
                 toast({ variant: "destructive", title: "Deletion Failed", description: "Could not remove the old photo from storage." });
                 return; // Stop if we can't delete the file.
            }
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
    const isEditMode = !!student;

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

            // For new students, we need to create the doc first to get an ID for photo uploads.
            // But we can't upload photos for a new student yet, so we'll just create the doc with text data.
            if (isNewStudent) {
                 const newStudentRef = await addDoc(scol(schoolId, "students"), { 
                     name: data.name, 
                     schoolId,
                     createdAt: new Date(),
                 });
                 studentId = newStudentRef.id;
                 toast({ title: "Student Created!", description: "You can now edit the student to add a photo."});
            }
            if (!studentId) throw new Error("Could not determine student ID.");

            const studentData: any = {
                name: data.name,
                grade: data.grade || deleteField(),
                photoUrl: data.photoUrl || deleteField(),
                pickupLat: data.pickupLat ?? deleteField(),
                pickupLng: data.pickupLng ?? deleteField(),
                photoUpdatedAt: data.photoUrl ? new Date() : deleteField(),
            };

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
        const headers = "studentId,grade,photoUrl,pickupLat,pickupLng";
        const content = "student001,5,https://example.com/photo.jpg,32.88,13.18\nstudent002,3,,,\n";
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
                    if (row.pickupLat !== undefined) updateData.pickupLat = row.pickupLat;
                    if (row.pickupLng !== undefined) updateData.pickupLng = row.pickupLng;
                    
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
  
  const filteredStudents = useMemo(() => {
      const search = searchTerm.trim().toLowerCase();
      if (!search) return students;
      return students.filter(student =>
        (student.name?.toLowerCase?.() ?? "").includes(search)
      );
  }, [students, searchTerm]);
  
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
         <div className="relative w-full mb-4">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
                placeholder="Search by Name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
            />
         </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Assigned Route</TableHead>
              <TableHead>Assigned Bus</TableHead>
              <TableHead>Pickup Location</TableHead>
              <TableHead className="text-right">Actions</TableHead>
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
                                <AvatarImage src={student.photoUrl} alt={student.name} />
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
      </CardContent>
    </Card>
  );
}

export default function StudentsPage() {
    const { profile, loading: profileLoading, error: profileError } = useProfile();
    const [routes, setRoutes] = useState<RouteInfo[]>([]);
    const [buses, setBuses] = useState<BusInfo[]>([]);
    const [key, setKey] = useState(0); 
    const schoolId = profile?.schoolId;

    const onDataNeedsRefresh = useCallback(() => setKey(k => k+1), []);

    useEffect(() => {
        const fetchData = async () => {
            if (!schoolId) return;
            try {
                const routesData = await listRoutesForSchool(schoolId);
                setRoutes(routesData as RouteInfo[]);
            } catch (error) {
              console.error("Error fetching routes:", error);
            }
            try {
                const busesData = await listBusesForSchool(schoolId);
                setBuses(busesData as BusInfo[]);
            } catch (error) {
              console.error("Error fetching buses:", error);
            }
        };
        if (schoolId) {
            fetchData();
        }
      }, [schoolId, key]);

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
            <StudentsList key={key} routes={routes} buses={buses} schoolId={profile.schoolId} onDataNeedsRefresh={onDataNeedsRefresh} />
        </div>
    );
}

