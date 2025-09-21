
'use server';
/**
 * @fileOverview A flow for deleting all trips for a school.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import * as admin from 'firebase-admin';

const DeleteTripsInputSchema = z.object({
  schoolId: z.string().describe('The ID of the school to delete trips from.'),
  confirmation: z.string().refine((s) => s === 'DELETE', {
    message: "Confirmation must be 'DELETE'",
  }),
});
export type DeleteTripsInput = z.infer<typeof DeleteTripsInputSchema>;

const DeleteTripsOutputSchema = z.object({
  success: z.boolean(),
  deletedCount: z.number(),
  message: z.string(),
});
export type DeleteTripsOutput = z.infer<typeof DeleteTripsOutputSchema>;


// Ensure Firebase Admin is initialized
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();


async function deleteTrips(input: DeleteTripsInput): Promise<DeleteTripsOutput> {
  return deleteTripsFlow(input);
}


const deleteTripsFlow = ai.defineFlow(
  {
    name: 'deleteTripsFlow',
    inputSchema: DeleteTripsInputSchema,
    outputSchema: DeleteTripsOutputSchema,
  },
  async (input) => {
    const { schoolId } = input;
    
    const tripsRef = db.collection(`schools/${schoolId}/trips`);
    const snapshot = await tripsRef.get();

    if (snapshot.empty) {
        return { success: true, deletedCount: 0, message: "No trips found to delete." };
    }

    const bulkWriter = db.bulkWriter();
    let deletedCount = 0;
    
    snapshot.docs.forEach(doc => {
        db.recursiveDelete(doc.ref, bulkWriter);
        deletedCount++;
    });

    await bulkWriter.close();
    
    return {
      success: true,
      deletedCount: deletedCount,
      message: `Successfully deleted ${deletedCount} trips and their subcollections.`,
    };
  }
);

export { deleteTrips };
