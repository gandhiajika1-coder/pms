import { getStaff } from '@/lib/auth';
import { withActor } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const staff = await getStaff();
  if (!staff) return Response.json({ error: 'Please sign in.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const plate = typeof body.plate_number === 'string' ? body.plate_number.trim().toUpperCase() : '';
  if (!plate) return Response.json({ error: 'Enter a vehicle plate number.' }, { status: 400 });
  try {
    await withActor(staff.id, client => client.query(
      `insert into vehicles (tenant_id, plate_number, vehicle_type, make_model, color, created_by)
       values (?,?,?,?,?,?)`,
      [body.tenant_id || null, plate, body.vehicle_type || 'car', body.make_model || null, body.color || null, staff.id],
    ));
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error && error.message.includes('Duplicate entry')
      ? 'That plate number is already registered.' : 'Vehicle could not be saved.';
    return Response.json({ error: message }, { status: 400 });
  }
}
