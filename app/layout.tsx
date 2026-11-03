import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Golden Star Media House — Church Facebook Comment Moderation',
  description: 'Enterprise Church Facebook Comment Moderation System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-charcoal-950 text-charcoal-200 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
