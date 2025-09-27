'use client';

import { useProfile } from '@/lib/useProfile';

export default function TestPage() {
  const { user, profile, loading, error } = useProfile();

  console.log('TestPage: Auth state', { user: !!user, loading, error: error?.message });

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  if (!user) {
    return <div>No user found</div>;
  }

  return (
    <div>
      <h1>Test Page</h1>
      <p>User ID: {user.uid}</p>
      <p>Email: {user.email}</p>
      <p>Profile: {profile ? 'Loaded' : 'Not loaded'}</p>
    </div>
  );
}