"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";
import { setPersistence, browserLocalPersistence, signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function ParentLoginPage() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(auth, email, pw);
      router.replace("/parent"); // let the parent layout/guard handle role check
    } catch (e: any) {
      setErr(e?.message ?? "Failed to sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm p-6">
      <h1 className="mb-4 text-xl font-semibold">Parent Login</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          className="w-full rounded border p-2"
          type="email" placeholder="Email"
          value={email} onChange={e => setEmail(e.target.value)}
        />
        <input
          className="w-full rounded border p-2"
          type="password" placeholder="Password"
          value={pw} onChange={e => setPw(e.target.value)}
        />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="w-full rounded bg-teal-600 p-2 text-white disabled:opacity-50" disabled={busy}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}