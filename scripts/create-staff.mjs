import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

const [emailInput, fullNameInput, roleInput = 'admin'] = process.argv.slice(2);
const email = (emailInput ?? '').trim().toLowerCase();
const fullName = (fullNameInput ?? '').trim();
const roles = new Set(['admin', 'supervisor', 'cashier', 'viewer']);

if (!email || !fullName || !roles.has(roleInput)) {
  console.error('Usage: npm run db:create-staff -- <email> "<full name>" [admin|supervisor|cashier|viewer]');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL in your environment before creating a staff account.');
  process.exit(1);
}

async function readPassword() {
  if (process.env.PARKING_STAFF_PASSWORD) return process.env.PARKING_STAFF_PASSWORD;
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('Run this in a terminal or set PARKING_STAFF_PASSWORD temporarily.');
  }
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');
    let value = '';
    process.stdout.write('Password: ');
    const onData = chunk => {
      for (const char of chunk) {
        if (char === '\u0003') {
          input.setRawMode(false);
          input.pause();
          reject(new Error('Cancelled.'));
          return;
        }
        if (char === '\r' || char === '\n') {
          input.setRawMode(false);
          input.pause();
          input.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
        } else {
          value += char;
        }
      }
    };
    input.on('data', onData);
  });
}

const password = await readPassword();
if (password.length < 12) throw new Error('Use a password with at least 12 characters.');
const passwordHash = await bcrypt.hash(password, 12);
const databaseUrl = new URL(process.env.DATABASE_URL);
const pool = mysql.createPool({
  host: databaseUrl.hostname,
  port: Number(databaseUrl.port || 3306),
  user: decodeURIComponent(databaseUrl.username),
  password: decodeURIComponent(databaseUrl.password),
  database: decodeURIComponent(databaseUrl.pathname.replace(/^\//, '')),
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
});
try {
  await pool.execute(
    `insert into profiles (email, password_hash, full_name, role)
     values (?, ?, ?, ?)`,
    [email, passwordHash, fullName, roleInput],
  );
  console.log(`Created ${roleInput} account for ${email}.`);
} finally {
  await pool.end();
}
