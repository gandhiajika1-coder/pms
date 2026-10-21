# Parking Manager

usernme:: admin@example.com
password:: @dejik@123456789

A Next.js parking operations app backed by MySQL 8.0.16 or newer. MySQL Workbench is used to create the database and run the SQL file; the app connects directly to the MySQL Server through `mysql2`. The browser calls the app's server routes, so database credentials stay on the server.

## Set up the database in MySQL Workbench

1. Open your MySQL connection in Workbench and create a schema named `parking_manager`.
2. Open `database/schema.sql` in Workbench, select `parking_manager` as the default schema, and run the script.
3. Copy `.env.example` to `.env.local` if you do not already have it. Set `DATABASE_URL` with the MySQL username and password for your local connection. If the password contains URL-reserved characters, URL-encode them. Replace `SESSION_SECRET` with a random value of at least 32 characters.
4. Install dependencies and create the first staff login from a terminal:

   ```bash
   npm install
   npm run db:create-staff -- admin@example.com "Parking Administrator" admin
   ```

   The password is typed without being displayed.
5. Start the app:

   ```bash
   npm run dev
   ```

## Included

The SQL schema includes staff profiles, tenants, vehicles, parking sessions, invoices, payments, allocations, and audit logs. App queries use positional parameters (`?`). The initial working slice supports staff sign-in, dashboard data, tenant and vehicle registration, and opening/closing parking sessions. Payment posting, invoice generation, and reports still need to be built.

## Existing data

This creates a new MySQL schema and does not copy records from the old database automatically. Export any records you need before changing or removing the previous database configuration.
