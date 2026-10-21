import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Parking Manager',
  description: 'Parking payments, monthly tenants, and debt tracking',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
