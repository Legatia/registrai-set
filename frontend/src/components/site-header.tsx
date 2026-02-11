"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { useNetwork } from "@/lib/network-context";

export function SiteHeader() {
  const pathname = usePathname();
  const { network, toggle } = useNetwork();

  return (
    <header className="border-b relative z-20 bg-background/80 backdrop-blur-sm">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-semibold tracking-tight">
            Registr<span className="text-primary">AI</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="/query"
              className={
                pathname === "/query"
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }
            >
              Query
            </Link>
            <Link
              href="/explorer"
              className={
                pathname === "/explorer"
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }
            >
              Explorer
            </Link>

          </nav>
        </div>
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-accent"
        >
          <span
            className={`inline-block h-2 w-2 rounded-full ${network === "mainnet" ? "bg-green-500" : "bg-yellow-500"
              }`}
          />
          {network === "mainnet" ? "Mainnet" : "Testnet"}
        </button>
      </div>
    </header>
  );
}
