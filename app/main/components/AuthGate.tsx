'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

const AUTH_REQUIRED = process.env.NEXT_PUBLIC_REQUIRE_AUTH === 'true';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(!AUTH_REQUIRED || pathname === '/login');

  useEffect(() => {
    if (!AUTH_REQUIRED || pathname === '/login') {
      setReady(true);
      return;
    }

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) setReady(true);
      else router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (!session) {
        setReady(false);
        router.replace('/login');
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [pathname, router]);

  if (!AUTH_REQUIRED || pathname === '/login') return children;
  if (!ready) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#586b84', fontFamily: 'Sarabun, sans-serif' }}>
        กำลังตรวจสอบสิทธิ์ผู้ใช้งาน...
      </main>
    );
  }

  return children;
}
