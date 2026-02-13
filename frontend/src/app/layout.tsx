import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { NetworkProvider } from "@/lib/network-context";
import Ballpit from "@/components/Ballpit";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RegistrAI — ERC-8004 Agent Explorer",
  description:
    "Look up AI agent identities and reputations across chains via the ERC-8004 MasterRegistry.",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "RegistrAI — ERC-8004 Agent Explorer",
    description:
      "Look up AI agent identities and reputations across chains via the ERC-8004 MasterRegistry.",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${outfit.variable} ${mono.variable} font-sans antialiased`}>
        <NetworkProvider>
          <div className="relative min-h-screen flex flex-col">
            <div className="fixed inset-0 z-0 pointer-events-none">
              <Ballpit
                count={60}
                gravity={0.5}
                friction={0.9975}
                wallBounce={0.95}
                followCursor={false}
                colors={["#5227FF", "#7cff67", "#ff6b6b"]}
              />
            </div>
            <SiteHeader />
            <main className="flex-1 container mx-auto px-4 py-8 relative z-10">{children}</main>
            <SiteFooter />
          </div>
        </NetworkProvider>
      </body>
    </html>
  );
}
