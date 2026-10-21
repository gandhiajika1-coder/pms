import { clearSession, getStaff } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  const profile = await getStaff();
  return Response.json({ profile: profile ? { id: profile.id, full_name: profile.full_name, role: profile.role } : null });
}

export async function DELETE() {
  await clearSession();
  return Response.json({ ok: true });
}
