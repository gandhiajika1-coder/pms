
'use client';

import { useEffect, useState } from 'react';
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

type Invoice = {
  id: string;
  invoice_number: string;
  tenant_id: string | null;
  vehicle_id: string | null;
  parking_session_id: string | null;
  invoice_type: string;
  issued_at: string;
  due_at: string | null;
  description: string | null;
  total_rwf: number;
  paid_rwf: number;
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
  invoice_id?: string | null;
};

type Payment = {
  id: string; receipt_number: string; tenant_id: string | null; amount_rwf: number;
  method: string; reference_number: string | null; paid_at: string;
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

async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
  return body as T;
}

export default function Home() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [section, setSection] = useState('dashboard');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [parkingSessions, setParkingSessions] = useState<ParkingSession[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentForm, setPaymentForm] = useState({ invoice_id: '', amount_rwf: '', method: 'cash', reference_number: '' });
  const [invoiceSessionId, setInvoiceSessionId] = useState('');
  const [invoicePayLater, setInvoicePayLater] = useState(false);
  const [invoiceMethod, setInvoiceMethod] = useState('cash');
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
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

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
    setLoading(true);
    setError('');
    try {
      const session = await api<{ profile: Profile | null }>('/api/auth/session');
      setProfile(session.profile);
      if (!session.profile) return;
      const data = await api<{
        tenants: Tenant[]; vehicles: Vehicle[]; invoices: Invoice[]; sessions: ParkingSession[]; payments: Payment[];
        collected: number; debt: number; todaySessions: number;
      }>('/api/data');
      setTenants(data.tenants);
      setVehicles(data.vehicles);
      setInvoices(data.invoices);
      setParkingSessions(data.sessions);
      setPayments(data.payments);
      setCollected(data.collected);
      setDebt(data.debt);
      setTodaySessions(data.todaySessions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load parking data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(); }, []);

  async function addTenant(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

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

    try {
      await api('/api/tenants', { method: 'POST', body: JSON.stringify({
        tenant_code: code, full_name: name,
        phone: tenantForm.phone.trim() || null,
        email: tenantForm.email.trim() || null,
        organization: tenantForm.organization.trim() || null,
        monthly_rate_rwf: Math.round(rate),
        credit_allowed: tenantForm.credit_allowed,
        credit_limit_rwf: Math.round(limit),
      }) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Tenant was not saved.');
      return;
    } finally {
      setSaving(false);
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

    const plate = vehicleForm.plate_number.trim().toUpperCase();
    if (!plate) {
      setError('Enter the vehicle plate number.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');

    try {
      await api('/api/vehicles', { method: 'POST', body: JSON.stringify({
        tenant_id: vehicleForm.tenant_id || null,
        plate_number: plate,
        vehicle_type: vehicleForm.vehicle_type,
        make_model: vehicleForm.make_model.trim() || null,
        color: vehicleForm.color.trim() || null,
      }) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Vehicle was not saved.');
      return;
    } finally {
      setSaving(false);
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

  if (!selectedVehicle) {
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

try {
  await api('/api/sessions', { method: 'POST', body: JSON.stringify({
    vehicle_id: vehicle.id,
    started_at: enteredArrivalTime.toISOString(),
  }) });
} catch (cause) {
  setError(cause instanceof Error ? cause.message : 'Could not start parking session.');
  return;
} finally {
  setSaving(false);
}

  setSelectedVehicle('');
  setNotice('Parking session started successfully.');
  await loadData();
}

async function closeParkingSession(session: ParkingSession) {
  const confirmed = window.confirm(
    'Close this parking session and calculate its fee?'
  );
  if (!confirmed) return;

  setSaving(true);
  setError('');
  setNotice('');

  const endTime = new Date();
  const fee = calculateParkingFee(session.started_at, endTime.toISOString());
  try {
    await api(`/api/sessions/${session.id}`, {
      method: 'PATCH', body: JSON.stringify({ fee_rwf: fee }),
    });
  } catch (cause) {
    setError(cause instanceof Error ? cause.message : 'Could not close parking session.');
    return;
  } finally {
    setSaving(false);
  }

  setNotice(`Parking session closed. Calculated fee: ${money(fee)}.`);
  await loadData();
}

async function createInvoice(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  setSaving(true); setError(''); setNotice('');
  try {
    await api('/api/invoices', { method: 'POST', body: JSON.stringify({
      session_id: invoiceSessionId, pay_later: invoicePayLater, method: invoicePayLater ? undefined : invoiceMethod,
    }) });
    setNotice(invoicePayLater ? 'Invoice created with approved pay later.' : 'Invoice created and payment recorded.');
    setInvoiceSessionId('');
    await loadData();
  } catch (cause) {
    setError(cause instanceof Error ? cause.message : 'Could not create invoice.');
  } finally { setSaving(false); }
}

async function recordPayment(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  setSaving(true); setError(''); setNotice('');
  try {
    await api('/api/payments', { method: 'POST', body: JSON.stringify({
      ...paymentForm, amount_rwf: Number(paymentForm.amount_rwf),
    }) });
    setNotice('Payment saved and allocated to the invoice.');
    setPaymentForm({ invoice_id: '', amount_rwf: '', method: 'cash', reference_number: '' });
    await loadData();
  } catch (cause) {
    setError(cause instanceof Error ? cause.message : 'Could not record payment.');
  } finally { setSaving(false); }
}

  async function signOut() {
    await api('/api/auth/session', { method: 'DELETE' });
    setProfile(null);
  }

  async function signIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: loginEmail, password: loginPassword }) });
      setLoginPassword('');
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in.');
    } finally {
      setSaving(false);
    }
  }

  if (!profile && loading) {
    return <main className="setup"><div className="setup-card"><h1>Parking Manager</h1><p>Connecting to your SQL database…</p></div></main>;
  }

  if (!profile) {
    return <main className="setup"><div className="setup-card">
      <h1>Parking Manager</h1>
      <p>Sign in with your staff account.</p>
      {error && <div className="notice error">{error}</div>}
      <form onSubmit={signIn}>
        <label>Email<input type="email" autoComplete="username" required value={loginEmail} onChange={e => setLoginEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" required value={loginPassword} onChange={e => setLoginPassword(e.target.value)} /></label>
        <button className="primary full" disabled={saving} type="submit">{saving ? 'Signing in…' : 'Sign in'}</button>
      </form>
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


{section === 'invoices-debts' && (
  <>
  <article className="panel">
    <h2>Invoices & debts</h2>
    <p>Create an invoice from a closed parking session. Choosing a payment method records full payment immediately.</p>

    <form onSubmit={createInvoice} className="form-grid" style={{ margin: '18px 0 28px' }}>
      <label>Closed session
        <select required value={invoiceSessionId} onChange={e => setInvoiceSessionId(e.target.value)}>
          <option value="">Choose a session</option>
          {parkingSessions.filter(s => s.status === 'closed' && !s.invoice_id).map(s => {
            const vehicle = vehicles.find(v => v.id === s.vehicle_id);
            return <option key={s.id} value={s.id}>#{s.session_number} · {vehicle?.plate_number ?? 'Vehicle'} · {money(Number(s.fee_rwf ?? 0))}</option>;
          })}
        </select>
      </label>
      {!invoicePayLater && <label>Payment method
        <select value={invoiceMethod} onChange={e => setInvoiceMethod(e.target.value)}>
          <option value="cash">Cash</option><option value="mobile_money">Mobile money</option>
          <option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="other">Other</option>
        </select>
      </label>}
      <label className="check-label"><input type="checkbox" checked={invoicePayLater} onChange={e => setInvoicePayLater(e.target.checked)} /> Approve pay later (creates an outstanding balance)</label>
      {invoicePayLater && <p className="muted small">Pay later is subject to your staff permission and the tenant’s credit approval.</p>}
      <button className="primary" disabled={saving || !invoiceSessionId}>{saving ? 'Saving…' : invoicePayLater ? 'Create invoice with balance' : 'Create invoice and record payment'}</button>
    </form>

    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>Invoice number</th>
            <th>Type</th>
            <th>Total (RWF)</th>
            <th>Paid (RWF)</th>
            <th>Balance (RWF)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {invoices.length === 0 ? (
            <tr>
              <td colSpan={6}>No invoices found yet.</td>
            </tr>
          ) : (
            invoices.map(invoice => (
              <tr key={invoice.id}>
                <td>{invoice.invoice_number}</td>
                <td>{invoice.invoice_type}</td>
                <td>{Number(invoice.total_rwf).toLocaleString()}</td>
                <td>{Number(invoice.paid_rwf).toLocaleString()}</td>
                <td>
                  {Math.max(
                    0,
                    Number(invoice.total_rwf) - Number(invoice.paid_rwf)
                  ).toLocaleString()}
                </td>
                <td>{invoice.status}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>

  </article>
  </>
)}


{section === 'payments' && <>
  <article className="panel">
    <h2>Record a payment</h2>
    <p>Payments are linked to one invoice and cannot be more than its remaining balance.</p>
    <form onSubmit={recordPayment} className="form-grid" style={{ marginTop: 18 }}>
      <label>Invoice
        <select required value={paymentForm.invoice_id} onChange={e => {
          const invoice = invoices.find(i => i.id === e.target.value);
          setPaymentForm({ ...paymentForm, invoice_id: e.target.value, amount_rwf: invoice ? String(Number(invoice.total_rwf) - Number(invoice.paid_rwf)) : '' });
        }}>
          <option value="">Choose an unpaid invoice</option>
          {invoices.filter(i => ['open', 'partial', 'overdue'].includes(i.status) && Number(i.total_rwf) > Number(i.paid_rwf)).map(i => (
            <option key={i.id} value={i.id}>{i.invoice_number} · balance {money(Number(i.total_rwf) - Number(i.paid_rwf))}</option>
          ))}
        </select>
      </label>
      <label>Amount (RWF)<input required type="number" min="1" step="1" value={paymentForm.amount_rwf} onChange={e => setPaymentForm({ ...paymentForm, amount_rwf: e.target.value })} /></label>
      <label>Payment method<select value={paymentForm.method} onChange={e => setPaymentForm({ ...paymentForm, method: e.target.value })}>
        <option value="cash">Cash</option><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="other">Other</option>
      </select></label>
      <label>Reference number (optional)<input value={paymentForm.reference_number} onChange={e => setPaymentForm({ ...paymentForm, reference_number: e.target.value })} /></label>
      <button className="primary" disabled={saving || !paymentForm.invoice_id}>{saving ? 'Saving…' : 'Save payment'}</button>
    </form>
  </article>
  <article className="panel" style={{ marginTop: 18 }}>
    <h2>Recent payments</h2>
    <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Receipt</th><th>Amount</th><th>Method</th><th>Reference</th><th>Date</th></tr></thead>
      <tbody>{payments.length === 0 ? <tr><td colSpan={5}>No payments recorded yet.</td></tr> : payments.map(p => <tr key={p.id}>
        <td>{p.receipt_number}</td><td>{money(Number(p.amount_rwf))}</td><td>{p.method.replace('_', ' ')}</td><td>{p.reference_number || '—'}</td><td>{new Date(p.paid_at).toLocaleString()}</td>
      </tr>)}</tbody></table></div>
  </article>
</>}

{!['dashboard', 'tenants-vehicles', 'parking-sessions', 'invoices-debts', 'payments'].includes(section) && (
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
