import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";
import { validateEnv } from "@/lib/env";
import { ErrorBoundary } from "@/components/error-boundary";

// Validate environment variables at app startup
validateEnv();

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Chronicle Vault - Indian Newspaper Archive",
  description: "A stunning archive of Indian newspapers. Access daily editions in PDF format from multiple languages and publications. Where yesterday's news becomes tomorrow's history.",
  keywords: ["Indian newspapers", "newspaper archive", "PDF newspapers", "Hindi newspapers", "Bengali newspapers", "Tamil newspapers", "regional newspapers", "Chronicle Vault"],
  authors: [{ name: "The Chronicle Vault" }],
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  openGraph: {
    title: "The Chronicle Vault",
    description: "Indian Newspaper Archive - Access newspapers from 14 languages",
    type: "website",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Chronicle Vault",
    description: "Indian Newspaper Archive - Access newspapers from 14 languages",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#e8e8e8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} ${inter.variable}`}
    >
      <body className="min-h-screen bg-[var(--bg-base)]">
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
