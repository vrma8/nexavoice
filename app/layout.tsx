import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const inter = localFont({
  src: '../fonts/InterVariable.ttf',
  variable: '--font-inter',
  weight: '100 900',
  display: 'swap',
});

const instrumentSerif = localFont({
  src: [
    { path: '../fonts/InstrumentSerif-Regular.ttf', weight: '400', style: 'normal' },
    { path: '../fonts/InstrumentSerif-Italic.ttf', weight: '400', style: 'italic' },
  ],
  variable: '--font-instrument-serif',
  display: 'swap',
});

const jetBrainsMono = localFont({
  src: '../fonts/JetBrainsMonoVariable.ttf',
  variable: '--font-jetbrains-mono',
  weight: '100 800',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: 'NexaVoice — AI support that hands off to a human',
  description:
    'NexaMart support agent: voice and chat with backend tool access, an escalation queue, and live human takeover — built on Agora Conversational AI.',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png' }],
    other: [
      {
        url: '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full ${inter.variable} ${instrumentSerif.variable} ${jetBrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="h-full min-h-screen font-sans">{children}</body>
    </html>
  );
}
