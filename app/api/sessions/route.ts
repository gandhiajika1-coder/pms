import { getStaff } from '@/lib/auth';
import { withActor } from '@/lib/db';
import type { RowDataPacket } from 'mysql2/promise';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const staff = await getStaff();
  if (!staff) return Response.json({ error: 'Please sign in.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const vehicleId = typeof body.vehicle_id === 'string' ? body.vehicle_id : '';
  const startedAt = typeof body.started_at === 'string' ? new Date(body.started_at) : new Date(NaN);
  if (!vehicleId || Number.isNaN(startedAt.getTime()) || startedAt.getTime() > Date.now()) {
    return Response.json({ error: 'Select a vehicle and enter a valid arrival time.' }, { status: 400 });
  }
  try {
    await withActor(staff.id, async client => {
      const [vehicles] = await client.query<RowDataPacket[]>(
        `select tenant_id from vehicles where id = ? and status = 'active' for update`, [vehicleId],
      );
      if (!vehicles[0]) throw new Error('Vehicle not found or inactive.');
      const [open] = await client.query<RowDataPacket[]>(
        `select 1 from parking_sessions where vehicle_id = ? and status = 'open' limit 1`, [vehicleId],
      );
      if (open.length) throw new Error('This vehicle already has an open parking session.');
      await client.query(
        `insert into parking_sessions (vehicle_id, tenant_id, started_at, fee_rwf, created_by)
         values (?,?,?,0,?)`,
        // Pass a Date so mysql2 formats it as a MySQL datetime using the pool's UTC timezone.
        // ISO strings include a trailing Z, which MySQL TIMESTAMP does not accept as a value.
        [vehicleId, (vehicles[0] as RowDataPacket & { tenant_id: string | null }).tenant_id, startedAt, staff.id],
      );
    });
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not start session.' }, { status: 400 });
  }
}
