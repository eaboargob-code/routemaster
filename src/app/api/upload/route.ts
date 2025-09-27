import { NextRequest, NextResponse } from 'next/server';
import { adminStorage } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  console.log('API: Upload request received');
  
  // Debug environment variables
  console.log('API: Environment check', {
    hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
    hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
    hasProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    hasStorageBucket: !!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL?.substring(0, 20) + '...',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  });
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const schoolId = formData.get('schoolId') as string;
    const studentId = formData.get('studentId') as string;

    console.log('API: Parsed form data', { 
      fileSize: file?.size, 
      fileName: file?.name, 
      schoolId, 
      studentId 
    });

    if (!file || !schoolId || !studentId) {
      console.log('API: Missing required fields');
      return NextResponse.json(
        { error: 'Missing required fields: file, schoolId, or studentId' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    console.log('API: Converting file to buffer');
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload to Firebase Storage using Admin SDK
    console.log('API: Uploading to Firebase Storage using Admin SDK');
    const bucket = adminStorage.bucket();
    const fileName = `schools/${schoolId}/students/${studentId}/profile.jpg`;
    const storageFile = bucket.file(fileName);

    // Upload the buffer
    await storageFile.save(buffer, {
      metadata: {
        contentType: 'image/jpeg',
      },
    });

    // Make the file publicly readable
    await storageFile.makePublic();

    // Get download URL
    console.log('API: Getting download URL');
    const downloadURL = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    console.log('API: Upload successful', { downloadURL });
    return NextResponse.json({ 
      success: true, 
      downloadURL 
    });

  } catch (error) {
    console.error('API: Upload error:', error);
    return NextResponse.json(
      { error: 'Upload failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}