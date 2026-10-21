import { getStaff } from '@/lib/auth';
import { query } from '@/lib/db';
import type { RowDataPacket } from 'mysql2/promise';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function GET(request: Request) {
  const staff = await getStaff();
  if (!staff) return Response.json({ error: 'Please sign in.' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const start = params.get('start');
  const end = params.get('end');
  if (!validDate(start) || !validDate(end) || start > end) {
    return Response.json({ error: 'Choose a valid start date and end date.' }, { status: 400 });
  }

  const [paymentTotals, closedSessions, invoiceTotals, outstandingRows, methods, recentPayments, issuedInvoices, closedSessionRows, outstandingInvoices] = await Promise.all([
    query<RowDataPacket>(
      `select count(*) as count, coalesce(sum(amount_rwf), 0) as amount_rwf from payments
       where status = 'posted' and paid_at >= ? and paid_at < date_add(?, interval 1 day)`, [start, end],
    ),
    query<RowDataPacket>(
      `select count(*) as count, coalesce(sum(fee_rwf), 0) as fee_rwf from parking_sessions
       where status = 'closed' and ended_at >= ? and ended_at < date_add(?, interval 1 day)`, [start, end],
    ),
    query<RowDataPacket>(
      `select count(*) as count, coalesce(sum(total_rwf), 0) as total_rwf from invoices
       where status <> 'void' and issued_at >= ? and issued_at < date_add(?, interval 1 day)`, [start, end],
    ),
    query<RowDataPacket>(
      `select coalesce(sum(total_rwf - paid_rwf), 0) as balance_rwf from invoices
       where status in ('open','partial','overdue')`,
    ),
    query<RowDataPacket>(
      `select method, count(*) as count, coalesce(sum(amount_rwf), 0) as amount_rwf from payments
       where status = 'posted' and paid_at >= ? and paid_at < date_add(?, interval 1 day)
       group by method order by amount_rwf desc`, [start, end],
    ),
    query<RowDataPacket>(
      `select receipt_number, amount_rwf, method, reference_number, paid_at from payments
       where status = 'posted' and paid_at >= ? and paid_at < date_add(?, interval 1 day)
       order by paid_at desc`, [start, end],
    ),
    query<RowDataPacket>(
      `select invoice_number, invoice_type, description, total_rwf, paid_rwf, status, issued_at
       from invoices where status <> 'void' and issued_at >= ? and issued_at < date_add(?, interval 1 day)
       order by issued_at desc`, [start, end],
    ),
    query<RowDataPacket>(
      `select s.session_number, v.plate_number, s.started_at, s.ended_at, s.fee_rwf
       from parking_sessions s join vehicles v on v.id = s.vehicle_id
       where s.status = 'closed' and s.ended_at >= ? and s.ended_at < date_add(?, interval 1 day)
       order by s.ended_at desc`, [start, end],
    ),
    query<RowDataPacket>(
      `select invoice_number, invoice_type, description, total_rwf, paid_rwf, status, due_at
       from invoices where status in ('open','partial','overdue') and total_rwf > paid_rwf
       order by due_at asc, issued_at desc`,
    ),
  ]);

  return Response.json({
    start,
    end,
    summary: {
      payments_count: Number(paymentTotals[0]?.count ?? 0),
      collected_rwf: Number(paymentTotals[0]?.amount_rwf ?? 0),
      closed_sessions: Number(closedSessions[0]?.count ?? 0),
      session_fees_rwf: Number(closedSessions[0]?.fee_rwf ?? 0),
      invoices_count: Number(invoiceTotals[0]?.count ?? 0),
      invoiced_rwf: Number(invoiceTotals[0]?.total_rwf ?? 0),
      current_outstanding_rwf: Number(outstandingRows[0]?.balance_rwf ?? 0),
    },
    methods,
    recent_payments: recentPayments,
    issued_invoices: issuedInvoices,
    closed_session_rows: closedSessionRows,
    outstanding_invoices: outstandingInvoices,
  });
}
