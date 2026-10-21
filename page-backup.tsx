
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  CarFront, Wallet, Clock3, Users, LayoutDashboard,
  ContactRound, LogOut, Plus, RefreshCw, ArrowLeft
} from 'lucide-react';

type Tenant = {
  id: string;
  tenant_code: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  organization: string | null;
  monthly_rate_rwf: number;
  credit_allowed: boolean;
  credit_limit_rwf: number;
  status: string;
};

type Vehicle = {
  id: string;
  tenant_id: string | null;
  plate_number: string;
  vehicle_type: string;
  make_model: string | null;
  color: string | null;
  status: string;
};

type Profile = { full_name: string | null; role: string };

type ParkingSession = {
  id: string;
  session_number: string;
  vehicle_id: string;
  tenant_id: string | null;
  started_at: string;
  ended_at: string | null;
  fee_rwf: number | null;
  status: string;
};

function calculateParkingFee(start: string, end: string): number {
  const startTime = new Date(start);
  const endTime = new Date(end);
  const minutes = Math.max(
    0,
    Math.ceil((endTime.getTime() - startTime.getTime()) / 60000)
  );

  // A session that crosses into another calendar day is charged overnight.
  const crossesDay =
    startTime.getFullYear() !== endTime.getFullYear() ||
    startTime.getMonth() !== endTime.getMonth() ||
    startTime.getDate() !== endTime.getDate();

  if (crossesDay) return 20000;
  if (minutes <= 15) return 0;
  if (minutes <= 60) return 400;
  if (minutes <= 120) return 800;
  if (minutes <= 180) return 1200;
  if (minutes <= 240) return 2000;
  if (minutes <= 300) return 4000;
  if (minutes <= 360) return 6000;
  if (minutes <= 480) return 8000;
  return 10000;
}

const money = (n: number) =>
  new Intl.NumberFormat('en-RW', {
    style: 'currency', currency: 'RWF', maximumFractionDigits: 0
  }).format(n);

