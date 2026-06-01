'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getToken, adminGetTrainers } from '@/lib/api';
import { ArrowLeft, Upload, Loader2, CheckCircle2, X, ChevronRight, ChevronDown } from 'lucide-react';

type ParsedSession = {
  client_name: string;
  days: string[];
  time: string;
  duration_minutes: number;
  location: string;
};

type ConfirmStatus = 'idle' | 'loading' | 'done' | 'error';
type TrainerOption = { id: string; name: string };

export default function ImportPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [trainers, setTrainers] = useState<TrainerOption[]>([]);
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

  // Load trainer list on mount for dropdown
  useEffect(() => {
    adminGetTrainers()
      .then(data => setTrainers(data.trainers || []))
      .catch(() => {});
  }, []);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setPreview(result);
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
      <nav className="glass sticky top-0 z-40 px-4 py-3 flex items-center gap-3 mb-6" style={{ borderRadius: '0 0 1rem 1rem' }}>
        <Link href="/admin" className="btn-ghost p-2 rounded-lg"><ArrowLeft size={18} /></Link>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpg" alt="StayFit-XbyShyam" className="w-8 h-8 rounded-full object-cover" />
        <div>
          <p className="text-white font-semibold text-sm leading-none">Schedule Import</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Parse WhatsApp screenshots</p>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 space-y-5">

        {/* Step 1: Trainer Dropdown */}
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#7C3AED,#A78BFA)' }}>1</div>
            <h2 className="text-white font-bold text-lg">Which Trainer?</h2>
          </div>
          <div>
            <label className="label">Select Trainer</label>
            <div className="relative">
              <select
                className="glass-input appearance-none pr-10"
                value={trainerName}
                onChange={e => setTrainerName(e.target.value)}>
                <option value="">— Select a registered trainer —</option>
                {trainers.map(t => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
              <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
            </div>
            {trainers.length === 0 && (
              <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
                No trainers found. <Link href="/admin" className="underline" style={{ color: 'var(--brand-light)' }}>Go back and add a trainer first.</Link>
              </p>
            )}
          </div>
        </div>

        {/* Step 2: Upload Screenshot */}
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#7C3AED,#A78BFA)' }}>2</div>
            <h2 className="text-white font-bold text-lg">Upload Schedule Screenshot</h2>
          </div>

          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />

          {!preview ? (
            <button onClick={() => fileRef.current?.click()}
              className="w-full rounded-2xl border-2 border-dashed p-10 flex flex-col items-center gap-3 transition-colors hover:border-purple-500/50 group"
              style={{ borderColor: 'var(--border)' }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform"
                style={{ background: 'rgba(139,92,246,0.1)' }}>
                <Upload size={24} style={{ color: 'var(--brand-light)' }} />
              </div>
              <p className="text-white font-semibold">Tap to upload or take photo</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>WhatsApp schedule screenshot — PNG, JPG</p>
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
              {parsing
                ? <><Loader2 size={16} className="animate-spin" /> Analysing schedule…</>
                : <>Analyse Schedule <ChevronRight size={16} /></>}
            </button>
          )}
          {preview && !trainerName.trim() && (
            <p className="text-xs text-center mt-2 text-amber-400">Select a trainer above before analysing.</p>
          )}
        </div>

        {/* Step 3: Review & Edit */}
        {parsed !== null && (
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#7C3AED,#A78BFA)' }}>3</div>
              <h2 className="text-white font-bold text-lg">Review & Confirm</h2>
            </div>
            <p className="text-sm mb-5 ml-11" style={{ color: 'var(--muted)' }}>
              App extracted <strong className="text-white">{parsed.length} sessions</strong>. Edit anything that looks wrong before importing.
            </p>

            {parsed.length === 0 ? (
              <div className="rounded-xl p-6 text-center" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <p className="text-red-400 text-sm">No sessions could be extracted. Try a clearer screenshot.</p>
                <details className="mt-3 text-left">
                  <summary className="text-xs cursor-pointer" style={{ color: 'var(--muted)' }}>Show raw response</summary>
                  <pre className="text-xs mt-2 text-slate-400 whitespace-pre-wrap break-all">{rawResponse}</pre>
                </details>
              </div>
            ) : (
              <div className="space-y-3">
                {parsed.map((s, i) => (
                  <div key={i} className="rounded-xl p-4 relative" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)' }}>
                    <button onClick={() => removeSession(i)}
                      className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-500/20">
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
                                const newDays = selected
                                  ? s.days.filter(d => !d.toLowerCase().startsWith(day.toLowerCase()))
                                  : [...s.days, fullDay];
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
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>All sessions created as recurring series.</p>
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
              { step: 'Select', desc: 'Choose the trainer whose schedule you are importing from the dropdown.' },
              { step: 'Upload', desc: 'Take a photo or upload a screenshot of the WhatsApp schedule message.' },
              { step: 'Analyse', desc: 'The app reads the image and extracts client names, session times, and recurring days automatically.' },
              { step: 'Review', desc: 'Edit or remove any sessions before confirming.' },
              { step: 'Import', desc: 'Sessions are created as recurring series for the next 90 days. Done!' },
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
