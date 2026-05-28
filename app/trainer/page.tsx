'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, clearToken, trainerGetSchedule, trainerGetClients, trainerBookSession, trainerCancelSession, trainerRescheduleSession, trainerAddClient } from '@/lib/api';
import { format, addDays, subDays } from 'date-fns';
import { LogOut, ChevronLeft, ChevronRight, Plus, X, RefreshCw, MapPin, Clock, Repeat } from 'lucide-react';

type Client = { id: string; name: string };
type Session = {
  id: string; start_datetime: string; end_datetime: string;
  client_name: string; location: string; status: string;
  cancel_reason?: string; reschedule_reason?: string; series_id?: string;
};

type ModalState =
  | { type: 'none' }
  | { type: 'book' }
  | { type: 'cancel'; session: Session }
  | { type: 'reschedule'; session: Session }
  | { type: 'addClient' };

const DAY_NAMES = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const FREQ_OPTIONS = ['weekly', 'biweekly', 'monthly'];

export default function TrainerPage() {
  const router = useRouter();
  const user = getUser();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');

  // Book form state
  const [bookClientId, setBookClientId] = useState('');
  const [bookStart, setBookStart] = useState('08:00');
  const [bookEnd, setBookEnd] = useState('09:00');
  const [bookLocation, setBookLocation] = useState('');
  const [bookRecurring, setBookRecurring] = useState(false);
  const [bookDays, setBookDays] = useState<number[]>([]);
  const [bookFreq, setBookFreq] = useState('weekly');
  const [bookEndDate, setBookEndDate] = useState('');

  // Cancel/Reschedule form state
  const [reason, setReason] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');

  // Add client
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const fetchData = useCallback(async () => {
    const d = format(currentDate, 'yyyy-MM-dd');
    const [sc, cl] = await Promise.all([trainerGetSchedule(d), trainerGetClients()]);
    setSessions(sc.sessions);
    setClients(cl.clients);
  }, [currentDate]);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    if (user.role === 'admin') { router.push('/admin'); return; }
    fetchData();
  }, [user, router, fetchData]);

  function toggleDay(i: number) {
    setBookDays(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i]);
  }

  async function handleBook() {
    if (!bookClientId) return;
    setLoading(true);
    try {
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      await trainerBookSession({
        client_id: bookClientId,
        start_datetime: `${dateStr}T${bookStart}:00`,
        end_datetime: `${dateStr}T${bookEnd}:00`,
        location: bookLocation || null,
        is_recurring: bookRecurring,
        recur_days: bookRecurring ? bookDays : null,
        recur_frequency: bookFreq,
        recur_end_date: bookEndDate || null,
      });
      showToast('Session booked!');
      setModal({ type: 'none' });
      fetchData();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Error');
    } finally { setLoading(false); }
  }

  async function handleCancel() {
    if (modal.type !== 'cancel' || !reason.trim()) return;
    setLoading(true);
    try {
      await trainerCancelSession(modal.session.id, reason);
      showToast('Session cancelled');
      setModal({ type: 'none' });
      setReason('');
      fetchData();
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Error'); }
    finally { setLoading(false); }
  }

  async function handleReschedule() {
    if (modal.type !== 'reschedule' || !reason.trim() || !newStart || !newEnd) return;
    setLoading(true);
    try {
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      await trainerRescheduleSession(modal.session.id, {
        new_start_datetime: `${dateStr}T${newStart}:00`,
        new_end_datetime: `${dateStr}T${newEnd}:00`,
        reason,
      });
      showToast('Session rescheduled');
      setModal({ type: 'none' });
      setReason(''); setNewStart(''); setNewEnd('');
      fetchData();
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Error'); }
    finally { setLoading(false); }
  }

  async function handleAddClient() {
    if (!newClientName.trim()) return;
    setLoading(true);
    try {
      await trainerAddClient({ name: newClientName, phone: newClientPhone || null });
      showToast('Client added!');
      setModal({ type: 'none' });
      setNewClientName(''); setNewClientPhone('');
      fetchData();
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Error'); }
    finally { setLoading(false); }
  }

  const statusColor = (s: string) => s === 'scheduled' ? 'badge-green' : s === 'cancelled' ? 'badge-red' : 'badge-amber';

  return (
    <div className="min-h-screen pb-24">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl text-sm font-medium text-white shadow-xl"
          style={{ background: 'rgba(139,92,246,0.9)', backdropFilter: 'blur(12px)' }}>
          {toast}
        </div>
      )}

      {/* Navbar */}
      <nav className="glass sticky top-0 z-40 px-6 py-4 flex justify-between items-center mb-6" style={{ borderRadius: '0 0 1rem 1rem' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
            style={{ background: 'linear-gradient(135deg,#7C3AED,#F472B6)' }}>SF</div>
          <div>
            <p className="text-white font-semibold text-sm leading-none">{user?.name}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Trainer Portal</p>
          </div>
        </div>
        <button onClick={() => { clearToken(); router.push('/login'); }} className="btn-ghost py-2 px-3 flex items-center gap-1.5 text-xs">
          <LogOut size={14} /> Sign out
        </button>
      </nav>

      <div className="max-w-md mx-auto px-4 space-y-6">
        {/* Date nav */}
        <div className="flex items-center justify-between">
          <button onClick={() => setCurrentDate(d => subDays(d, 1))} className="btn-ghost p-2 rounded-lg"><ChevronLeft size={18} /></button>
          <div className="text-center">
            <p className="text-white font-bold text-lg">{format(currentDate, 'EEEE')}</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>{format(currentDate, 'dd MMM yyyy')}</p>
          </div>
          <button onClick={() => setCurrentDate(d => addDays(d, 1))} className="btn-ghost p-2 rounded-lg"><ChevronRight size={18} /></button>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button className="btn-brand flex items-center justify-center gap-2" onClick={() => setModal({ type: 'book' })}>
            <Plus size={16} /> Book Session
          </button>
          <button className="btn-ghost flex items-center justify-center gap-2" onClick={() => setModal({ type: 'addClient' })}>
            <Plus size={16} /> Add Client
          </button>
        </div>

        {/* Sessions */}
        <div>
          <p className="label mb-3">Today's Sessions ({sessions.filter(s => s.status !== 'cancelled').length})</p>
          {sessions.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center">
              <p className="text-2xl mb-2">🗓️</p>
              <p style={{ color: 'var(--muted)' }} className="text-sm">No sessions today. Use "Book Session" to add one.</p>
            </div>
          ) : sessions.map(s => (
            <div key={s.id} className="glass rounded-2xl p-5 mb-3 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
                style={{ background: s.status === 'scheduled' ? '#10B981' : s.status === 'cancelled' ? '#EF4444' : '#F59E0B' }} />
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-white font-bold">{s.client_name}</p>
                    <span className={`badge ${statusColor(s.status)}`}>{s.status}</span>
                    {s.series_id && <span className="badge badge-brand"><Repeat size={8} className="inline mr-0.5" />Recurring</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--muted)' }}>
                    <span className="flex items-center gap-1"><Clock size={12} />
                      {format(new Date(s.start_datetime), 'h:mm a')} – {format(new Date(s.end_datetime), 'h:mm a')}
                    </span>
                    {s.location && <span className="flex items-center gap-1"><MapPin size={12} />{s.location}</span>}
                  </div>
                  {s.cancel_reason && <p className="text-xs mt-1.5 text-red-400">Cancelled: {s.cancel_reason}</p>}
                  {s.reschedule_reason && <p className="text-xs mt-1.5 text-amber-400">Rescheduled: {s.reschedule_reason}</p>}
                </div>
                {s.status === 'scheduled' && (
                  <div className="flex gap-2 ml-3 flex-shrink-0">
                    <button onClick={() => { setModal({ type: 'reschedule', session: s }); }}
                      className="p-2 rounded-lg hover:bg-white/10 transition-colors" title="Reschedule">
                      <RefreshCw size={14} className="text-amber-400" />
                    </button>
                    <button onClick={() => setModal({ type: 'cancel', session: s })}
                      className="p-2 rounded-lg hover:bg-white/10 transition-colors" title="Cancel">
                      <X size={14} className="text-red-400" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────── */}
      {modal.type !== 'none' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="glass rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 space-y-5">

            {/* BOOK */}
            {modal.type === 'book' && <>
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-white">Book Session</h2>
                <button onClick={() => setModal({ type: 'none' })} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"><X size={18} /></button>
              </div>
              <div>
                <label className="label">Client</label>
                <select className="glass-input" value={bookClientId} onChange={e => setBookClientId(e.target.value)}>
                  <option value="">Select client…</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Start</label><input type="time" className="glass-input" value={bookStart} onChange={e => setBookStart(e.target.value)} /></div>
                <div><label className="label">End</label><input type="time" className="glass-input" value={bookEnd} onChange={e => setBookEnd(e.target.value)} /></div>
              </div>
              <div><label className="label">Location</label><input type="text" className="glass-input" placeholder="Area / Client Home" value={bookLocation} onChange={e => setBookLocation(e.target.value)} /></div>
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <span className="label mb-0">Recurring Session</span>
                  <div className="relative ml-auto">
                    <input type="checkbox" className="sr-only peer" checked={bookRecurring} onChange={e => setBookRecurring(e.target.checked)} />
                    <div className="w-10 h-5 rounded-full transition-colors peer-checked:bg-purple-600 bg-white/10 border border-white/10"></div>
                    <div className="absolute left-1 top-1 w-3 h-3 rounded-full bg-slate-400 peer-checked:translate-x-5 peer-checked:bg-white transition-transform"></div>
                  </div>
                </label>
                {bookRecurring && (
                  <div className="mt-4 space-y-4 p-4 rounded-xl" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)' }}>
                    <div>
                      <label className="label">Frequency</label>
                      <div className="flex gap-2">
                        {FREQ_OPTIONS.map(f => (
                          <button key={f} type="button" onClick={() => setBookFreq(f)}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all capitalize ${bookFreq === f ? 'btn-brand' : 'btn-ghost'}`}>{f}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="label">Repeat On</label>
                      <div className="flex gap-2">
                        {DAY_NAMES.map((d, i) => (
                          <button key={i} type="button" onClick={() => toggleDay(i)}
                            className={`w-9 h-9 rounded-full text-xs font-bold transition-all ${bookDays.includes(i) ? 'text-white' : 'btn-ghost'}`}
                            style={bookDays.includes(i) ? { background: 'var(--brand)', boxShadow: '0 0 12px rgba(139,92,246,0.5)' } : {}}>
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="label">End Date (optional)</label>
                      <input type="date" className="glass-input" value={bookEndDate} onChange={e => setBookEndDate(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
              <button className="btn-brand w-full" onClick={handleBook} disabled={loading || !bookClientId}>
                {loading ? 'Saving…' : 'Confirm Booking'}
              </button>
            </>}

            {/* CANCEL */}
            {modal.type === 'cancel' && <>
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-white">Cancel Session</h2>
                <button onClick={() => setModal({ type: 'none' })} className="p-1.5 rounded-lg hover:bg-white/10"><X size={18} /></button>
              </div>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                Cancelling <strong className="text-white">{modal.session.client_name}</strong> at {format(new Date(modal.session.start_datetime), 'h:mm a')}
              </p>
              <div>
                <label className="label">Reason (required)</label>
                <textarea className="glass-input" rows={3} placeholder="e.g. Client unwell, requested cancellation" value={reason} onChange={e => setReason(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button className="btn-ghost" onClick={() => { setModal({ type: 'none' }); setReason(''); }}>Back</button>
                <button className="btn-brand" style={{ background: 'linear-gradient(135deg,#DC2626,#EF4444)' }}
                  onClick={handleCancel} disabled={loading || !reason.trim()}>
                  {loading ? 'Cancelling…' : 'Cancel Session'}
                </button>
              </div>
            </>}

            {/* RESCHEDULE */}
            {modal.type === 'reschedule' && <>
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-white">Reschedule Session</h2>
                <button onClick={() => setModal({ type: 'none' })} className="p-1.5 rounded-lg hover:bg-white/10"><X size={18} /></button>
              </div>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                Moving <strong className="text-white">{modal.session.client_name}</strong> from {format(new Date(modal.session.start_datetime), 'h:mm a')}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">New Start</label><input type="time" className="glass-input" value={newStart} onChange={e => setNewStart(e.target.value)} /></div>
                <div><label className="label">New End</label><input type="time" className="glass-input" value={newEnd} onChange={e => setNewEnd(e.target.value)} /></div>
              </div>
              <div>
                <label className="label">Reason (required)</label>
                <textarea className="glass-input" rows={3} placeholder="e.g. Client asked to shift, trainer conflict" value={reason} onChange={e => setReason(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button className="btn-ghost" onClick={() => { setModal({ type: 'none' }); setReason(''); }}>Back</button>
                <button className="btn-brand" onClick={handleReschedule} disabled={loading || !reason.trim() || !newStart || !newEnd}>
                  {loading ? 'Saving…' : 'Confirm'}
                </button>
              </div>
            </>}

            {/* ADD CLIENT */}
            {modal.type === 'addClient' && <>
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-white">Add New Client</h2>
                <button onClick={() => setModal({ type: 'none' })} className="p-1.5 rounded-lg hover:bg-white/10"><X size={18} /></button>
              </div>
              <div><label className="label">Client Name</label><input type="text" className="glass-input" placeholder="Full name" value={newClientName} onChange={e => setNewClientName(e.target.value)} /></div>
              <div><label className="label">Phone (optional)</label><input type="tel" className="glass-input" placeholder="+91 ..." value={newClientPhone} onChange={e => setNewClientPhone(e.target.value)} /></div>
              <button className="btn-brand w-full" onClick={handleAddClient} disabled={loading || !newClientName.trim()}>
                {loading ? 'Adding…' : 'Add Client'}
              </button>
            </>}
          </div>
        </div>
      )}
    </div>
  );
}
