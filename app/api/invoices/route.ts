import { getStaff } from '@/lib/auth';
import { withActor } from '@/lib/db';
import type { RowDataPacket } from 'mysql2/promise';

export const runtime = 'nodejs';

const methods = ['cash', 'mobile_money', 'bank_transfer', 'card', 'other'] as const;

export async function POST(request: Request) {
  const staff = await getStaff();
  if (!staff) return Response.json({ error: 'Please sign in.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const sessionId = typeof body.session_id === 'string' ? body.session_id : '';
  const payLater = body.pay_later === true;
  const method = methods.includes(body.method) ? body.method : null;
  if (body.invoice_type === 'monthly_tenant') {
    const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id : '';
    const period = typeof body.period === 'string' ? body.period : '';
    const match = /^(\d{4})-(\d{2})$/.exec(period);
    if (!tenantId || !match || (!payLater && !method)) {
      return Response.json({ error: 'Choose a tenant, billing month, and payment method, or select approved pay later.' }, { status: 400 });
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) return Response.json({ error: 'Choose a valid billing month.' }, { status: 400 });
    const periodStart = `${match[1]}-${match[2]}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const periodEnd = `${match[1]}-${match[2]}-${String(lastDay).padStart(2, '0')}`;
    try {
      const invoiceNumber = `INV-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      const receiptNumber = `RCT-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      await withActor(staff.id, async client => {
        const [tenantRows] = await client.query<RowDataPacket[]>(
          `select id, full_name, monthly_rate_rwf, credit_allowed, credit_limit_rwf, status
           from tenants where id = ? for update`, [tenantId],
        );
        const tenant = tenantRows[0];
        if (!tenant || tenant.status !== 'active') throw new Error('Choose an active tenant.');
        const [existing] = await client.query<RowDataPacket[]>(
          `select id from invoices where tenant_id = ? and invoice_type = 'monthly_tenant'
           and period_start = ? and period_end = ? and status <> 'void' limit 1`,
          [tenantId, periodStart, periodEnd],
        );
        if (existing.length) throw new Error('A monthly invoice already exists for this tenant and month.');
        const amount = Number(tenant.monthly_rate_rwf);
        const effectivePayLater = payLater && amount > 0;
        if (effectivePayLater && !(staff.role === 'admin' || staff.role === 'supervisor' || staff.can_authorize_credit)) {
          throw new Error('Your staff account cannot approve pay later.');
        }
        if (effectivePayLater && !tenant.credit_allowed) throw new Error('This tenant is not approved for credit.');
        if (effectivePayLater) {
          const [balanceRows] = await client.query<RowDataPacket[]>(
            `select coalesce(sum(total_rwf - paid_rwf), 0) as outstanding from invoices
             where tenant_id = ? and status in ('open','partial','overdue')`, [tenantId],
          );
          const creditLimit = Number(tenant.credit_limit_rwf ?? 0);
          if (Number(balanceRows[0]?.outstanding ?? 0) + amount > creditLimit) {
            throw new Error(`This invoice would exceed the tenant’s credit limit of ${creditLimit.toLocaleString()} RWF.`);
          }
        }
        const paid = effectivePayLater ? 0 : amount;
        const status = effectivePayLater ? 'open' : 'paid';
        const description = `Monthly parking · ${tenant.full_name} · ${period}`;
        await client.query(
          `insert into invoices (invoice_number, tenant_id, invoice_type, period_start, period_end,
           description, total_rwf, paid_rwf, status, due_at, pay_later_authorized_by,
           pay_later_authorized_at, created_by)
           values (?, ?, 'monthly_tenant', ?, ?, ?, ?, ?, ?,
           if(?, date_add(current_timestamp, interval 7 day), null), ?, if(?, current_timestamp, null), ?)`,
          [invoiceNumber, tenantId, periodStart, periodEnd, description, amount, paid, status,
            effectivePayLater, effectivePayLater ? staff.id : null, effectivePayLater, staff.id],
        );
        const [invoiceRows] = await client.query<RowDataPacket[]>(`select id from invoices where invoice_number = ?`, [invoiceNumber]);
        const invoiceId = invoiceRows[0]?.id;
        if (!invoiceId) throw new Error('Invoice was created but its ID could not be read.');
        if (!effectivePayLater && amount > 0) {
          await client.query(
            `insert into payments (receipt_number, tenant_id, amount_rwf, method, recorded_by)
             values (?, ?, ?, ?, ?)`, [receiptNumber, tenantId, amount, method, staff.id],
          );
          const [paymentRows] = await client.query<RowDataPacket[]>(`select id from payments where receipt_number = ?`, [receiptNumber]);
          await client.query(`insert into payment_allocations (payment_id, invoice_id, amount_rwf) values (?, ?, ?)`,
            [paymentRows[0].id, invoiceId, amount]);
        }
      });
      return Response.json({ ok: true }, { status: 201 });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'Could not create monthly invoice.' }, { status: 400 });
    }
  }
  if (!sessionId || (!payLater && !method)) {
    return Response.json({ error: 'Choose a closed session and a payment method, or select approved pay later.' }, { status: 400 });
  }
  try {
    const invoiceNumber = `INV-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const receiptNumber = `RCT-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    await withActor(staff.id, async client => {
      const [rows] = await client.query<RowDataPacket[]>(
        `select s.id, s.session_number, s.vehicle_id, s.tenant_id, s.fee_rwf,
                s.status, s.invoice_id, v.plate_number, t.credit_allowed, t.credit_limit_rwf
         from parking_sessions s join vehicles v on v.id = s.vehicle_id
         left join tenants t on t.id = s.tenant_id
         where s.id = ? for update`, [sessionId],
      );
      const session = rows[0];
      if (!session || session.status !== 'closed') throw new Error('Only closed parking sessions can be invoiced.');
      if (session.invoice_id) throw new Error('This parking session already has an invoice.');
      const amount = Number(session.fee_rwf);
      const effectivePayLater = payLater && amount > 0;
      if (effectivePayLater && !(staff.role === 'admin' || staff.role === 'supervisor' || staff.can_authorize_credit)) {
        throw new Error('Your staff account cannot approve pay later.');
      }
      if (effectivePayLater && session.tenant_id && !session.credit_allowed) {
        throw new Error('This tenant is not approved for credit. Ask an administrator to update the tenant first.');
      }
      if (effectivePayLater && session.tenant_id) {
        const [balanceRows] = await client.query<RowDataPacket[]>(
          `select coalesce(sum(total_rwf - paid_rwf), 0) as outstanding from invoices
           where tenant_id = ? and status in ('open','partial','overdue')`, [session.tenant_id],
        );
        const creditLimit = Number(session.credit_limit_rwf ?? 0);
        if (Number(balanceRows[0]?.outstanding ?? 0) + amount > creditLimit) {
          throw new Error(`This invoice would exceed the tenant’s credit limit of ${creditLimit.toLocaleString()} RWF.`);
        }
      }
      const paid = effectivePayLater ? 0 : amount;
      const status = effectivePayLater ? 'open' : 'paid';
      const description = `Parking session #${session.session_number} · ${session.plate_number}`;
      const [insert] = await client.query(
        `insert into invoices (invoice_number, tenant_id, vehicle_id, parking_session_id,
         invoice_type, description, total_rwf, paid_rwf, status, due_at,
         pay_later_authorized_by, pay_later_authorized_at, created_by)
         values (?, ?, ?, ?, 'daily_parking', ?, ?, ?, ?,
         if(?, date_add(current_timestamp, interval 7 day), null), ?, if(?, current_timestamp, null), ?)`,
        [invoiceNumber, session.tenant_id, session.vehicle_id, session.id, description,
          amount, paid, status, effectivePayLater, effectivePayLater ? staff.id : null, effectivePayLater, staff.id],
      );
      const invoiceId = (insert as { insertId?: number }).insertId;
      // The schema uses UUID primary keys with a database default; retrieve by unique invoice number.
      const [invoiceRows] = await client.query<RowDataPacket[]>(`select id from invoices where invoice_number = ?`, [invoiceNumber]);
      const newInvoiceId = invoiceRows[0]?.id ?? invoiceId;
      if (!newInvoiceId) throw new Error('Invoice was created but its ID could not be read.');
      if (!effectivePayLater && amount > 0) {
        await client.query(
          `insert into payments (receipt_number, tenant_id, amount_rwf, method, recorded_by)
           values (?, ?, ?, ?, ?)`, [receiptNumber, session.tenant_id, amount, method, staff.id],
        );
        const [paymentRows] = await client.query<RowDataPacket[]>(`select id from payments where receipt_number = ?`, [receiptNumber]);
        await client.query(`insert into payment_allocations (payment_id, invoice_id, amount_rwf) values (?, ?, ?)`,
          [paymentRows[0].id, newInvoiceId, amount]);
      }
      await client.query(`update parking_sessions set invoice_id = ? where id = ?`, [newInvoiceId, session.id]);
    });
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not create invoice.' }, { status: 400 });
  }
}
