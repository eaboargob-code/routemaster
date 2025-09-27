import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK
if (getApps().length === 0) {
  console.log('Initializing Firebase Admin SDK...');
  console.log('Environment variables check:', {
    hasProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
    hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
    hasStorageBucket: !!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
  
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
    console.log('Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('Firebase Admin SDK initialization failed:', error);
    throw error;
  }
}

export const adminStorage = getStorage();
export const adminDb = getFirestore();