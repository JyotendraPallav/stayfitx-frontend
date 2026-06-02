'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  getUser, clearToken,
  trainerGetSchedule, trainerGetClients, trainerAddClient,
  trainerBookSession, trainerCancelSession, trainerRescheduleSession,
  trainerGetNotifications, trainerMarkRead,
} from '@/lib/api';
import { format, addDays, subDays } from 'date-fns';
import {
  LogOut, ChevronLeft, ChevronRight, Plus, X,
  Clock, MapPin, RefreshCw, Repeat, CalendarDays,
  Users, BookOpen, CheckCircle, Bell,
} from 'lucide-react';

type Session = {
  id: string;
  client_name: string;
  start_datetime: string;
  end_datetime: string;
  location: string;
  status: string;
  series_id?: string;
  cancel_reason?: string;
  reschedule_reason?: string;
};

type Client = { id: string; name: string; phone?: string; notes?: string };

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function TrainerPage() {
  const router = useRouter();
  const [user] = useState(() => getUser());

  const [tab, setTab] = useState<'schedule' | 'clients' | 'book'>('schedule');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');

  // Session detail drawer
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancellingSession, setCancellingSession] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newStartTime, setNewStartTime] = useState('');
  const [newEndTime, setNewEndTime] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');

  // Add client drawer
  const [showAddClient, setShowAddClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientNotes, setNewClientNotes] = useState('');
  const [addClientLoading, setAddClientLoading] = useState(false);

  // Notifications
  const [notifications, setNotifications] = useState<{id: string; type: string; message: string; is_read: boolean; created_at: string}[]>([]);
  const [unread, setUnread] = useState(0);
  const [showNotif, setShowNotif] = useState(false);

  // Book session form
  const [bookClientId, setBookClientId] = useState('');
  const [bookDate, setBookDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [bookStartTime, setBookStartTime] = useState('07:00');
  const [bookEndTime, setBookEndTime] = useState('08:00');
  const [bookLocation, setBookLocation] = useState('');
  const [bookRecurring, setBookRecurring] = useState(false);
  const [bookRecurDays, setBookRecurDays] = useState<number[]>([]);
  const [bookRecurEndDate, setBookRecurEndDate] = useState('');
  const [bookLoading, setBookLoading] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const data = await trainerGetSchedule(format(currentDate, 'yyyy-MM-dd'));
      setSessions(data.sessions);
    } catch { /* 401 handled by apiFetch */ }
    finally { setLoading(false); }
  }, [currentDate]);

  const fetchClients = useCallback(async () => {
    try {
      const data = await trainerGetClients();
      setClients(data.clients);
    } catch { /* non-fatal */ }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await trainerGetNotifications();
      setNotifications(data.notifications);
      setUnread(data.unread_count);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    if (user.role !== 'trainer') { router.push('/admin'); return; }
    fetchSchedule();
    fetchClients();
    fetchNotifications();
    const scheduleInterval = setInterval(fetchSchedule, 60000);
    const notifInterval = setInterval(fetchNotifications, 30000);
    return () => { clearInterval(scheduleInterval); clearInterval(notifInterval); };
  }, [user, router, fetchSchedule, fetchClients, fetchNotifications]);

  function closeDrawer() {
    setSelectedSession(null);
    setCancellingSession(false); setCancelReason('');
    setRescheduling(false);
    setNewDate(''); setNewStartTime(''); setNewEndTime(''); setRescheduleReason('');
  }

  async function handleCancelSession() {
    if (!selectedSession || !cancelReason.trim()) return;
    try {
      await trainerCancelSession(selectedSession.id, cancelReason);
      showToast('Session cancelled');
      closeDrawer();
      fetchSchedule();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Cancel failed');
    }
  }

  async function handleReschedule() {
    if (!selectedSession || !newDate || !newStartTime || !newEndTime || !rescheduleReason.trim()) return;
    try {
      const newStart = new Date(`${newDate}T${newStartTime}:00`);
      const newEnd   = new Date(`${newDate}T${newEndTime}:00`);
      await trainerRescheduleSession(selectedSession.id, {
        new_start_datetime: newStart.toISOString(),
        new_end_datetime:   newEnd.toISOString(),
        reason: rescheduleReason,
      });
      showToast('Session rescheduled');
      closeDrawer();
      fetchSchedule();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Reschedule failed');
    }
  }

  async function handleAddClient() {
    if (!newClientName.trim()) return;
    setAddClientLoading(true);
    try {
      await trainerAddClient({ name: newClientName, phone: newClientPhone || null, notes: newClientNotes || null });
      showToast('Client added!');
      setShowAddClient(false);
      setNewClientName(''); setNewClientPhone(''); setNewClientNotes('');
      fetchClients();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Error adding client');
    } finally { setAddClientLoading(false); }
  }

  async function handleBookSession() {
    if (!bookClientId || !bookDate || !bookStartTime || !bookEndTime) return;
    if (bookRecurring && bookRecurDays.length === 0) {
      showToast('Select at least one day for recurring schedule');
      return;
    }
    setBookLoading(true);
    try {
      const startDt = new Date(`${bookDate}T${bookStartTime}:00`);
      const endDt   = new Date(`${bookDate}T${bookEndTime}:00`);
      await trainerBookSession({
        client_id:      bookClientId,
        start_datetime: startDt.toISOString(),
        end_datetime:   endDt.toISOString(),
        location:       bookLocation || null,
        is_recurring:   bookRecurring,
        recur_days:     bookRecurring ? bookRecurDays : null,
        recur_end_date: bookRecurring && bookRecurEndDate ? bookRecurEndDate : null,
      });
      showToast(bookRecurring ? 'Recurring series booked!' : 'Session booked!');
      setTab('schedule');
      setCurrentDate(new Date(`${bookDate}T12:00:00`));
      setBookClientId(''); setBookLocation('');
      setBookRecurring(false); setBookRecurDays([]); setBookRecurEndDate('');
      fetchSchedule();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Booking failed');
    } finally { setBookLoading(false); }
  }

  const scheduled   = sessions.filter(s => s.status === 'scheduled');
  const rescheduled = sessions.filter(s => s.status === 'rescheduled');
  const cancelled   = sessions.filter(s => s.status === 'cancelled');
  const isToday     = format(currentDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="min-h-screen pb-24">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl text-sm font-medium text-white shadow-xl"
          style={{ background: 'rgba(139,92,246,0.9)', backdropFilter: 'blur(12px)' }}>
          {toast}
        </div>
      )}

      {/* ── NAVBAR ── */}
      <nav className="glass sticky top-0 z-40 px-4 py-3 flex justify-between items-center mb-5"
        style={{ borderRadius: '0 0 1rem 1rem' }}>
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="StayFit-XbyShyam" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-white font-bold text-sm leading-none truncate">{user?.name || 'Trainer'}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>StayFit-XbyShyam</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={fetchSchedule} className="btn-ghost p-2.5 rounded-lg" title="Refresh">
            <RefreshCw size={15} />
          </button>
          <button onClick={() => setShowNotif(true)} className="btn-ghost p-2.5 rounded-lg relative" title="Notifications">
            <Bell size={15} />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
                style={{ background: '#ef4444' }}>{unread > 9 ? '9+' : unread}</span>
            )}
          </button>
          <button onClick={() => { clearToken(); router.push('/login'); }} className="btn-ghost p-2.5 rounded-lg" title="Sign out">
            <LogOut size={15} />
          </button>
        </div>
      </nav>

      <div className="max-w-lg mx-auto px-4 space-y-4">

        {/* ══════════════════════════════════════════
            SCHEDULE TAB
        ══════════════════════════════════════════ */}
        {tab === 'schedule' && (
          <>
            {/* Date navigation */}
            <div className="flex items-center gap-3">
              <button onClick={() => setCurrentDate(d => subDays(d, 1))} className="btn-ghost p-2 rounded-lg">
                <ChevronLeft size={18} />
              </button>
              <div className="flex-1 text-center">
                <p className="text-white font-bold">
                  {isToday ? 'Today' : format(currentDate, 'EEEE')}
                </p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>{format(currentDate, 'dd MMMM yyyy')}</p>
              </div>
              <button onClick={() => setCurrentDate(d => addDays(d, 1))} className="btn-ghost p-2 rounded-lg">
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Day summary strip */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Scheduled',   count: scheduled.length,   color: '#34D399' },
                { label: 'Rescheduled', count: rescheduled.length, color: '#FCD34D' },
                { label: 'Cancelled',   count: cancelled.length,   color: '#F87171' },
              ].map(({ label, count, color }) => (
                <div key={label} className="glass rounded-xl p-3 text-center">
                  <p className="text-xl font-extrabold" style={{ color }}>{count}</p>
                  <p className="text-[9px] mt-0.5" style={{ color: 'var(--muted)' }}>{label}</p>
                </div>
              ))}
            </div>

            {/* Session list */}
            {loading ? (
              <div className="flex items-center justify-center py-14 gap-3" style={{ color: 'var(--muted)' }}>
                <RefreshCw size={18} className="animate-spin" />
                <span className="text-sm">Loading…</span>
              </div>
            ) : sessions.length === 0 ? (
              <div className="glass rounded-2xl p-10 text-center space-y-3">
                <CalendarDays size={32} className="mx-auto opacity-30" style={{ color: 'var(--muted)' }} />
                <p className="text-sm" style={{ color: 'var(--muted)' }}>No sessions on this day.</p>
                <button onClick={() => setTab('book')} className="btn-brand text-sm py-2 px-5">
                  Book a Session
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {sessions.map(s => {
                  const borderColor = s.status === 'cancelled' ? '#F87171'
                    : s.status === 'rescheduled' ? '#FCD34D' : '#34D399';
                  const avatarBg = s.status === 'cancelled' ? 'rgba(239,68,68,0.2)'
                    : s.status === 'rescheduled' ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)';
                  return (
                    <button key={s.id} onClick={() => setSelectedSession(s)}
                      className="w-full glass rounded-2xl p-4 flex items-center gap-4 text-left hover:bg-white/[0.04] active:scale-[0.99] transition-all"
                      style={{ borderLeft: `3px solid ${borderColor}` }}>
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                        style={{ background: avatarBg }}>
                        {initials(s.client_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm truncate">{s.client_name}</p>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-xs flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                            <Clock size={10} />
                            {format(new Date(s.start_datetime), 'h:mm a')} – {format(new Date(s.end_datetime), 'h:mm a')}
                          </span>
                          {s.location && (
                            <span className="text-xs flex items-center gap-1 truncate max-w-[120px]" style={{ color: 'var(--muted)' }}>
                              <MapPin size={10} />{s.location}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <span className={`badge ${s.status === 'scheduled' ? 'badge-green' : s.status === 'cancelled' ? 'badge-red' : 'badge-amber'}`}>
                          {s.status}
                        </span>
                        {s.series_id && <Repeat size={11} style={{ color: 'var(--muted)' }} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <button onClick={() => setTab('book')} className="btn-brand w-full flex items-center justify-center gap-2 text-sm">
              <Plus size={16} /> Book New Session
            </button>
          </>
        )}

        {/* ══════════════════════════════════════════
            CLIENTS TAB
        ══════════════════════════════════════════ */}
        {tab === 'clients' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">My Clients</h2>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>{clients.length} client{clients.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setShowAddClient(true)} className="btn-brand py-2 px-4 text-sm flex items-center gap-1.5">
                <Plus size={14} /> Add Client
              </button>
            </div>

            {clients.length === 0 ? (
              <div className="glass rounded-2xl p-10 text-center space-y-3">
                <Users size={32} className="mx-auto opacity-30" style={{ color: 'var(--muted)' }} />
                <p className="text-sm" style={{ color: 'var(--muted)' }}>No clients yet. Add your first one!</p>
                <button onClick={() => setShowAddClient(true)} className="btn-brand text-sm py-2 px-5">
                  Add Client
                </button>
              </div>
            ) : (
              <div className="glass rounded-2xl overflow-hidden">
                {clients.map((c, i) => (
                  <div key={c.id}
                    className={`p-4 flex items-center gap-3 ${i < clients.length - 1 ? 'border-b' : ''}`}
                    style={{ borderColor: 'var(--border)' }}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)' }}>
                      {initials(c.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm truncate">{c.name}</p>
                      {c.phone && <p className="text-xs" style={{ color: 'var(--muted)' }}>{c.phone}</p>}
                      {c.notes && <p className="text-xs truncate opacity-60" style={{ color: 'var(--muted)' }}>{c.notes}</p>}
                    </div>
                    <button onClick={() => { setBookClientId(c.id); setTab('book'); }}
                      className="btn-ghost py-1.5 px-3 text-xs flex-shrink-0 flex items-center gap-1">
                      <BookOpen size={11} /> Book
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════
            BOOK TAB
        ══════════════════════════════════════════ */}
        {tab === 'book' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">Book a Session</h2>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Schedule a new session for a client</p>
            </div>

            <div className="glass rounded-2xl p-5 space-y-4">

              {/* Client */}
              <div>
                <label className="label">Client *</label>
                <select className="glass-input" value={bookClientId} onChange={e => setBookClientId(e.target.value)}>
                  <option value="">Select a client…</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {clients.length === 0 && (
                  <p className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>
                    No clients yet.{' '}
                    <button className="underline" style={{ color: 'var(--brand-light)' }}
                      onClick={() => setTab('clients')}>Add one first →</button>
                  </p>
                )}
              </div>

              {/* Date */}
              <div>
                <label className="label">Date *</label>
                <input type="date" className="glass-input" value={bookDate}
                  onChange={e => setBookDate(e.target.value)} />
              </div>

              {/* Start / End time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start Time *</label>
                  <input type="time" className="glass-input" value={bookStartTime}
                    onChange={e => setBookStartTime(e.target.value)} />
                </div>
                <div>
                  <label className="label">End Time *</label>
                  <input type="time" className="glass-input" value={bookEndTime}
                    onChange={e => setBookEndTime(e.target.value)} />
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="label">Location</label>
                <input type="text" className="glass-input" placeholder="e.g. Client Premises, Gym Floor…"
                  value={bookLocation} onChange={e => setBookLocation(e.target.value)} />
              </div>

              {/* Recurring toggle */}
              <button onClick={() => { setBookRecurring(v => !v); setBookRecurDays([]); }}
                className="w-full rounded-xl py-3 px-4 flex items-center justify-between text-sm font-semibold transition-all"
                style={{
                  background: bookRecurring ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)',
                  border: bookRecurring ? '1px solid rgba(139,92,246,0.4)' : '1px solid var(--border)',
                }}>
                <span className="flex items-center gap-2">
                  <Repeat size={14} style={{ color: bookRecurring ? '#A78BFA' : 'var(--muted)' }} />
                  <span style={{ color: bookRecurring ? 'white' : 'var(--muted)' }}>Recurring Weekly</span>
                </span>
                <div className="w-10 h-5 rounded-full relative transition-all"
                  style={{ background: bookRecurring ? '#7C3AED' : 'rgba(255,255,255,0.1)' }}>
                  <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                    style={{ left: bookRecurring ? '22px' : '2px' }} />
                </div>
              </button>

              {/* Recurring options */}
              {bookRecurring && (
                <div className="space-y-3 rounded-xl p-4"
                  style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}>
                  <div>
                    <label className="label">Repeat on</label>
                    <div className="flex gap-1.5 flex-wrap mt-1">
                      {DAY_SHORT.map((d, i) => (
                        <button key={d}
                          onClick={() => setBookRecurDays(prev =>
                            prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
                          )}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                          style={{
                            background: bookRecurDays.includes(i) ? '#7C3AED' : 'rgba(255,255,255,0.06)',
                            color: bookRecurDays.includes(i) ? 'white' : 'var(--muted)',
                            border: bookRecurDays.includes(i) ? '1px solid #A78BFA' : '1px solid var(--border)',
                          }}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="label">Series end date (optional)</label>
                    <input type="date" className="glass-input" value={bookRecurEndDate}
                      onChange={e => setBookRecurEndDate(e.target.value)} />
                    <p className="text-[10px] mt-1" style={{ color: 'var(--muted)' }}>
                      Leave blank — 90 days of sessions generated automatically
                    </p>
                  </div>
                </div>
              )}

              {/* Submit */}
              <button onClick={handleBookSession}
                disabled={bookLoading || !bookClientId || !bookDate || !bookStartTime || !bookEndTime}
                className="btn-brand w-full flex items-center justify-center gap-2 disabled:opacity-50">
                {bookLoading
                  ? <><RefreshCw size={15} className="animate-spin" /> Booking…</>
                  : <><CheckCircle size={15} /> {bookRecurring ? 'Book Recurring Series' : 'Book Session'}</>}
              </button>
            </div>
          </div>
        )}

      </div>

      {/* ── SESSION DETAIL DRAWER ── */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={closeDrawer}>
          <div className="glass w-full rounded-t-3xl p-6 pb-10 space-y-5 max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
            style={{ animation: 'slideUpSheet 0.25s ease-out' }}>
            <div className="w-12 h-1 rounded-full bg-white/20 mx-auto" />

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                style={{ background: selectedSession.status === 'cancelled' ? 'rgba(239,68,68,0.25)' : 'linear-gradient(135deg,#7C3AED,#8B5CF6)' }}>
                {initials(selectedSession.client_name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-xl truncate">{selectedSession.client_name}</p>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  {format(new Date(selectedSession.start_datetime), 'EEE, dd MMM yyyy')}
                </p>
              </div>
              <span className={`badge flex-shrink-0 ${
                selectedSession.status === 'scheduled' ? 'badge-green' :
                selectedSession.status === 'cancelled' ? 'badge-red' : 'badge-amber'
              }`}>{selectedSession.status}</span>
            </div>

            <div className="space-y-3 rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-3 text-sm">
                <Clock size={15} style={{ color: 'var(--brand-light)' }} />
                <span className="text-white font-medium">
                  {format(new Date(selectedSession.start_datetime), 'h:mm a')} – {format(new Date(selectedSession.end_datetime), 'h:mm a')}
                </span>
              </div>
              {selectedSession.location && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin size={15} style={{ color: 'var(--brand-light)' }} />
                  <span className="text-white">{selectedSession.location}</span>
                </div>
              )}
              {selectedSession.series_id && (
                <div className="flex items-center gap-3 text-sm">
                  <Repeat size={15} style={{ color: 'var(--brand-light)' }} />
                  <span style={{ color: 'var(--muted)' }}>Part of a recurring series</span>
                  <span className="badge badge-brand ml-auto">Recurring</span>
                </div>
              )}
            </div>

            {selectedSession.cancel_reason && (
              <div className="rounded-xl p-3 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <p className="text-red-400 font-semibold text-xs mb-1">Cancellation reason</p>
                <p className="text-white">{selectedSession.cancel_reason}</p>
              </div>
            )}
            {selectedSession.reschedule_reason && (
              <div className="rounded-xl p-3 text-sm" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <p className="text-amber-400 font-semibold text-xs mb-1">Rescheduled — reason</p>
                <p className="text-white">{selectedSession.reschedule_reason}</p>
              </div>
            )}

            {/* Action buttons */}
            {selectedSession.status === 'scheduled' && !cancellingSession && !rescheduling && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setRescheduling(true)}
                  className="btn-ghost text-sm flex items-center justify-center gap-1.5">
                  <CalendarDays size={14} /> Reschedule
                </button>
                <button onClick={() => setCancellingSession(true)}
                  className="rounded-xl py-3 text-sm font-bold text-red-400 transition-colors"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  Cancel Session
                </button>
              </div>
            )}

            {/* Cancel flow */}
            {cancellingSession && (
              <div className="space-y-2">
                <label className="label">Reason for cancellation *</label>
                <textarea className="glass-input text-sm resize-none" rows={2}
                  placeholder="e.g. Client unwell, unavailable today…"
                  value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { setCancellingSession(false); setCancelReason(''); }}
                    className="btn-ghost text-sm py-2">Back</button>
                  <button onClick={handleCancelSession} disabled={!cancelReason.trim()}
                    className="rounded-xl py-2 text-sm font-bold text-red-400 disabled:opacity-40"
                    style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}>
                    Confirm Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Reschedule flow */}
            {rescheduling && (
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>New Date &amp; Time</p>
                <input type="date" className="glass-input" value={newDate}
                  onChange={e => setNewDate(e.target.value)} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Start</label>
                    <input type="time" className="glass-input" value={newStartTime}
                      onChange={e => setNewStartTime(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">End</label>
                    <input type="time" className="glass-input" value={newEndTime}
                      onChange={e => setNewEndTime(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="label">Reason *</label>
                  <textarea className="glass-input text-sm resize-none" rows={2}
                    placeholder="e.g. Client travel, venue change…"
                    value={rescheduleReason} onChange={e => setRescheduleReason(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setRescheduling(false)} className="btn-ghost text-sm py-2">Back</button>
                  <button onClick={handleReschedule}
                    disabled={!newDate || !newStartTime || !newEndTime || !rescheduleReason.trim()}
                    className="btn-brand text-sm py-2 disabled:opacity-40">
                    Confirm Reschedule
                  </button>
                </div>
              </div>
            )}

            <button onClick={closeDrawer} className="btn-ghost w-full text-sm">Close</button>
          </div>
        </div>
      )}

      {/* ── ADD CLIENT DRAWER ── */}
      {showAddClient && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={() => setShowAddClient(false)}>
          <div className="glass w-full rounded-t-3xl p-6 pb-10 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
            style={{ animation: 'slideUpSheet 0.25s ease-out' }}>
            <div className="w-12 h-1 rounded-full bg-white/20 mx-auto" />
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Add Client</h2>
              <button onClick={() => setShowAddClient(false)} className="p-1.5 rounded-lg hover:bg-white/10">
                <X size={18} />
              </button>
            </div>
            <div>
              <label className="label">Full Name *</label>
              <input type="text" className="glass-input" placeholder="e.g. Rahul Sharma"
                value={newClientName} onChange={e => setNewClientName(e.target.value)} />
            </div>
            <div>
              <label className="label">Phone (optional)</label>
              <input type="tel" className="glass-input" placeholder="+91 …"
                value={newClientPhone} onChange={e => setNewClientPhone(e.target.value)} />
            </div>
            <div>
              <label className="label">Notes (optional)</label>
              <textarea className="glass-input text-sm resize-none" rows={2}
                placeholder="e.g. Weight loss goal, knee injury…"
                value={newClientNotes} onChange={e => setNewClientNotes(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button className="btn-ghost" onClick={() => setShowAddClient(false)}>Cancel</button>
              <button className="btn-brand" onClick={handleAddClient}
                disabled={addClientLoading || !newClientName.trim()}>
                {addClientLoading ? 'Saving…' : 'Add Client'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── NOTIFICATION DRAWER ── */}
      {showNotif && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowNotif(false)}>
          <div className="glass rounded-t-2xl max-h-[80vh] flex flex-col" style={{ borderTop: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <Bell size={16} style={{ color: '#A78BFA' }} />
                <span className="font-bold text-white">Notifications</span>
                {unread > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: '#ef4444' }}>{unread} new</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button className="text-xs font-medium" style={{ color: '#A78BFA' }}
                    onClick={async () => {
                      const unreadItems = notifications.filter(n => !n.is_read);
                      await Promise.all(unreadItems.map(n => trainerMarkRead(n.id).catch(() => {})));
                      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
                      setUnread(0);
                    }}>
                    Mark all read
                  </button>
                )}
                <button onClick={() => setShowNotif(false)} className="btn-ghost p-1.5 rounded-lg"><X size={16} /></button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
              {notifications.length === 0 ? (
                <p className="text-center py-8 text-sm" style={{ color: 'var(--muted)' }}>No notifications yet</p>
              ) : notifications.map(n => (
                <div key={n.id} className="rounded-xl p-3.5 flex gap-3 items-start"
                  style={{ background: n.is_read ? 'var(--surface)' : 'rgba(167,139,250,0.08)', border: '1px solid var(--border)' }}>
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{ background: n.is_read ? 'var(--muted)' : (n.type === 'cancelled' ? '#ef4444' : '#A78BFA') }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white leading-snug">{n.message}</p>
                    <p className="text-[10px] mt-1" style={{ color: 'var(--muted)' }}>
                      {new Date(n.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {!n.is_read && (
                    <button onClick={async () => {
                      await trainerMarkRead(n.id).catch(() => {});
                      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
                      setUnread(prev => Math.max(0, prev - 1));
                    }} className="text-[10px] flex-shrink-0 mt-0.5" style={{ color: 'var(--muted)' }}>✓ read</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── BOTTOM TAB BAR ── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 glass"
        style={{ borderRadius: '1rem 1rem 0 0', borderTop: '1px solid var(--border)' }}>
        <div className="flex max-w-lg mx-auto">
          {([
            { key: 'schedule', icon: CalendarDays, label: 'Schedule' },
            { key: 'clients',  icon: Users,        label: 'Clients'  },
            { key: 'book',     icon: BookOpen,      label: 'Book'     },
          ] as const).map(({ key, icon: Icon, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className="flex-1 py-3 flex flex-col items-center gap-1 transition-all"
              style={{ color: tab === key ? '#A78BFA' : 'var(--muted)' }}>
              <Icon size={20} />
              <span className="text-[10px] font-semibold">{label}</span>
              {tab === key && <div className="w-4 h-0.5 rounded-full" style={{ background: '#A78BFA' }} />}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
