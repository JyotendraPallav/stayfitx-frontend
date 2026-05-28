'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getUser, clearToken, adminGetSchedule, adminGetCapacity, adminGetTrainers, adminCreateTrainer, adminGetNotifications, adminMarkRead, adminCancelSeries } from '@/lib/api';
import { format, addDays, subDays, startOfWeek } from 'date-fns';
import { LogOut, Bell, ChevronLeft, ChevronRight, Plus, X, Clock, MapPin, BarChart2, CalendarDays, Users, Upload } from 'lucide-react';

type Session = {
  id: string; trainer_name: string; trainer_id: string;
  client_name: string; start_datetime: string; end_datetime: string;
  location: string; status: string; series_id?: string;
  cancel_reason?: string; reschedule_reason?: string;
};
type Trainer = { id: string; name: string; email: string; upcoming_sessions: number };
type Notification = { id: string; message: string; type: string; is_read: boolean; created_at: string };

const HOURS = [6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21];
const HOUR_LABELS = ['6AM','7AM','8AM','9AM','10AM','11AM','12PM','1PM','2PM','3PM','4PM','5PM','6PM','7PM','8PM','9PM'];

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

  // Add trainer form
  const [trainerName, setTrainerName] = useState('');
  const [trainerEmail, setTrainerEmail] = useState('');
  const [trainerPass, setTrainerPass] = useState('');
  const [trainerPhone, setTrainerPhone] = useState('');
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
    if (!trainerName || !trainerEmail || !trainerPass) return;
    setFormLoading(true);
    try {
      await adminCreateTrainer({ name: trainerName, email: trainerEmail, password: trainerPass, phone: trainerPhone || null });
      showToast('Trainer account created!');
      setShowAddTrainer(false);
      setTrainerName(''); setTrainerEmail(''); setTrainerPass(''); setTrainerPhone('');
      fetchAll();
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Error'); }
    finally { setFormLoading(false); }
  }

  async function handleCancelSeries(seriesId: string) {
    if (!confirm('Cancel the ENTIRE recurring series? This will remove all future sessions for this client.')) return;
    await adminCancelSeries(seriesId);
    showToast('Series cancelled');
    fetchAll();
  }

  // Group sessions by trainer for timeline
  const trainerNames = [...new Set(sessions.map(s => s.trainer_name))].sort();

  // Weekly heatmap
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(startOfWeek(currentDate, { weekStartsOn: 1 }), i);
    return format(d, 'yyyy-MM-dd');
  });
  const peakHours = [6, 7, 8, 9, 10, 17, 18, 19, 20];

  return (
    <div className="min-h-screen pb-24">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl text-sm font-medium text-white shadow-xl"
          style={{ background: 'rgba(139,92,246,0.9)', backdropFilter: 'blur(12px)' }}>{toast}</div>
      )}

      {/* Navbar */}
      <nav className="glass sticky top-0 z-40 px-6 py-4 flex justify-between items-center mb-6" style={{ borderRadius: '0 0 1rem 1rem' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
            style={{ background: 'linear-gradient(135deg,#7C3AED,#F472B6)' }}>SF</div>
          <div>
            <p className="text-white font-semibold text-sm leading-none">Syam's Dashboard</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Master Control</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Add Trainer */}
          <button onClick={() => setShowAddTrainer(true)} className="btn-ghost p-2.5 rounded-lg" title="Add new trainer">
            <Plus size={18} />
          </button>
          {/* Notification bell */}
          <button onClick={() => setShowNotif(v => !v)} className="relative btn-ghost p-2.5 rounded-lg">
            <Bell size={18} />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
                style={{ background: '#EF4444' }}>{unread}</span>
            )}
          </button>
          <Link href="/admin/import" className="btn-ghost p-2.5 rounded-lg" title="Import schedule from screenshot">
            <Upload size={18} />
          </Link>
          <button onClick={() => { clearToken(); router.push('/login'); }} className="btn-ghost py-2 px-3 flex items-center gap-1.5 text-xs">
            <LogOut size={14} /> Out
          </button>
        </div>
      </nav>

      {/* Notification drawer */}
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
              <div key={n.id} className={`p-4 rounded-xl mb-3 border transition-all ${n.is_read ? 'opacity-50' : ''}`}
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

      <div className="max-w-7xl mx-auto px-4 space-y-6">
        {/* View switcher */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Master Schedule</h2>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>{format(currentDate, 'MMMM yyyy')}</p>
          </div>
          <div className="glass p-1.5 rounded-xl flex text-sm">
            {(['daily', 'weekly', 'monthly'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-5 py-2 rounded-lg capitalize font-medium transition-all ${view === v ? 'bg-white/10 text-white font-bold shadow' : 'text-slate-400 hover:text-white'}`}>
                {v === 'daily' ? <><CalendarDays size={14} className="inline mr-1.5" />Daily</> :
                 v === 'weekly' ? <><BarChart2 size={14} className="inline mr-1.5" />Weekly</> :
                 <><Users size={14} className="inline mr-1.5" />Roster</>}
              </button>
            ))}
          </div>
        </div>

        {/* Date nav */}
        <div className="flex items-center gap-4">
          <button onClick={() => setCurrentDate(d => view === 'weekly' ? addDays(d, -7) : subDays(d, 1))} className="btn-ghost p-2 rounded-lg"><ChevronLeft size={18} /></button>
          <span className="text-white font-semibold">
            {view === 'daily' ? format(currentDate, 'EEEE, dd MMM yyyy') :
             view === 'weekly' ? `Week of ${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'dd MMM')}` :
             format(currentDate, 'MMMM yyyy')}
          </span>
          <button onClick={() => setCurrentDate(d => view === 'weekly' ? addDays(d, 7) : addDays(d, 1))} className="btn-ghost p-2 rounded-lg"><ChevronRight size={18} /></button>
        </div>

        {/* ── DAILY TIMELINE ────────────────────────────── */}
        {view === 'daily' && (
          <div className="glass rounded-2xl overflow-hidden">
            <div className="overflow-x-auto" style={{ minHeight: 300 }}>
              <div style={{ minWidth: `${Math.max(900, trainerNames.length * 60)}px` }}>
                {/* Hour header */}
                <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
                  <div className="w-36 flex-shrink-0 p-3 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Trainer</div>
                  <div className="flex-1 flex">
                    {HOUR_LABELS.map((h, i) => (
                      <div key={i} className="flex-1 p-2 text-center text-xs font-semibold border-r"
                        style={{ color: (i >= 0 && i <= 5) || (i >= 11 && i <= 14) ? '#A78BFA' : 'var(--muted)', borderColor: 'var(--border)' }}>
                        {h}
                      </div>
                    ))}
                  </div>
                </div>
                {trainerNames.length === 0 ? (
                  <div className="p-12 text-center" style={{ color: 'var(--muted)' }}>No sessions scheduled for today.</div>
                ) : trainerNames.map(tName => {
                  const tSessions = sessions.filter(s => s.trainer_name === tName);
                  return (
                    <div key={tName} className="flex border-b hover:bg-white/[0.01] transition-colors" style={{ borderColor: 'var(--border)' }}>
                      <div className="w-36 flex-shrink-0 p-3 flex items-center">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white mr-2 flex-shrink-0"
                          style={{ background: 'linear-gradient(135deg,#7C3AED,#A78BFA)' }}>
                          {tName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-white truncate">{tName.split(' ')[0]}</span>
                      </div>
                      <div className="flex-1 relative h-16">
                        {/* grid lines */}
                        <div className="absolute inset-0 flex pointer-events-none">
                          {HOURS.map(h => <div key={h} className="flex-1 border-r" style={{ borderColor: 'var(--border)', opacity: 0.4 }} />)}
                        </div>
                        {tSessions.filter(s => s.status !== 'cancelled').map(s => {
                          const left = timeToSlotPct(s.start_datetime);
                          const right = 100 - timeToSlotPct(s.end_datetime);
                          return (
                            <div key={s.id} className="absolute top-2 bottom-2 rounded-lg text-white text-xs px-2 py-1 flex flex-col justify-center overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                              style={{
                                left: `${left}%`, right: `${right}%`,
                                background: s.status === 'rescheduled' ? 'linear-gradient(135deg,#D97706,#F59E0B)' : 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
                                boxShadow: '0 2px 8px rgba(139,92,246,0.4)', minWidth: 60
                              }}
                              title={`${s.client_name} — ${s.location || ''}`}>
                              <span className="font-bold truncate">{s.client_name}</span>
                              {s.location && <span className="text-[10px] opacity-70 truncate">{s.location}</span>}
                              {s.series_id && (
                                <button onClick={() => handleCancelSeries(s.series_id!)}
                                  className="absolute top-1 right-1 w-4 h-4 rounded-full bg-white/20 flex items-center justify-center hover:bg-red-500/50 transition-colors" title="Cancel series">
                                  <X size={8} />
                                </button>
                              )}
                            </div>
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

        {/* ── WEEKLY HEATMAP ────────────────────────────── */}
        {view === 'weekly' && (
          <div className="glass rounded-2xl overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-bold text-white">Trainer Availability Matrix</h3>
              <div className="text-xs flex items-center gap-4" style={{ color: 'var(--muted)' }}>
                <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(16,185,129,0.4)', border: '1px solid #10B981' }}></div> High</span>
                <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(245,158,11,0.3)', border: '1px solid #F59E0B' }}></div> Limited</span>
                <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid #EF4444' }}></div> Full</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-center text-sm" style={{ minWidth: 640 }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.3)' }}>
                    <th className="p-3 text-xs font-bold uppercase tracking-widest text-left w-20" style={{ color: 'var(--muted)' }}>Time</th>
                    {weekDays.map(d => (
                      <th key={d} className={`p-3 text-xs font-bold uppercase tracking-widest ${d === format(new Date(), 'yyyy-MM-dd') ? 'text-purple-400' : ''}`}
                        style={{ color: d === format(new Date(), 'yyyy-MM-dd') ? '#A78BFA' : 'var(--muted)', borderLeft: '1px solid var(--border)' }}>
                        {format(new Date(d), 'EEE dd')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {peakHours.map(h => (
                    <tr key={h} className="border-t hover:bg-white/[0.01] transition-colors" style={{ borderColor: 'var(--border)' }}>
                      <td className="p-3 text-xs font-semibold text-left" style={{ color: 'var(--muted)' }}>
                        {h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h - 12}:00 PM`}
                      </td>
                      {weekDays.map(d => {
                        const booked = capacity[d]?.[h] || 0;
                        const free = Math.max(0, totalTrainers - booked);
                        const ratio = totalTrainers > 0 ? free / totalTrainers : 1;
                        const bg = ratio > 0.6 ? 'rgba(16,185,129,0.15)' : ratio > 0.2 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.1)';
                        const color = ratio > 0.6 ? '#34D399' : ratio > 0.2 ? '#FCD34D' : '#F87171';
                        return (
                          <td key={d} className="p-3 border-l font-bold" style={{ borderColor: 'var(--border)', background: bg, color }}>
                            {free} Free
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

        {/* ── MONTHLY / ROSTER ─────────────────────────── */}
        {view === 'monthly' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'Active Trainers', value: trainers.length, icon: Users },
                { label: 'Today\'s Sessions', value: sessions.filter(s => s.status === 'scheduled').length, icon: CalendarDays },
                { label: 'Cancelled Today', value: sessions.filter(s => s.status === 'cancelled').length, icon: X },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="glass rounded-2xl p-6 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)' }}>
                    <Icon size={22} style={{ color: 'var(--brand-light)' }} />
                  </div>
                  <div>
                    <p className="text-3xl font-extrabold text-white">{value}</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>{label}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="glass rounded-2xl overflow-hidden">
              <div className="p-4 border-b font-bold text-white" style={{ borderColor: 'var(--border)' }}>Trainer Roster</div>
              {trainers.map(t => (
                <div key={t.id} className="flex items-center justify-between p-4 border-b hover:bg-white/[0.01] transition-colors" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ background: 'linear-gradient(135deg,#7C3AED,#A78BFA)' }}>
                      {t.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{t.name}</p>
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>{t.email}</p>
                    </div>
                  </div>
                  <span className="badge badge-brand">{t.upcoming_sessions} upcoming</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Trainer Modal */}
      {showAddTrainer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="glass rounded-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-white">Create Trainer Account</h2>
              <button onClick={() => setShowAddTrainer(false)} className="p-1.5 rounded-lg hover:bg-white/10"><X size={18} /></button>
            </div>
            <div><label className="label">Full Name</label><input type="text" className="glass-input" placeholder="e.g. Alex Rodrigues" value={trainerName} onChange={e => setTrainerName(e.target.value)} /></div>
            <div><label className="label">Email</label><input type="email" className="glass-input" placeholder="trainer@email.com" value={trainerEmail} onChange={e => setTrainerEmail(e.target.value)} /></div>
            <div><label className="label">Password</label><input type="password" className="glass-input" placeholder="Temporary password" value={trainerPass} onChange={e => setTrainerPass(e.target.value)} /></div>
            <div><label className="label">Phone (optional)</label><input type="tel" className="glass-input" placeholder="+91 ..." value={trainerPhone} onChange={e => setTrainerPhone(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <button className="btn-ghost" onClick={() => setShowAddTrainer(false)}>Cancel</button>
              <button className="btn-brand" onClick={handleAddTrainer} disabled={formLoading || !trainerName || !trainerEmail || !trainerPass}>
                {formLoading ? 'Creating…' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
