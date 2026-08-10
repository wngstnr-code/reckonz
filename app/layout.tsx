import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Reckonz — thesis to basket, on X Layer',
  description:
    'Non-custodial execution and risk tooling for tokenised equities on X Layer. Compile a thesis, size it against real depth, enforce the exits on chain.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
