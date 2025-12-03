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
  title: "Baseten-powered chat",
  description:
    "Chat interface backed by Baseten, Supabase, Next.js, and Vercel at chat.matthew-tran.com.",
  openGraph: {
    title: "Baseten-powered chat",
    description:
      "Chat interface backed by Baseten, Supabase, Next.js, and Vercel at chat.matthew-tran.com.",
    url: "https://chat.matthew-tran.com",
    siteName: "Baseten-powered chat",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "Baseten-powered chat at chat.matthew-tran.com",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Baseten-powered chat",
    description:
      "Chat interface backed by Baseten, Supabase, Next.js, and Vercel at chat.matthew-tran.com.",
    images: ["/og-image.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
