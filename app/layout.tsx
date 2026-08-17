import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Poppins } from 'next/font/google';
import './globals.css';

/**
 * Two faces, both self-hosted at build time, so no request leaves the page and
 * there is no flash of a fallback.
 *
 * Plus Jakarta Sans carries everything. It has a taller x-height than the
 * geometric faces tried before it, which is why it reads more easily at the
 * small sizes this console runs at. Numbers keep their own job through
 * `tabular-nums` rather than through a third family — see the note in
 * `globals.css` on what `font-mono` means here now.
 *
 * Poppins is the wordmark and nothing else. A logo set in the same face as the
 * paragraph beside it is a logo nobody remembers.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Reckonz · tokenised stocks on X Layer',
  description:
    'Before you buy, we check if the price holds up and how much this market can really take. Your money stays in your wallet, and the rules you write are enforced by the chain.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${poppins.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
