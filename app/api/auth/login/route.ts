import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2/promise';
import { createSession } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) return Response.json({ error: 'Enter your email and password.' }, { status: 400 });

  const [row] = await query<RowDataPacket & {
    id: string; email: string; password_hash: string; full_name: string;
    role: string; can_authorize_credit: boolean;
  }>(
    `select id, email, password_hash, full_name, role, can_authorize_credit
     from profiles where lower(email) = ? and active = true`,
    [email],
  );
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    return Response.json({ error: 'Email or password is incorrect.' }, { status: 401 });
  }
  await createSession(row);
  return Response.json({ profile: { id: row.id, full_name: row.full_name, role: row.role } });
}
