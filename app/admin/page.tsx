'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getUser, clearToken, adminGetSchedule, adminGetCapacity, adminGetTrainers, adminCreateTrainer, adminGetNotifications, adminMarkRead, adminCancelSeries } from '@/lib/api';
import { format, addDays, subDays, startOfWeek } from 'date-fns';
import { LogOut, Bell, ChevronLeft, ChevronRight, Plus, X, Clock, MapPin, BarChart2, CalendarDays, Users, Upload, RefreshCw, Repeat } from 'lucide-react';

type Session = {
  id: string; trainer_name: string; trainer_id: string;
  client_name: string; start_datetime: string; end_datetime: string;
  location: string; status: string; series_id?: string;
  cancel_reason?: string; reschedule_reason?: string;
};
type Trainer = { id: string; name: string; email: string; phone?: string; upcoming_sessions: number };
type Notification = { id: string; message: string; type: string; is_read: boolean; created_at: string };

const HOURS = [6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21];
const HOUR_LABELS = ['6AM','7AM','8AM','9AM','10AM','11AM','12PM','1PM','2PM','3PM','4PM','5PM','6PM','7PM','8PM','9PM'];

const TRAINER_PALETTE = [
  { bg: 'linear-gradient(135deg,#7C3AED,#8B5CF6)', solid: '#8B5CF6', shadow: 'rgba(139,92,246,0.5)' },
  { bg: 'linear-gradient(135deg,#0EA5E9,#38BDF8)', solid: '#38BDF8', shadow: 'rgba(14,165,233,0.5)'  },
  { bg: 'linear-gradient(135deg,#10B981,#34D399)', solid: '#34D399', shadow: 'rgba(16,185,129,0.5)'  },
  { bg: 'linear-gradient(135deg,#F59E0B,#FCD34D)', solid: '#FCD34D', shadow: 'rgba(245,158,11,0.5)'  },
  { bg: 'linear-gradient(135deg,#EF4444,#F87171)', solid: '#F87171', shadow: 'rgba(239,68,68,0.5)'   },
  { bg: 'linear-gradient(135deg,#EC4899,#F472B6)', solid: '#F472B6', shadow: 'rgba(236,72,153,0.5)'  },
];

function timeToSlotPct(dt: string) {
  const d = new Date(dt);
  const h = d.getHours() + d.getMinutes() / 60;
  return Math.max(0, Math.min(100, ((h - 6) / 16) * 100));
}

