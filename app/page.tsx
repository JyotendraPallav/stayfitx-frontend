'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { getUser } from '@/lib/api';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const user = getUser();
    if (!user) { router.push('/login'); return; }
    router.push(user.role === 'admin' ? '/admin' : '/trainer');
  }, [router]);
  return null;
}
