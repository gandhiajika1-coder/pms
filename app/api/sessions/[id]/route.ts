import { getStaff } from '@/lib/auth';
import { withActor } from '@/lib/db';
import type { ResultSetHeader } from 'mysql2/promise';

export const runtime = 'nodejs';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await getStaff();
  if (!staff) return Response.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const fee = Number(body.fee_rwf);
  if (!Number.isSafeInteger(fee) || fee < 0) return Response.json({ error: 'Invalid parking fee.' }, { status: 400 });
  const result = await withActor(staff.id, async client => {
    const [update] = await client.query<ResultSetHeader>(
      `update parking_sessions set ended_at = current_timestamp, fee_rwf = ?, status = 'closed', closed_by = ?
       where id = ? and status = 'open'`, [fee, staff.id, id],
    );
    return update;
  });
  if (!result.affectedRows) return Response.json({ error: 'Session is already closed or no longer exists.' }, { status: 404 });
  return Response.json({ ok: true });
}