export default function Home() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [section, setSection] = useState('dashboard');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [parkingSessions, setParkingSessions] = useState<ParkingSession[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [arrivalTime, setArrivalTime] = useState(() => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
});
  const [collected, setCollected] = useState(0);
  const [debt, setDebt] = useState(0);
  const [todaySessions, setTodaySessions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [showTenantForm, setShowTenantForm] = useState(false);
  const [showVehicleForm, setShowVehicleForm] = useState(false);

  const [tenantForm, setTenantForm] = useState({
    tenant_code: '',
    full_name: '',
    phone: '',
    email: '',
    organization: '',
    monthly_rate_rwf: '0',
    credit_allowed: false,
    credit_limit_rwf: '0',
  });

  const [vehicleForm, setVehicleForm] = useState({
    tenant_id: '',
    plate_number: '',
    vehicle_type: 'car',
    make_model: '',
    color: '',
  });

  async function loadData() {
    if (!supabase) {
      setError('Supabase is not configured. Check your .env.local file.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    const { data: auth, error: authError } = await supabase.auth.getUser();

    if (authError || !auth.user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const { data: p, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', auth.user.id)
      .maybeSingle();

    if (profileError) {
      setError('Could not load your staff profile: ' + profileError.message);
    }

    setProfile(p ?? {
      full_name: auth.user.email ?? 'Staff member',
      role: 'cashier',
    });

    const [tenantResult, vehicleResult, paymentResult, invoiceResult, sessionResult, parkingResult] =
  await Promise.all([
    supabase.from('tenants').select('*').order('created_at', { ascending: false }),
    supabase.from('vehicles').select('*').order('created_at', { ascending: false }),
    supabase.from('payments').select('amount_rwf')
      .eq('status', 'posted')
      .gte('paid_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
      .lte('paid_at', new Date(new Date().setHours(23, 59, 59, 999)).toISOString()),
    supabase.from('invoices').select('total_rwf, paid_rwf')
      .in('status', ['open', 'partial', 'overdue']),
    supabase.from('parking_sessions').select('id', { count: 'exact', head: true })
      .gte('started_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
      .lte('started_at', new Date(new Date().setHours(23, 59, 59, 999)).toISOString()),
    supabase.from('parking_sessions').select(
      'id, session_number, vehicle_id, tenant_id, started_at, ended_at, fee_rwf, status'
    ).order('started_at', { ascending: false }),
  ]);

    if (tenantResult.error) setError('Could not load tenants: ' + tenantResult.error.message);
    if (vehicleResult.error) setError('Could not load vehicles: ' + vehicleResult.error.message);

    setTenants((tenantResult.data ?? []) as Tenant[]);
    setVehicles((vehicleResult.data ?? []) as Vehicle[]);
    if (parkingResult.error) {
  setError('Could not load parking sessions: ' + parkingResult.error.message);
}
setParkingSessions((parkingResult.data ?? []) as ParkingSession[]);
    setCollected((paymentResult.data ?? []).reduce((sum, p) => sum + Number(p.amount_rwf), 0));
    setDebt((invoiceResult.data ?? []).reduce(
      (sum, i) => sum + Math.max(0, Number(i.total_rwf) - Number(i.paid_rwf)), 0
    ));
    setTodaySessions(sessionResult.count ?? 0);
    setLoading(false);
  }

  useEffect(() => { void loadData(); }, []);

  async function addTenant(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase || !profile) return;

    const code = tenantForm.tenant_code.trim().toUpperCase();
    const name = tenantForm.full_name.trim();
    const rate = Number(tenantForm.monthly_rate_rwf);
    const limit = Number(tenantForm.credit_limit_rwf);

    if (!code || !name || !Number.isFinite(rate) || rate < 0 ||
        !Number.isFinite(limit) || limit < 0) {
      setError('Enter a tenant code, full name, and valid non-negative amounts.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');

    const { error: insertError } = await supabase.from('tenants').insert({
      tenant_code: code,
      full_name: name,
      phone: tenantForm.phone.trim() || null,
      email: tenantForm.email.trim() || null,
      organization: tenantForm.organization.trim() || null,
      monthly_rate_rwf: Math.round(rate),
      credit_allowed: tenantForm.credit_allowed,
      credit_limit_rwf: Math.round(limit),
      created_by: (await supabase.auth.getUser()).data.user?.id,
    });

    setSaving(false);

    if (insertError) {
      setError('Tenant was not saved: ' + insertError.message);
      return;
    }

    setNotice('Tenant saved successfully.');
    setTenantForm({
      tenant_code: '', full_name: '', phone: '', email: '',
      organization: '', monthly_rate_rwf: '0',
      credit_allowed: false, credit_limit_rwf: '0',
    });
    setShowTenantForm(false);
    await loadData();
  }

  async function addVehicle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;

    const plate = vehicleForm.plate_number.trim().toUpperCase();
    if (!plate) {
      setError('Enter the vehicle plate number.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setSaving(false);
      setError('Please sign in again.');
      return;
    }

    const { error: insertError } = await supabase.from('vehicles').insert({
      tenant_id: vehicleForm.tenant_id || null,
      plate_number: plate,
      vehicle_type: vehicleForm.vehicle_type,
      make_model: vehicleForm.make_model.trim() || null,
      color: vehicleForm.color.trim() || null,
      created_by: auth.user.id,
    });

    setSaving(false);

    if (insertError) {
      setError('Vehicle was not saved: ' + insertError.message);
      return;
    }

    setNotice('Vehicle saved successfully.');
    setVehicleForm({
      tenant_id: '', plate_number: '', vehicle_type: 'car',
      make_model: '', color: '',
    });
    setShowVehicleForm(false);
    await loadData();
  }

  async function startParkingSession(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();

  if (!supabase || !selectedVehicle) {
    setError('Please select a vehicle.');
    return;
  }

  const vehicle = vehicles.find(v => v.id === selectedVehicle);
  if (!vehicle) {
    setError('Selected vehicle was not found. Refresh and try again.');
    return;
  }

  if (parkingSessions.some(
    s => s.vehicle_id === vehicle.id && s.status === 'open'
  )) {
    setError('This vehicle already has an open parking session.');
    return;
  }

  setSaving(true);
  setError('');
  setNotice('');

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    setSaving(false);
    setError('Please sign in again.');
    return;
  }

  const enteredArrivalTime = new Date(arrivalTime);

if (Number.isNaN(enteredArrivalTime.getTime())) {
  setSaving(false);
  setError('Please enter a valid arrival date and time.');
  return;
}

if (enteredArrivalTime.getTime() > Date.now()) {
  setSaving(false);
  setError('Arrival time cannot be in the future.');
  return;
}

const { error: insertError } = await supabase.from('parking_sessions').insert({
  vehicle_id: vehicle.id,
  tenant_id: vehicle.tenant_id,
  started_at: enteredArrivalTime.toISOString(),
  fee_rwf: 0,
  created_by: auth.user.id,
  status: 'open',
});
  setSaving(false);

  if (insertError) {
    setError('Could not start parking session: ' + insertError.message);
    return;
  }

  setSelectedVehicle('');
  setNotice('Parking session started successfully.');
  await loadData();
}

async function closeParkingSession(session: ParkingSession) {
  if (!supabase) return;

  const confirmed = window.confirm(
    'Close this parking session and calculate its fee?'
  );
  if (!confirmed) return;

  setSaving(true);
  setError('');
  setNotice('');

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    setSaving(false);
    setError('Please sign in again.');
    return;
  }

  const endTime = new Date();
  const fee = calculateParkingFee(session.started_at, endTime.toISOString());

  const { error: updateError } = await supabase
    .from('parking_sessions')
    .update({
      ended_at: endTime.toISOString(),
      fee_rwf: fee,
      status: 'closed',
      closed_by: auth.user.id,
    })
    .eq('id', session.id)
    .eq('status', 'open');

  setSaving(false);

  if (updateError) {
    setError('Could not close parking session: ' + updateError.message);
    return;
  }

  setNotice(`Parking session closed. Calculated fee: ${money(fee)}.`);
  await loadData();
}

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setProfile(null);
  }

  if (!supabase) {
    return <main className="setup"><div className="setup-card">
      <h1>Parking Manager</h1>
      <p>Supabase is not configured. Check .env.local and restart the app.</p>
    </div></main>;
  }

  if (!profile && !loading) {
    return <main className="setup"><div className="setup-card">
      <h1>Parking Manager</h1>
      <p>Your session is not available. Refresh the page and sign in again.</p>
      <button className="primary full" onClick={() => window.location.reload()}>Reload and sign in</button>
    </div></main>;
  }

  const nav = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'parking-sessions', label: 'Parking sessions', icon: CarFront },
    { id: 'tenants-vehicles', label: 'Tenants & vehicles', icon: ContactRound },
    { id: 'invoices-debts', label: 'Invoices & debts', icon: Clock3 },
    { id: 'payments', label: 'Payments', icon: Wallet },
    { id: 'reports', label: 'Reports', icon: Users },
    { id: 'settings', label: 'Settings', icon: LayoutDashboard },
  ];

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon"><CarFront /></div>
        <div><b>Parking Manager</b><span>PAYMENTS & TENANTS</span></div>
      </div>
      <nav>
        {nav.map(({ id, label, icon: Icon }) =>
          <button type="button" key={id}
            className={section === id ? 'nav-link active' : 'nav-link'}
            onClick={() => {
              setSection(id);
              setError('');
              setNotice('');
              setShowTenantForm(false);
              setShowVehicleForm(false);
            }}>
            <Icon size={18} />{label}
          </button>
        )}
      </nav>
      <div className="sidebar-bottom"><Users size={17} />
        <span>Staff access protected<br /><small>Activity is auditable</small></span>
      </div>
    </aside>

    <section className="main">
      <header className="topbar">
        <div><span className="eyebrow">PARKING OPERATIONS</span>
          <h1>{nav.find(n => n.id === section)?.label ?? 'Dashboard'}</h1></div>
        <div className="user-area">
          <div className="avatar">{(profile?.full_name ?? 'S').slice(0, 1).toUpperCase()}</div>
          <div className="user-text"><b>{profile?.full_name ?? 'Staff member'}</b>
            <span>{profile?.role ?? ''}</span></div>
          <button className="quiet" onClick={signOut} title="Sign out"><LogOut size={17} /></button>
        </div>
      </header>

      <div className="content">
        {error && <div className="alert"><div><b>Something went wrong</b><p>{error}</p></div></div>}
        {notice && <p className="live">{notice}</p>}

        {section === 'dashboard' && <>
          <div className="welcome"><div><h2>Good day{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}.</h2>
            <p>Here is the latest overview of your parking operation.</p></div>
            <button className="secondary" onClick={() => void loadData()}><RefreshCw size={15} /> Refresh data</button></div>
          <div className="cards">
            {[
              { label: 'Collected today', value: money(collected), icon: Wallet },
              { label: 'Outstanding balance', value: money(debt), icon: Clock3 },
              { label: 'Vehicles today', value: String(todaySessions), icon: CarFront },
              { label: 'Active tenants', value: String(tenants.filter(t => t.status === 'active').length), icon: Users },
            ].map(({ label, value, icon: Icon }) =>
              <article className="metric" key={label}><div className="metric-top"><span>{label}</span>
                <span className="metric-icon"><Icon size={19} /></span></div>
                <strong>{loading ? '…' : value}</strong></article>
            )}
          </div>
          <article className="panel" style={{ marginTop: 24 }}>
            <h2>Quick actions</h2>
            <p>Use Tenants & vehicles to register monthly tenants and their vehicles.</p>
            <button className="primary" onClick={() => setSection('tenants-vehicles')}>Open Tenants & vehicles</button>
          </article>
        </>}

        {section === 'tenants-vehicles' && <>
          <div className="welcome"><div><h2>Tenants & vehicles</h2>
            <p>Register and review monthly tenants and their vehicles.</p></div>
            <button className="secondary" onClick={() => void loadData()}><RefreshCw size={15} /> Refresh</button>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <button className="primary" onClick={() => { setShowTenantForm(!showTenantForm); setShowVehicleForm(false); }}>
              <Plus size={16} /> Add tenant
            </button>
            <button className="secondary" onClick={() => { setShowVehicleForm(!showVehicleForm); setShowTenantForm(false); }}>
              <Plus size={16} /> Add vehicle
            </button>
          </div>

          {showTenantForm && <form className="panel" onSubmit={addTenant}>
            <h2>Register tenant</h2>
            <div className="form-grid">
              <label>Tenant code *<input required value={tenantForm.tenant_code} onChange={e => setTenantForm({ ...tenantForm, tenant_code: e.target.value })} placeholder="e.g. TEN-001" /></label>
              <label>Full name *<input required value={tenantForm.full_name} onChange={e => setTenantForm({ ...tenantForm, full_name: e.target.value })} placeholder="Tenant full name" /></label>
              <label>Phone<input value={tenantForm.phone} onChange={e => setTenantForm({ ...tenantForm, phone: e.target.value })} /></label>
              <label>Email<input type="email" value={tenantForm.email} onChange={e => setTenantForm({ ...tenantForm, email: e.target.value })} /></label>
              <label>Organization<input value={tenantForm.organization} onChange={e => setTenantForm({ ...tenantForm, organization: e.target.value })} /></label>
              <label>Monthly rate (RWF)<input type="number" min="0" step="1" required value={tenantForm.monthly_rate_rwf} onChange={e => setTenantForm({ ...tenantForm, monthly_rate_rwf: e.target.value })} /></label>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
              <input type="checkbox" checked={tenantForm.credit_allowed} onChange={e => setTenantForm({ ...tenantForm, credit_allowed: e.target.checked })} />
              Allow pay-later / credit for this tenant
            </label>
            <label style={{ marginTop: 12 }}>Credit limit (RWF)
              <input type="number" min="0" step="1" value={tenantForm.credit_limit_rwf} onChange={e => setTenantForm({ ...tenantForm, credit_limit_rwf: e.target.value })} />
            </label>
            <p className="muted small">Credit approval does not itself authorize a pay-later charge. Staff permissions must also allow it.</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="primary" disabled={saving} type="submit">{saving ? 'Saving…' : 'Save tenant'}</button>
              <button className="secondary" type="button" onClick={() => setShowTenantForm(false)}>Cancel</button>
            </div>
          </form>}

          {showVehicleForm && <form className="panel" onSubmit={addVehicle}>
            <h2>Register vehicle</h2>
            <div className="form-grid">
              <label>Plate number *<input required value={vehicleForm.plate_number} onChange={e => setVehicleForm({ ...vehicleForm, plate_number: e.target.value })} placeholder="e.g. RAA 123 A" /></label>
              <label>Tenant (optional)
                <select value={vehicleForm.tenant_id} onChange={e => setVehicleForm({ ...vehicleForm, tenant_id: e.target.value })}>
                  <option value="">No tenant / daily parking</option>
                  {tenants.filter(t => t.status === 'active').map(t => <option key={t.id} value={t.id}>{t.tenant_code} — {t.full_name}</option>)}
                </select>
              </label>
              <label>Vehicle type<select value={vehicleForm.vehicle_type} onChange={e => setVehicleForm({ ...vehicleForm, vehicle_type: e.target.value })}>
                <option value="car">Car</option><option value="motorcycle">Motorcycle</option><option value="truck">Truck</option><option value="van">Van</option><option value="other">Other</option>
              </select></label>
              <label>Make / model<input value={vehicleForm.make_model} onChange={e => setVehicleForm({ ...vehicleForm, make_model: e.target.value })} placeholder="e.g. Toyota Corolla" /></label>
              <label>Color<input value={vehicleForm.color} onChange={e => setVehicleForm({ ...vehicleForm, color: e.target.value })} /></label>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="primary" disabled={saving} type="submit">{saving ? 'Saving…' : 'Save vehicle'}</button>
              <button className="secondary" type="button" onClick={() => setShowVehicleForm(false)}>Cancel</button>
            </div>
          </form>}

          <article className="panel" style={{ marginBottom: 20 }}>
            <h2>Registered tenants ({tenants.length})</h2>
            {loading ? <p>Loading tenants…</p> : tenants.length === 0 ? <p className="muted">No tenants registered yet. Choose “Add tenant” to create the first record.</p> :
              <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Code', 'Name', 'Phone', 'Monthly rate', 'Credit', 'Status'].map(h => <th key={h} style={{ textAlign: 'left', padding: 10 }}>{h}</th>)}</tr></thead>
                <tbody>{tenants.map(t => <tr key={t.id}>
                  <td style={{ padding: 10 }}>{t.tenant_code}</td><td style={{ padding: 10 }}>{t.full_name}</td>
                  <td style={{ padding: 10 }}>{t.phone || '—'}</td><td style={{ padding: 10 }}>{money(Number(t.monthly_rate_rwf))}</td>
                  <td style={{ padding: 10 }}>{t.credit_allowed ? 'Allowed' : 'Not allowed'}</td><td style={{ padding: 10 }}>{t.status}</td>
                </tr>)}</tbody>
              </table></div>}
          </article>

          <article className="panel">
            <h2>Registered vehicles ({vehicles.length})</h2>
            {loading ? <p>Loading vehicles…</p> : vehicles.length === 0 ? <p className="muted">No vehicles registered yet. Choose “Add vehicle” to create the first record.</p> :
              <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Plate number', 'Type', 'Make / model', 'Color', 'Tenant', 'Status'].map(h => <th key={h} style={{ textAlign: 'left', padding: 10 }}>{h}</th>)}</tr></thead>
                <tbody>{vehicles.map(v => <tr key={v.id}>
                  <td style={{ padding: 10 }}>{v.plate_number}</td><td style={{ padding: 10 }}>{v.vehicle_type}</td>
                  <td style={{ padding: 10 }}>{v.make_model || '—'}</td><td style={{ padding: 10 }}>{v.color || '—'}</td>
                  <td style={{ padding: 10 }}>{tenants.find(t => t.id === v.tenant_id)?.full_name || '—'}</td>
                  <td style={{ padding: 10 }}>{v.status}</td>
                </tr>)}</tbody>
              </table></div>}
          </article>
        </>}

        
{section === 'parking-sessions' && <>
  <div className="welcome">
    <div>
      <h2>Parking sessions</h2>
      <p>Start parking sessions, track vehicles, and calculate fees.</p>
    </div>
    <button className="secondary" onClick={() => void loadData()}>
      <RefreshCw size={15} /> Refresh
    </button>
  </div>

  <form className="panel" onSubmit={startParkingSession}>
    <h2>Start a parking session</h2>
    <label style={{ display: 'block', marginBottom: 16 }}>
  Actual arrival date and time *
  <input
    type="datetime-local"
    required
    value={arrivalTime}
    max={(() => {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      return now.toISOString().slice(0, 16);
    })()}
    onChange={e => setArrivalTime(e.target.value)}
  />
</label>
    <label>
      Select registered vehicle *
      <select
        required
        value={selectedVehicle}
        onChange={e => setSelectedVehicle(e.target.value)}
      >
        <option value="">Choose a vehicle</option>
        {vehicles
          .filter(v =>
            v.status === 'active' &&
            !parkingSessions.some(
              s => s.vehicle_id === v.id && s.status === 'open'
            )
          )
          .map(v => (
            <option key={v.id} value={v.id}>
              {v.plate_number} — {v.vehicle_type}
            </option>
          ))}
      </select>
    </label>
    <p className="muted small">
      The session starts when you press the button.
    </p>
    <button className="primary" type="submit" disabled={saving}>
      {saving ? 'Saving…' : 'Start session'}
    </button>
  </form>

  <article className="panel" style={{ marginTop: 20 }}>
    <h2>Parking session records ({parkingSessions.length})</h2>
    {loading ? <p>Loading sessions…</p> :
      parkingSessions.length === 0 ? (
        <p className="muted">No parking sessions yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Session', 'Plate', 'Started', 'Status', 'Fee', 'Action'].map(h =>
                  <th key={h} style={{ textAlign: 'left', padding: 10 }}>{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {parkingSessions.map(s => {
                const vehicle = vehicles.find(v => v.id === s.vehicle_id);
                return (
                  <tr key={s.id}>
                    <td style={{ padding: 10 }}>{s.session_number}</td>
                    <td style={{ padding: 10 }}>{vehicle?.plate_number ?? 'Unknown vehicle'}</td>
                    <td style={{ padding: 10 }}>
                      {new Date(s.started_at).toLocaleString()}
                    </td>
                    <td style={{ padding: 10 }}>{s.status}</td>
                    <td style={{ padding: 10 }}>
                      {s.fee_rwf == null ? '—' : money(Number(s.fee_rwf))}
                    </td>
                    <td style={{ padding: 10 }}>
                      {s.status === 'open' && (
                        <button
                          className="primary"
                          disabled={saving}
                          onClick={() => void closeParkingSession(s)}
                        >
                          Close session
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
  </article>
</>}
{!['dashboard', 'tenants-vehicles', 'parking-sessions'].includes(section) && (
  <article className="panel">
    <h2>{nav.find(n => n.id === section)?.label}</h2>
    <p>This section has not been implemented yet. We will build and test it next.</p>
    <button className="primary" onClick={() => setSection('tenants-vehicles')}>
      Go to Tenants & vehicles
    </button>
  </article>
)}


        <footer>Parking Manager · Currency: RWF · Development build</footer>
      </div>
    </section>
  </main>;
}
