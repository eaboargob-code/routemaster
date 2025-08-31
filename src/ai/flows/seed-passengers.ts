
'use server';
/**
 * @fileOverview A flow for seeding the passenger list for a new trip.
 * This runs on the server with admin privileges to bypass client-side
 * security rule restrictions on reading the `students` collection.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK if not already done.
if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: process.env.GCLOUD_PROJECT,
    });
}
const db = admin.firestore();


const SeedPassengersInputSchema = z.object({
    tripId: z.string().describe("The ID of the trip to seed passengers for."),
});
export type SeedPassengersInput = z.infer<typeof SeedPassengersInputSchema>;

const SeedPassengersOutputSchema = z.object({
    success: z.boolean(),
    passengerCount: z.number(),
});
export type SeedPassengersOutput = z.infer<typeof SeedPassengersOutputSchema>;


export async function seedPassengers(input: SeedPassengersInput): Promise<SeedPassengersOutput> {
    return seedPassengersFlow(input);
}

const seedPassengersFlow = ai.defineFlow(
    {
        name: 'seedPassengersFlow',
        inputSchema: SeedPassengersInputSchema,
        outputSchema: SeedPassengersOutputSchema,
    },
    async ({ tripId }) => {
        const tripRef = db.collection('trips').doc(tripId);
        const tripSnap = await tripRef.get();

        if (!tripSnap.exists) {
            throw new Error(`Trip with ID ${tripId} not found.`);
        }

        const trip = tripSnap.data() as any;

        const studentsCol = db.collection("students");
        const batch = db.batch();
        const seen = new Set<string>();

        // Query by route
        if (trip.routeId) {
            const qByRoute = studentsCol
                .where("schoolId", "==", trip.schoolId)
                .where("assignedRouteId", "==", trip.routeId);
            const rSnap = await qByRoute.get();
            rSnap.forEach(doc => addStudentToBatch(doc));
        }

        // Query by bus
        if (trip.busId) {
            const qByBus = studentsCol
                .where("schoolId", "==", trip.schoolId)
                .where("assignedBusId", "==", trip.busId);
            const bSnap = await qByBus.get();
            bSnap.forEach(doc => addStudentToBatch(doc));
        }

        function addStudentToBatch(s: admin.firestore.QueryDocumentSnapshot<admin.firestore.DocumentData>) {
            if (seen.has(s.id)) return;
            seen.add(s.id);
            const pRef = tripRef.collection('passengers').doc(s.id);
            const data = s.data();
            batch.set(pRef, {
                studentId: s.id,
                name: data.name ?? "",
                schoolId: trip.schoolId,
                routeId: trip.routeId || null,
                busId: trip.busId,
                status: "pending",
                boardedAt: null,
                droppedAt: null,
                updatedBy: trip.driverId, // Attributed to the driver who started the trip
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        
        await batch.commit();

        return { success: true, passengerCount: seen.size };
    }
);
