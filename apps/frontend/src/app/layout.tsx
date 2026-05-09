import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ace of Pace - Racing Control System",
  description: "Система управления гонками. Контролируйте питстопы, отслеживайте команды и управляйте событиями гонки. Обогнать грипов сквозь дождь и кучу дров.",
  keywords: ["racing", "гонки", "pitlane", "питстоп", "карт", "контроль", "ace of pace"],
  authors: [{ name: "Ace of Pace Team" }],
  creator: "Ace of Pace",
  publisher: "Ace of Pace",
  applicationName: "Ace of Pace",
  generator: "Next.js",
  referrer: "origin-when-cross-origin",
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32', type: 'image/x-icon' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/manifest.json',
  themeColor: '#0f0f23',
  colorScheme: 'dark',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  },
  openGraph: {
    type: 'website',
    siteName: 'Ace of Pace',
    title: 'Ace of Pace - Racing Control System',
    description: 'Система управления гонками. Контролируйте питстопы, отслеживайте команды и управляйте событиями гонки.',
    locale: 'ru_RU',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ace of Pace - Racing Control System',
    description: 'Система управления гонками. Контролируйте питстопы, отслеживайте команды и управляйте событиями гонки.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
