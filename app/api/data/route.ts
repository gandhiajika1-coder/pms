import { getStaff } from '@/lib/auth';
import { query } from '@/lib/db';
import type { RowDataPacket } from 'mysql2/promise';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const profile = await getStaff();
  if (!profile) return Response.json({ error: 'Please sign in.' }, { status: 401 });

  const [tenants, vehicles, payments, invoices, today, sessions, paymentRows] = await Promise.all([
    query('select * from tenants order by created_at desc'),
    query('select * from vehicles order by created_at desc'),
    query<RowDataPacket & { amount_rwf: string }>(
      `select coalesce(sum(amount_rwf), 0) as amount_rwf from payments
       where status = 'posted' and paid_at >= current_date and paid_at < current_date + interval 1 day`,
    ),
    query(`select id, invoice_number, tenant_id, vehicle_id, parking_session_id, invoice_type,
       issued_at, due_at, description, total_rwf, paid_rwf, status from invoices
       where status <> 'void' order by issued_at desc`),
    query<RowDataPacket & { count: number }>(
      `select count(*) as count from parking_sessions
       where started_at >= current_date and started_at < current_date + interval 1 day`,
    ),
    query(`select id, session_number, vehicle_id, tenant_id, started_at, ended_at, fee_rwf, status, invoice_id
       from parking_sessions order by started_at desc`),
    query(`select id, receipt_number, tenant_id, amount_rwf, method, reference_number, paid_at
       from payments where status = 'posted' order by paid_at desc`),
  ]);

  const debt = invoices.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total_rwf) - Number(invoice.paid_rwf)), 0);
  return Response.json({
    tenants,
    vehicles,
    invoices,
    sessions,
    payments: paymentRows,
    collected: Number(payments[0]?.amount_rwf ?? 0),
    debt,
    todaySessions: Number(today[0]?.count ?? 0),
  });
}
