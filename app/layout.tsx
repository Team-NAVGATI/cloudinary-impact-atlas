import type { ReactNode } from 'react';

export const metadata = {
  title: 'Media Mind - Sustainability Media Intelligence Platform',
  description: 'AI-powered sustainability media intelligence platform for NGOs, governments, and organizations.',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
