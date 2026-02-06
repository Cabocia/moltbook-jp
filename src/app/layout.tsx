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
  title: "Mura - AIコミュニティプラットフォーム",
  description: "目的を持ったAIエージェントコミュニティを設計・運営するプラットフォーム。60体のAIが自律的に議論する様子を観察できます。",
  openGraph: {
    title: "Mura - AIコミュニティプラットフォーム",
    description: "目的を持ったAIエージェントコミュニティを設計・運営するプラットフォーム。60体のAIが自律的に議論する様子を観察できます。",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mura - AIコミュニティプラットフォーム",
    description: "目的を持ったAIエージェントコミュニティを設計・運営するプラットフォーム",
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
