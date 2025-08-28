"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  where,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type RouteDoc = {
  id: string;
  name: string;
  schoolId: string;
  active: boolean;
};

const SCHOOL_ID = "TRP001"; // TODO: swap to current admin's schoolId when profile plumbing exists

export default function RoutesPage() {
  const [routes, setRoutes] = useState<RouteDoc[]>([]);
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Live query: all routes for this school
  useEffect(() => {
    setLoading(true);
    setErr(null);
    try {
      const q = query(collection(db, "routes"), where("schoolId", "==", SCHOOL_ID));
      const unsub = onSnapshot(
        q,
        (snap) => {
          const rows: RouteDoc[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<RouteDoc, "id">),
          }));
          setRoutes(rows);
          setLoading(false);
        },
        (e) => {
          console.error("routes/onSnapshot error:", e);
          setErr(e.message ?? String(e));
          setLoading(false);
        }
      );
      return () => unsub();
    } catch (e: any) {
      console.error("routes/query init error:", e);
      setErr(e.message ?? String(e));
      setLoading(false);
    }
  }, []);

  async function addRoute() {
    if (!name.trim()) return alert("Please enter a route name.");
    setErr(null);
    try {
      await addDoc(collection(db, "routes"), {
        name: name.trim(),
        active,
        schoolId: SCHOOL_ID,
        createdAt: serverTimestamp(),
      });
      setName("");
      setActive(true);
    } catch (e: any) {
      console.error("addRoute error:", e);
      alert("Failed to add route: " + (e.message ?? String(e)));
    }
  }

  async function toggleActive(id: string, next: boolean) {
    try {
      await updateDoc(doc(db, "routes", id), { active: next });
    } catch (e: any) {
      console.error("toggleActive error:", e);
      alert("Failed to update: " + (e.message ?? String(e)));
    }
  }

  async function removeRoute(id: string) {
    if (!confirm("Delete this route?")) return;
    try {
      await deleteDoc(doc(db, "routes", id));
    } catch (e: any) {
      console.error("deleteRoute error:", e);
      alert("Failed to delete: " + (e.message ?? String(e)));
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 p-6">
      {/* List */}
      <section className="border rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-1">Route Management</h2>
        <p className="text-sm text-gray-500 mb-4">
          Listing routes for school <span className="font-mono">{SCHOOL_ID}</span>.
        </p>

        {loading ? (
          <div>Loading routes…</div>
        ) : err ? (
          <div className="text-red-600 text-sm">Error: {err}</div>
        ) : routes.length === 0 ? (
          <div className="text-gray-500">No routes found. Add one to get started!</div>
        ) : (
          <ul className="divide-y">
            {routes.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-gray-500">
                    active: {String(r.active)} · schoolId: {r.schoolId}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={r.active}
                      onChange={(e) => toggleActive(r.id, e.target.checked)}
                    />
                    Active
                  </label>
                  <button
                    onClick={() => removeRoute(r.id)}
                    className="text-red-600 text-sm hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Add form */}
      <section className="border rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-1">Add New Route</h2>
        <p className="text-sm text-gray-500 mb-4">Create a route for your school.</p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm mb-1">Route Name</label>
            <input
              className="w-full border rounded p-2"
              placeholder="e.g., Morning A"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Active
          </label>

          <button
            onClick={addRoute}
            className="w-full bg-black text-white py-2 rounded"
          >
            Add Route
          </button>
        </div>
      </section>
    </div>
  );
}
