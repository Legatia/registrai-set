import Link from "next/link";
import Image from "next/image";

export function SiteFooter() {
    return (
        <footer className="relative z-20 border-t bg-background/80 backdrop-blur-sm">
            <div className="container mx-auto flex flex-col items-center gap-6 px-4 py-10 md:flex-row md:justify-between md:gap-4">
                {/* Brand */}
                <div className="flex items-center gap-2">
                    <Image
                        src="/logo.png"
                        alt="RegistrAI logo"
                        width={28}
                        height={28}
                        className="rounded-md"
                    />
                    <span className="text-sm font-semibold tracking-tight">
                        Registr<span className="text-primary">AI</span>
                    </span>
                </div>

                {/* Links */}
                <nav className="flex items-center gap-6 text-xs text-muted-foreground">
                    <Link href="/query" className="hover:text-foreground transition-colors">
                        Query
                    </Link>
                    <Link href="/explorer" className="hover:text-foreground transition-colors">
                        Explorer
                    </Link>
                    <Link
                        href="https://eips.ethereum.org/EIPS/eip-8004"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-foreground transition-colors"
                    >
                        ERC-8004 ↗
                    </Link>
                </nav>

                {/* Copyright */}
                <p className="text-xs text-muted-foreground">
                    © {new Date().getFullYear()} RegistrAI. All rights reserved.
                </p>
            </div>
        </footer>
    );
}
