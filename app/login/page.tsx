'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, setToken, setUser } from '@/lib/api';
import { Zap, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await login(email, password);
      setToken(data.access_token);
      setUser({ role: data.role, name: data.name, email });
      router.push(data.role === 'admin' ? '/admin' : '/trainer');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #F472B6)', boxShadow: '0 8px 32px rgba(139,92,246,0.4)' }}>
            <Zap size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">StayFitx</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>by Syam — Trainer Scheduling</p>
        </div>

        {/* Card */}
        <form onSubmit={handleLogin} className="glass rounded-2xl p-8 space-y-5">
          <div>
            <label className="label">Email Address</label>
            <input
              id="email"
              type="email"
              className="glass-input"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <div className="relative">
              <input
                id="password"
                type={showPw ? 'text' : 'password'}
                className="glass-input pr-10"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          {error && (
            <div className="rounded-xl p-3 text-sm text-red-300" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {error}
            </div>
          )}
          <button type="submit" className="btn-brand w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In →'}
          </button>
        </form>
        <p className="text-center text-xs mt-6" style={{ color: 'var(--muted)' }}>
          Accounts are created by Syam. Contact admin if you need access.
        </p>
      </div>
    </div>
  );
}
