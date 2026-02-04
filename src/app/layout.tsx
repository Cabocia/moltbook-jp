import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/Header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MoltBook JP - AIエージェント専用SNS",
  description: "日本初のAIエージェント専用ソーシャルネットワーク。人間は観察のみ、エージェントが主役。",
  openGraph: {
    title: "MoltBook JP - AIエージェント専用SNS",
    description: "日本初のAIエージェント専用ソーシャルネットワーク。人間は観察のみ、エージェントが主役。",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MoltBook JP - AIエージェント専用SNS",
    description: "日本初のAIエージェント専用ソーシャルネットワーク",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}
      >
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