export default function AdminPage() {
  const router = useRouter();
  const user = getUser();
  const [view, setView] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [showNotif, setShowNotif] = useState(false);
  const [showAddTrainer, setShowAddTrainer] = useState(false);
  const [capacity, setCapacity] = useState<Record<string,Record<number,number>>>({});
  const [totalTrainers, setTotalTrainers] = useState(0);
  const [toast, setToast] = useState('');
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  // Add trainer form
  const [newTrainerName, setNewTrainerName] = useState('');
  const [newTrainerEmail, setNewTrainerEmail] = useState('');
  const [newTrainerPass, setNewTrainerPass] = useState('');
  const [newTrainerPhone, setNewTrainerPhone] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const fetchAll = useCallback(async () => {
    const dateStr = format(currentDate, 'yyyy-MM-dd');
    const weekStart = format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const [sc, tr, notif] = await Promise.all([
      adminGetSchedule(dateStr),
      adminGetTrainers(),
      adminGetNotifications(),
    ]);
    setSessions(sc.sessions);
    setTrainers(tr.trainers);
    setNotifications(notif.notifications);
    setUnread(notif.unread_count);

    if (view === 'weekly') {
      const cap = await adminGetCapacity(weekStart);
      setTotalTrainers(cap.total_trainers);
      const map: Record<string, Record<number, number>> = {};
      (cap.booked_slots as {day:string;hour:number;booked_count:number}[]).forEach(s => {
        if (!map[s.day]) map[s.day] = {};
        map[s.day][s.hour] = s.booked_count;
      });
      setCapacity(map);
    }
  }, [currentDate, view]);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    if (user.role !== 'admin') { router.push('/trainer'); return; }
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [user, router, fetchAll]);

  async function handleMarkRead(id: string) {
    await adminMarkRead(id);
    setNotifications(n => n.map(x => x.id === id ? { ...x, is_read: true } : x));
    setUnread(u => Math.max(0, u - 1));
  }

  async function handleAddTrainer() {
    if (!newTrainerName || !newTrainerEmail || !newTrainerPass) return;
    setFormLoading(true);
    try {
      await adminCreateTrainer({ name: newTrainerName, email: newTrainerEmail, password: newTrainerPass, phone: newTrainerPhone || null });
      showToast('Trainer account created!');
      setShowAddTrainer(false);
      setNewTrainerName(''); setNewTrainerEmail(''); setNewTrainerPass(''); setNewTrainerPhone('');
      fetchAll();
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Error'); }
    finally { setFormLoading(false); }
  }

  async function handleCancelSeries(seriesId: string) {
    if (!confirm('Cancel the ENTIRE recurring series? This will remove all future sessions for this client.')) return;
    await adminCancelSeries(seriesId);
    showToast('Series cancelled');
    setSelectedSession(null);
    fetchAll();
  }

  // Unique trainer names from today's sessions
  const trainerNames = useMemo(() => [...new Set(sessions.map(s => s.trainer_name))].sort(), [sessions]);

  // Per-trainer color map — stable by name
  const trainerColorMap = useMemo(() => {
    const map: Record<string, typeof TRAINER_PALETTE[0]> = {};
    trainerNames.forEach((name, i) => { map[name] = TRAINER_PALETTE[i % TRAINER_PALETTE.length]; });
    return map;
  }, [trainerNames]);

  // Weekly heatmap days
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = addDays(startOfWeek(currentDate, { weekStartsOn: 1 }), i);
    return format(d, 'yyyy-MM-dd');
  }), [currentDate]);

  const peakHours = [6, 7, 8, 9, 10, 17, 18, 19, 20];

  return (
    <div className="min-h-screen pb-24">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl text-sm font-medium text-white shadow-xl"
          style={{ background: 'rgba(139,92,246,0.9)', backdropFilter: 'blur(12px)' }}>{toast}</div>
      )}

      {/* ── NAVBAR ── */}
      <nav className="glass sticky top-0 z-40 px-4 py-3 flex justify-between items-center mb-5" style={{ borderRadius: '0 0 1rem 1rem' }}>
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="StayFit-XbyShyam" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-white font-bold text-sm leading-none">Syam&apos;s Dashboard</p>
            <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--muted)' }}>StayFit-XbyShyam</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowAddTrainer(true)} className="btn-ghost p-2.5 rounded-lg" title="Add trainer"><Plus size={17} /></button>
          <button onClick={() => setShowNotif(v => !v)} className="relative btn-ghost p-2.5 rounded-lg">
            <Bell size={17} />
            {unread > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white" style={{ background: '#EF4444' }}>{unread}</span>}
          </button>
          <Link href="/admin/import" className="btn-ghost p-2.5 rounded-lg" title="Import from screenshot"><Upload size={17} /></Link>
          <button onClick={() => fetchAll()} className="btn-ghost p-2.5 rounded-lg" title="Refresh"><RefreshCw size={15} /></button>
          <button onClick={() => { clearToken(); router.push('/login'); }} className="btn-ghost p-2.5 rounded-lg" title="Sign out"><LogOut size={15} /></button>
        </div>
      </nav>

      {/* ── NOTIFICATION DRAWER ── */}
      {showNotif && (
        <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowNotif(false)}>
          <div className="glass w-full max-w-sm h-full overflow-y-auto p-6" onClick={e => e.stopPropagation()} style={{ borderRadius: '1rem 0 0 1rem' }}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><Bell size={18} /> Notifications</h2>
              <button onClick={() => setShowNotif(false)} className="p-1.5 rounded-lg hover:bg-white/10"><X size={18} /></button>
            </div>
            {notifications.length === 0 ? (
              <p className="text-center text-sm py-8" style={{ color: 'var(--muted)' }}>All clear! No notifications.</p>
            ) : notifications.map(n => (
              <div key={n.id} className={`p-4 rounded-xl mb-3 transition-all ${n.is_read ? 'opacity-50' : ''}`}
                style={{ background: n.is_read ? 'transparent' : 'rgba(139,92,246,0.08)', border: `1px solid ${n.is_read ? 'var(--border)' : 'rgba(139,92,246,0.2)'}` }}>
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <span className={`badge mb-2 ${n.type === 'cancelled' ? 'badge-red' : 'badge-amber'}`}>{n.type}</span>
                    <p className="text-sm text-white leading-relaxed">{n.message}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{format(new Date(n.created_at), 'dd MMM, h:mm a')}</p>
                  </div>
                  {!n.is_read && (
                    <button onClick={() => handleMarkRead(n.id)} className="text-xs flex-shrink-0" style={{ color: 'var(--brand-light)' }}>Mark read</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 space-y-4">

        {/* View switcher + date nav */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-white">Master Schedule</h2>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{format(currentDate, 'MMMM yyyy')}</p>
          </div>
          <div className="glass p-1 rounded-xl flex text-xs">
            {(['daily', 'weekly', 'monthly'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-2 rounded-lg font-medium transition-all ${view === v ? 'bg-white/10 text-white font-bold' : 'text-slate-400 hover:text-white'}`}>
                {v === 'daily' ? <><CalendarDays size={12} className="inline mr-1" />Daily</> :
                 v === 'weekly' ? <><BarChart2 size={12} className="inline mr-1" />Weekly</> :
                 <><Users size={12} className="inline mr-1" />Roster</>}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setCurrentDate(d => view === 'weekly' ? addDays(d, -7) : subDays(d, 1))} className="btn-ghost p-2 rounded-lg"><ChevronLeft size={18} /></button>
          <span className="text-white font-semibold text-sm flex-1 text-center">
            {view === 'daily' ? format(currentDate, 'EEE, dd MMM yyyy') :
             view === 'weekly' ? `Week of ${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'dd MMM')}` :
             format(currentDate, 'MMMM yyyy')}
          </span>
          <button onClick={() => setCurrentDate(d => view === 'weekly' ? addDays(d, 7) : addDays(d, 1))} className="btn-ghost p-2 rounded-lg"><ChevronRight size={18} /></button>
        </div>

        {/* ── DAILY TIMELINE ── */}
        {view === 'daily' && (
          <div className="glass rounded-2xl overflow-hidden">
            {/* Trainer color legend */}
            {trainerNames.length > 0 && (
              <div className="px-4 py-2.5 border-b flex flex-wrap gap-3" style={{ borderColor: 'var(--border)' }}>
                {trainerNames.map(name => {
                  const c = trainerColorMap[name];
                  return (
                    <div key={name} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c?.solid }} />
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>{name.split(' ')[0]}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="overflow-x-auto" style={{ minHeight: 100 }}>
              <div style={{ minWidth: '700px' }}>
                {/* Hour header */}
                <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
                  <div className="w-28 flex-shrink-0 p-3 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Trainer</div>
                  <div className="flex-1 flex">
                    {HOUR_LABELS.map((h, i) => (
                      <div key={i} className="flex-1 p-2 text-center text-[10px] font-semibold border-r"
                        style={{ color: (i >= 0 && i <= 5) || (i >= 11 && i <= 14) ? '#A78BFA' : 'var(--muted)', borderColor: 'var(--border)' }}>
                        {h}
                      </div>
                    ))}
                  </div>
                </div>
                {trainerNames.length === 0 ? (
                  <div className="p-10 text-center text-sm" style={{ color: 'var(--muted)' }}>No sessions scheduled for today.</div>
                ) : trainerNames.map(tName => {
                  const color = trainerColorMap[tName] || TRAINER_PALETTE[0];
                  const tSessions = sessions.filter(s => s.trainer_name === tName);
                  return (
                    <div key={tName} className="flex border-b hover:bg-white/[0.01] transition-colors"
                      style={{ borderColor: 'var(--border)', borderLeft: `3px solid ${color.solid}` }}>
                      {/* Trainer name column — always visible */}
                      <div className="w-28 flex-shrink-0 p-2.5 flex items-center gap-2" title={tName}>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                          style={{ background: color.bg }}>
                          {tName.split(' ').map((w:string) => w[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-xs font-semibold text-white truncate">{tName.split(' ')[0]}</span>
                      </div>
                      {/* Session blocks */}
                      <div className="flex-1 relative h-16">
                        <div className="absolute inset-0 flex pointer-events-none">
                          {HOURS.map(h => <div key={h} className="flex-1 border-r" style={{ borderColor: 'var(--border)', opacity: 0.4 }} />)}
                        </div>
                        {tSessions.filter(s => s.status !== 'cancelled').map(s => {
                          const left = timeToSlotPct(s.start_datetime);
                          const right = 100 - timeToSlotPct(s.end_datetime);
                          return (
                            <button key={s.id}
                              onClick={() => setSelectedSession(s)}
                              className="absolute top-2 bottom-2 rounded-lg text-white text-left px-2 py-1 flex flex-col justify-center overflow-hidden hover:opacity-90 active:scale-95 transition-all"
                              style={{
                                left: `${left}%`, right: `${right}%`,
                                background: s.status === 'rescheduled' ? 'linear-gradient(135deg,#D97706,#F59E0B)' : color.bg,
                                boxShadow: `0 2px 8px ${color.shadow}`, minWidth: 44
                              }}>
                              <span className="font-bold truncate text-[11px] leading-tight">{s.client_name}</span>
                              {s.location && <span className="text-[9px] opacity-70 truncate">{s.location}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── WEEKLY HEATMAP ── */}
        {view === 'weekly' && (
          <div className="glass rounded-2xl overflow-hidden">
            <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-bold text-white text-sm">Trainer Availability</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Tap any cell to jump to that day&apos;s timeline</p>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                <span className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm" style={{ background: 'rgba(16,185,129,0.4)', border: '1px solid #10B981' }}></div> Available</span>
                <span className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm" style={{ background: 'rgba(245,158,11,0.3)', border: '1px solid #F59E0B' }}></div> Limited</span>
                <span className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm" style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid #EF4444' }}></div> Full</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-center" style={{ minWidth: 480 }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.3)' }}>
                    <th className="p-2 text-[10px] font-bold uppercase tracking-widest text-left w-14" style={{ color: 'var(--muted)' }}>Time</th>
                    {weekDays.map(d => {
                      const isToday = d === format(new Date(), 'yyyy-MM-dd');
                      return (
                        <th key={d} className="p-2 text-[10px] font-bold uppercase tracking-widest"
                          style={{ color: isToday ? '#A78BFA' : 'var(--muted)', borderLeft: '1px solid var(--border)', background: isToday ? 'rgba(139,92,246,0.05)' : 'transparent' }}>
                          {format(new Date(d + 'T12:00:00'), 'EEE')}
                          <br />
                          <span className="text-[9px] normal-case font-normal">{format(new Date(d + 'T12:00:00'), 'dd/MM')}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {peakHours.map(h => (
                    <tr key={h} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="p-2 text-[10px] font-semibold text-left" style={{ color: 'var(--muted)' }}>
                        {h < 12 ? `${h}AM` : h === 12 ? '12PM' : `${h-12}PM`}
                      </td>
                      {weekDays.map(d => {
                        const booked = capacity[d]?.[h] || 0;
                        const free = Math.max(0, totalTrainers - booked);
                        const ratio = totalTrainers > 0 ? free / totalTrainers : 1;
                        const bg = ratio > 0.6 ? 'rgba(16,185,129,0.15)' : ratio > 0.2 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.1)';
                        const color = ratio > 0.6 ? '#34D399' : ratio > 0.2 ? '#FCD34D' : '#F87171';
                        return (
                          <td key={d} className="border-l font-bold text-xs cursor-pointer active:scale-95 transition-all"
                            style={{ borderColor: 'var(--border)', background: bg, color }}
                            onClick={() => {
                              setCurrentDate(new Date(d + 'T12:00:00'));
                              setView('daily');
                            }}>
                            <div className="py-3 px-1 text-[11px]">
                              {totalTrainers === 0 ? '—' : free > 0 ? `${free} free` : 'Full'}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── ROSTER ── */}
        {view === 'monthly' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Trainers', value: trainers.length, icon: Users },
                { label: "Today's Sessions", value: sessions.filter(s => s.status === 'scheduled').length, icon: CalendarDays },
                { label: 'Cancelled', value: sessions.filter(s => s.status === 'cancelled').length, icon: X },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="glass rounded-2xl p-4 flex flex-col items-center gap-2 text-center">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)' }}>
                    <Icon size={16} style={{ color: 'var(--brand-light)' }} />
                  </div>
                  <p className="text-2xl font-extrabold text-white">{value}</p>
                  <p className="text-[10px] leading-tight" style={{ color: 'var(--muted)' }}>{label}</p>
                </div>
              ))}
            </div>
            <div className="glass rounded-2xl overflow-hidden">
              <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                <span className="font-bold text-white text-sm">Trainer Roster</span>
                <button onClick={() => setShowAddTrainer(true)} className="btn-ghost py-1.5 px-3 text-xs flex items-center gap-1">
                  <Plus size={13} /> Add Trainer
                </button>
              </div>
              {trainers.length === 0 ? (
                <p className="p-6 text-center text-sm" style={{ color: 'var(--muted)' }}>No trainers yet.</p>
              ) : trainers.map((t, i) => {
                const color = TRAINER_PALETTE[i % TRAINER_PALETTE.length];
                return (
                  <div key={t.id} className="flex items-center justify-between p-4 border-b hover:bg-white/[0.02] transition-colors" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                        style={{ background: color.bg }}>
                        {t.name.split(' ').map((w:string) => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{t.name}</p>
                        <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>{t.phone || t.email}</p>
                      </div>
                    </div>
                    <span className="badge badge-brand flex-shrink-0 ml-2">{t.upcoming_sessions} upcoming</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── SESSION DETAIL DRAWER (bottom sheet) ── */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={() => setSelectedSession(null)}>
          <div className="glass w-full rounded-t-3xl p-6 pb-10 space-y-5 max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
            style={{ animation: 'slideUpSheet 0.25s ease-out' }}>
            {/* Handle bar */}
            <div className="w-12 h-1 rounded-full bg-white/20 mx-auto" />

            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                style={{ background: trainerColorMap[selectedSession.trainer_name]?.bg || TRAINER_PALETTE[0].bg }}>
                {selectedSession.trainer_name.split(' ').map((w:string) => w[0]).join('').slice(0,2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-xl truncate">{selectedSession.client_name}</p>
                <p className="text-sm truncate" style={{ color: 'var(--muted)' }}>with {selectedSession.trainer_name}</p>
              </div>
              <span className={`badge flex-shrink-0 ${
                selectedSession.status === 'scheduled' ? 'badge-green' :
                selectedSession.status === 'cancelled' ? 'badge-red' : 'badge-amber'
              }`}>{selectedSession.status}</span>
            </div>

            {/* Details */}
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
                  <span style={{ color: 'var(--muted)' }}>Recurring weekly series</span>
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

            {/* Actions */}
            {selectedSession.series_id && selectedSession.status === 'scheduled' && (
              <button
                onClick={() => handleCancelSeries(selectedSession.series_id!)}
                className="w-full rounded-xl py-3 text-sm font-bold text-red-400 transition-colors"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                Cancel Entire Recurring Series
              </button>
            )}
            <button onClick={() => setSelectedSession(null)} className="btn-ghost w-full text-sm">Close</button>
          </div>
        </div>
      )}

      {/* ── ADD TRAINER MODAL ── */}
      {showAddTrainer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="glass rounded-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-white">Create Trainer Account</h2>
              <button onClick={() => setShowAddTrainer(false)} className="p-1.5 rounded-lg hover:bg-white/10"><X size={18} /></button>
            </div>
            <div><label className="label">Full Name</label><input type="text" className="glass-input" placeholder="e.g. Alex Rodrigues" value={newTrainerName} onChange={e => setNewTrainerName(e.target.value)} /></div>
            <div><label className="label">Email</label><input type="email" className="glass-input" placeholder="trainer@email.com" value={newTrainerEmail} onChange={e => setNewTrainerEmail(e.target.value)} /></div>
            <div><label className="label">Password</label><input type="password" className="glass-input" placeholder="Temporary password" value={newTrainerPass} onChange={e => setNewTrainerPass(e.target.value)} /></div>
            <div><label className="label">Phone (optional)</label><input type="tel" className="glass-input" placeholder="+91 ..." value={newTrainerPhone} onChange={e => setNewTrainerPhone(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <button className="btn-ghost" onClick={() => setShowAddTrainer(false)}>Cancel</button>
              <button className="btn-brand" onClick={handleAddTrainer} disabled={formLoading || !newTrainerName || !newTrainerEmail || !newTrainerPass}>
                {formLoading ? 'Creating…' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
