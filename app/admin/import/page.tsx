'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getToken } from '@/lib/api';
import { ArrowLeft, Upload, Loader2, CheckCircle2, X, ChevronRight } from 'lucide-react';

type ParsedSession = {
  client_name: string;
  days: string[];
  time: string;
  duration_minutes: number;
  location: string;
};

type ConfirmStatus = 'idle' | 'loading' | 'done' | 'error';

export default function ImportPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [trainerName, setTrainerName] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [base64, setBase64] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedSession[] | null>(null);
  const [rawResponse, setRawResponse] = useState('');
  const [confirmStatus, setConfirmStatus] = useState<ConfirmStatus>('idle');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setPreview(result);
      // Extract pure base64 (strip data:image/...;base64, prefix)
      setBase64(result.split(',')[1]);
    };
    reader.readAsDataURL(file);
    setParsed(null);
    setError('');
  }

  async function handleParse() {
    if (!base64 || !trainerName.trim()) return;
    setParsing(true);
    setError('');
    try {
      const token = getToken();
      const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';
      const res = await fetch(`${API}/api/gym/admin/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ image_base64: base64, trainer_name: trainerName }),
      });
      if (!res.ok) throw new Error('Failed to parse image');
      const data = await res.json();
      setParsed(data.parsed_sessions);
      setRawResponse(data.raw_response);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Parse error');
    } finally {
      setParsing(false);
    }
  }

  function removeSession(index: number) {
    setParsed(prev => prev?.filter((_, i) => i !== index) ?? null);
  }

  function updateSession(index: number, field: keyof ParsedSession, value: string | string[] | number) {
    setParsed(prev => prev?.map((s, i) => i === index ? { ...s, [field]: value } : s) ?? null);
  }

  async function handleConfirmImport() {
    if (!parsed?.length || !trainerName.trim()) return;
    setConfirmStatus('loading');

    // Step 1: Find trainer by name, or prompt to create
    // For now, we pass parsed data to the book sessions endpoint
    // Real flow: find trainer_id → create clients → create recurring_series
    // This is handled server-side via a dedicated confirm endpoint
    // Here we just show success for the prototype
    try {
      const token = getToken();
      const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';
      const res = await fetch(`${API}/api/gym/admin/import/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ trainer_name: trainerName, sessions: parsed }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ detail: 'Import failed' }));
        throw new Error(errBody.detail || 'Import failed');
      }
      setConfirmStatus('done');
      showToast(`✅ ${parsed.length} recurring sessions imported for ${trainerName}!`);
    } catch (e: unknown) {
      setConfirmStatus('error');
      setError(e instanceof Error ? e.message : 'Import failed');
    }
  }

  const DAY_ABBREVS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="min-h-screen pb-24">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl text-sm font-medium text-white shadow-xl"
          style={{ background: 'rgba(16,185,129,0.9)', backdropFilter: 'blur(12px)' }}>{toast}</div>
      )}

      {/* Navbar */}
      <nav className="glass sticky top-0 z-40 px-6 py-4 flex items-center gap-4 mb-8" style={{ borderRadius: '0 0 1rem 1rem' }}>
        <Link href="/admin" className="btn-ghost p-2 rounded-lg"><ArrowLeft size={18} /></Link>
        <div>
          <p className="text-white font-semibold text-sm leading-none">Schedule Import</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Parse WhatsApp screenshots with AI</p>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 space-y-6">

        {/* Step 1: Trainer Name */}
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#7C3AED,#A78BFA)' }}>1</div>
            <h2 className="text-white font-bold text-lg">Which Trainer?</h2>
          </div>
          <div>
            <label className="label">Trainer Name (must match an existing trainer account)</label>
            <input type="text" className="glass-input" placeholder="e.g. Mr. Shifas"
              value={trainerName} onChange={e => setTrainerName(e.target.value)} />
          </div>
        </div>

        {/* Step 2: Upload Screenshot */}
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#7C3AED,#A78BFA)' }}>2</div>
            <h2 className="text-white font-bold text-lg">Upload Schedule Screenshot</h2>
          </div>

          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

          {!preview ? (
            <button onClick={() => fileRef.current?.click()}
              className="w-full rounded-2xl border-2 border-dashed p-12 flex flex-col items-center gap-3 transition-colors hover:border-purple-500/50 group"
              style={{ borderColor: 'var(--border)' }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform"
                style={{ background: 'rgba(139,92,246,0.1)' }}>
                <Upload size={24} style={{ color: 'var(--brand-light)' }} />
              </div>
              <p className="text-white font-semibold">Upload WhatsApp Screenshot</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>PNG, JPG accepted</p>
            </button>
          ) : (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Schedule screenshot" className="w-full rounded-xl max-h-80 object-contain"
                style={{ background: 'rgba(0,0,0,0.3)' }} />
              <button onClick={() => { setPreview(null); setBase64(''); setParsed(null); if (fileRef.current) fileRef.current.value = ''; }}
                className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(0,0,0,0.7)' }}>
                <X size={14} className="text-white" />
              </button>
            </div>
          )}

          {preview && (
            <button className="btn-brand w-full mt-4 flex items-center justify-center gap-2"
              onClick={handleParse} disabled={parsing || !trainerName.trim()}>
              {parsing ? <><Loader2 size={16} className="animate-spin" /> Parsing with GPT-4o…</> : <>Parse Schedule <ChevronRight size={16} /></>}
            </button>
          )}
        </div>

        {/* Step 3: Review & Edit parsed results */}
        {parsed !== null && (
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#7C3AED,#A78BFA)' }}>3</div>
              <h2 className="text-white font-bold text-lg">Review & Confirm</h2>
            </div>
            <p className="text-sm mb-5 ml-11" style={{ color: 'var(--muted)' }}>
              GPT-4o extracted <strong className="text-white">{parsed.length} sessions</strong>. Edit anything that looks wrong before importing.
            </p>

            {parsed.length === 0 ? (
              <div className="rounded-xl p-6 text-center" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <p className="text-red-400 text-sm">No sessions could be extracted. Try a clearer screenshot.</p>
                <details className="mt-3 text-left">
                  <summary className="text-xs cursor-pointer" style={{ color: 'var(--muted)' }}>Show raw AI response</summary>
                  <pre className="text-xs mt-2 text-slate-400 whitespace-pre-wrap break-all">{rawResponse}</pre>
                </details>
              </div>
            ) : (
              <div className="space-y-3">
                {parsed.map((s, i) => (
                  <div key={i} className="rounded-xl p-4 relative group" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)' }}>
                    <button onClick={() => removeSession(i)}
                      className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20">
                      <X size={12} className="text-red-400" />
                    </button>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label">Client Name</label>
                        <input type="text" className="glass-input text-sm" value={s.client_name}
                          onChange={e => updateSession(i, 'client_name', e.target.value)} />
                      </div>
                      <div>
                        <label className="label">Time</label>
                        <input type="time" className="glass-input text-sm" value={s.time}
                          onChange={e => updateSession(i, 'time', e.target.value)} />
                      </div>
                      <div>
                        <label className="label">Duration (mins)</label>
                        <input type="number" className="glass-input text-sm" value={s.duration_minutes}
                          onChange={e => updateSession(i, 'duration_minutes', parseInt(e.target.value))} />
                      </div>
                      <div>
                        <label className="label">Location</label>
                        <input type="text" className="glass-input text-sm" value={s.location}
                          onChange={e => updateSession(i, 'location', e.target.value)} />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="label">Days</label>
                      <div className="flex gap-2 flex-wrap">
                        {DAY_ABBREVS.map((day, di) => {
                          const selected = s.days.some(d => d.toLowerCase().startsWith(day.toLowerCase()));
                          return (
                            <button key={di} type="button"
                              onClick={() => {
                                const fullDay = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][di];
                                const newDays = selected ? s.days.filter(d => !d.toLowerCase().startsWith(day.toLowerCase())) : [...s.days, fullDay];
                                updateSession(i, 'days', newDays);
                              }}
                              className="px-3 py-1 rounded-full text-xs font-bold transition-all"
                              style={selected
                                ? { background: 'var(--brand)', color: 'white', boxShadow: '0 0 10px rgba(139,92,246,0.4)' }
                                : { background: 'rgba(255,255,255,0.05)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                              {day}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {parsed.length > 0 && (
              <button className="btn-brand w-full mt-6 flex items-center justify-center gap-2"
                onClick={handleConfirmImport} disabled={confirmStatus === 'loading'}>
                {confirmStatus === 'loading'
                  ? <><Loader2 size={16} className="animate-spin" /> Importing…</>
                  : confirmStatus === 'done'
                  ? <><CheckCircle2 size={16} /> Imported Successfully!</>
                  : `Import ${parsed.length} Sessions for ${trainerName}`}
              </button>
            )}

            {confirmStatus === 'done' && (
              <div className="mt-4 rounded-xl p-4 flex items-center gap-3" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <CheckCircle2 size={20} className="text-green-400 flex-shrink-0" />
                <div>
                  <p className="text-green-400 font-semibold text-sm">Import complete!</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>All sessions have been created as recurring series.</p>
                </div>
                <Link href="/admin" className="ml-auto btn-ghost py-1.5 px-3 text-xs flex-shrink-0">View Schedule</Link>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-xl p-4 text-sm text-red-300" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        {/* How it works */}
        <div className="glass rounded-2xl p-6">
          <h3 className="text-white font-bold mb-4 text-sm">How This Works</h3>
          <div className="space-y-3">
            {[
              { step: 'Upload', desc: 'Take a screenshot of the WhatsApp schedule message from the trainer.' },
              { step: 'AI Parse', desc: 'GPT-4o reads the image and extracts client names, session times, and recurring days.' },
              { step: 'Review', desc: 'You can edit or remove any sessions before confirming the import.' },
              { step: 'Import', desc: 'Sessions are created as recurring series in the database. Done!' },
            ].map(({ step, desc }) => (
              <div key={step} className="flex gap-3">
                <span className="badge badge-brand flex-shrink-0 self-start mt-0.5">{step}</span>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
