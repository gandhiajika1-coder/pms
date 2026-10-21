import mysql, { type Pool, type PoolConnection, type RowDataPacket } from 'mysql2/promise';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required. Set it to your MySQL connection URL.');

const url = new URL(databaseUrl);
const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
if (!databaseName) throw new Error('DATABASE_URL must include a MySQL database name.');

const globalForMysql = globalThis as unknown as { mysqlPool?: Pool };
export const pool = globalForMysql.mysqlPool ?? mysql.createPool({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: databaseName,
  // Match this database's utf8mb4_0900_ai_ci columns so SQL parameters and
  // trigger session variables use the same collation as the stored IDs.
  charset: 'UTF8MB4_0900_AI_CI',
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z',
});

if (process.env.NODE_ENV !== 'production') globalForMysql.mysqlPool = pool;

export async function query<T extends RowDataPacket = RowDataPacket>(sql: string, values: unknown[] = []): Promise<T[]> {
  const [rows] = await pool.execute(sql, values as never[]);
  return rows as unknown as T[];
}

export async function withActor<T>(actorId: string, work: (client: PoolConnection) => Promise<T>): Promise<T> {
  const client = await pool.getConnection();
  try {
    await client.beginTransaction();
    await client.query('SET @app_user_id = ?', [actorId]);
    const result = await work(client);
    await client.commit();
    return result;
  } catch (error) {
    await client.rollback();
    throw error;
  } finally {
    await client.query('SET @app_user_id = NULL');
    client.release();
  }
}
