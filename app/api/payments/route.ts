import { getStaff } from '@/lib/auth';
import { withActor } from '@/lib/db';
import type { RowDataPacket } from 'mysql2/promise';

export const runtime = 'nodejs';

const methods = ['cash', 'mobile_money', 'bank_transfer', 'card', 'other'] as const;

export async function POST(request: Request) {
  const staff = await getStaff();
  if (!staff) return Response.json({ error: 'Please sign in.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const invoiceId = typeof body.invoice_id === 'string' ? body.invoice_id : '';
  const amount = Number(body.amount_rwf);
  const method = methods.includes(body.method) ? body.method : null;
  const reference = typeof body.reference_number === 'string' ? body.reference_number.trim().slice(0, 160) : '';
  if (!invoiceId || !Number.isSafeInteger(amount) || amount <= 0 || !method) {
    return Response.json({ error: 'Choose an invoice, enter a positive whole-number amount, and select a payment method.' }, { status: 400 });
  }
  try {
    const receiptNumber = `RCT-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    await withActor(staff.id, async client => {
      const [rows] = await client.query<RowDataPacket[]>(
        `select id, tenant_id, total_rwf, paid_rwf, status, pay_later_authorized_by, pay_later_authorized_at
         from invoices where id = ? for update`, [invoiceId],
      );
      const invoice = rows[0];
      if (!invoice || invoice.status === 'void') throw new Error('Invoice not found or voided.');
      const balance = Number(invoice.total_rwf) - Number(invoice.paid_rwf);
      if (amount > balance) throw new Error(`Payment cannot be more than the remaining balance of ${balance.toLocaleString()} RWF.`);
      await client.query(
        `insert into payments (receipt_number, tenant_id, amount_rwf, method, reference_number, recorded_by)
         values (?, ?, ?, ?, ?, ?)`, [receiptNumber, invoice.tenant_id, amount, method, reference || null, staff.id],
      );
      const [paymentRows] = await client.query<RowDataPacket[]>(`select id from payments where receipt_number = ?`, [receiptNumber]);
      await client.query(`insert into payment_allocations (payment_id, invoice_id, amount_rwf) values (?, ?, ?)`,
        [paymentRows[0].id, invoice.id, amount]);
      const paid = Number(invoice.paid_rwf) + amount;
      const status = paid >= Number(invoice.total_rwf) ? 'paid' : 'partial';
      await client.query(
        `update invoices set paid_rwf = ?, status = ?,
         pay_later_authorized_by = ?, pay_later_authorized_at = ? where id = ?`,
        [paid, status, invoice.pay_later_authorized_by, invoice.pay_later_authorized_at, invoice.id],
      );
    });
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not record payment.' }, { status: 400 });
  }
}
