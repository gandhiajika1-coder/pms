import { getStaff } from '@/lib/auth';
import { withActor } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const staff = await getStaff();
  if (!staff) return Response.json({ error: 'Please sign in.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const code = typeof body.tenant_code === 'string' ? body.tenant_code.trim().toUpperCase() : '';
  const name = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  const rate = Number(body.monthly_rate_rwf);
  const limit = Number(body.credit_limit_rwf);
  if (!code || !name || !Number.isSafeInteger(rate) || rate < 0 || !Number.isSafeInteger(limit) || limit < 0) {
    return Response.json({ error: 'Enter a code, full name, and valid non-negative amounts.' }, { status: 400 });
  }
  try {
    await withActor(staff.id, client => client.query(
      `insert into tenants (tenant_code, full_name, phone, email, organization,
       monthly_rate_rwf, credit_allowed, credit_limit_rwf, created_by)
       values (?,?,?,?,?,?,?,?,?)`,
      [code, name, body.phone || null, body.email || null, body.organization || null, rate, Boolean(body.credit_allowed), limit, staff.id],
    ));
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error && error.message.includes('Duplicate entry')
      ? 'That tenant code is already in use.' : 'Tenant could not be saved.';
    return Response.json({ error: message }, { status: 400 });
  }
}
