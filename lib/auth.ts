import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { RowDataPacket } from 'mysql2/promise';
import { query } from '@/lib/db';

const cookieName = 'parking_session';
const secret = process.env.SESSION_SECRET;

if (!secret || secret.length < 32) {
  throw new Error('SESSION_SECRET must contain at least 32 characters.');
}

const key = new TextEncoder().encode(secret);

export type StaffProfile = RowDataPacket & {
  id: string;
  full_name: string;
  role: string;
  can_authorize_credit: boolean;
};

export async function createSession(profile: StaffProfile) {
  const token = await new SignJWT({ sub: profile.id, role: profile.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(key);
  const jar = await cookies();
  jar.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(cookieName);
}

export async function getStaff(): Promise<StaffProfile | null> {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    if (typeof payload.sub !== 'string') return null;
    const [profile] = await query<StaffProfile>(
      `select id, full_name, role, can_authorize_credit
       from profiles where id = ? and active = true`,
      [payload.sub],
    );
    return profile ?? null;
  } catch {
    return null;
  }
}
