'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase';

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="login-page" style={{ minHeight: '100vh' }} />}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace(searchParams.get('next') || '/main');
    });
  }, [router, searchParams]);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) {
      setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      setLoading(false);
      return;
    }
    router.replace(searchParams.get('next') || '/main');
    router.refresh();
  };

  return (
    <main className="login-page">
      <style>{`
        .login-page { min-height:100vh; display:grid; place-items:center; padding:24px; background:linear-gradient(145deg,#071d3a,#0e3060 55%,#1e6bbf); font-family:'Sarabun',sans-serif; }
        .login-card { width:min(100%,390px); padding:30px; border-radius:18px; background:#fff; box-shadow:0 24px 70px rgba(2,16,36,.35); }
        .login-emblem { width:48px; height:48px; display:grid; place-items:center; border-radius:50%; margin-bottom:16px; background:linear-gradient(135deg,#c8972a,#e2b84a); color:#0e3060; font-weight:900; font-size:22px; }
        .login-title { margin:0; color:#0e3060; font-size:24px; }
        .login-sub { margin:4px 0 22px; color:#718096; font-size:13px; }
        .login-label { display:block; margin:12px 0 6px; color:#334e68; font-size:12px; font-weight:800; }
        .login-input { width:100%; box-sizing:border-box; padding:11px 12px; border:1.5px solid #d9e2ec; border-radius:9px; font:14px inherit; outline:none; }
        .login-input:focus { border-color:#1e6bbf; box-shadow:0 0 0 3px #deeafa; }
        .login-error { margin-top:12px; padding:9px 11px; border-radius:8px; background:#fef2f2; color:#b42318; font-size:12px; }
        .login-button { width:100%; margin-top:18px; padding:11px; border:0; border-radius:9px; background:linear-gradient(135deg,#0e3060,#1e6bbf); color:#fff; font:800 14px inherit; cursor:pointer; }
        .login-button:disabled { opacity:.65; cursor:wait; }
      `}</style>
      <form className="login-card" onSubmit={signIn}>
        <div className="login-emblem">W</div>
        <h1 className="login-title">เข้าสู่ระบบ WarehouseOS</h1>
        <p className="login-sub">สำหรับพนักงานสำเพ็งบุรีรัมย์</p>
        <label className="login-label" htmlFor="login-email">อีเมลพนักงาน</label>
        <input id="login-email" className="login-input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        <label className="login-label" htmlFor="login-password">รหัสผ่าน</label>
        <input id="login-password" className="login-input" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        {error && <div className="login-error" role="alert">{error}</div>}
        <button className="login-button" type="submit" disabled={loading}>{loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}</button>
      </form>
    </main>
  );
}
