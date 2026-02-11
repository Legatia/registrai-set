import { ArrowRight, Search, Activity, Users, ShieldCheck, Database, LayoutTemplate, Network } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Hero() {
    return (
        <div className="relative flex flex-col items-center justify-center pt-20 pb-32 z-10">

            {/* Hero Header */}
            <div className="text-center max-w-4xl px-4 mb-24 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-sm text-indigo-700 mb-8">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-500 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                    </span>
                    Live on Base Sepolia & Eth Sepolia
                </div>

                <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-zinc-900 mb-6 font-outfit">
                    The Master Registry for <br className="hidden md:block" />
                    <span className="text-indigo-600">AI Agents</span>
                </h1>

                <p className="max-w-2xl mx-auto text-xl text-zinc-600 mb-10 leading-relaxed">
                    RegistrAI is the decentralized trust layer for autonomous agents.
                    Verify identity, track reputation, and discover the next generation of on-chain intelligence.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Link href="/register">
                        <Button size="lg" className="rounded-full px-8 text-base shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/30 transition-all">
                            Register an Agent <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    </Link>
                    <Link href="/explorer">
                        <Button variant="outline" size="lg" className="rounded-full px-8 text-base bg-white/50 hover:bg-white border-zinc-200">
                            View Explorer
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Feature Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl px-4 mb-32">
                <div className="bg-white p-8 rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md transition-shadow">
                    <div className="h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-6">
                        <ShieldCheck size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-zinc-900 mb-3">Verifiable Identity</h3>
                    <p className="text-zinc-600 leading-relaxed">
                        Every agent is minted as an ERC-8004 NFT, providing a cryptographically verifiable on-chain identity that cannot be forged.
                    </p>
                </div>

                <div className="bg-white p-8 rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md transition-shadow">
                    <div className="h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-6">
                        <Activity size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-zinc-900 mb-3">Reputation Tracking</h3>
                    <p className="text-zinc-600 leading-relaxed">
                        Track agent performance and reliability across chains. Reputation scores are updated in real-time based on on-chain activity.
                    </p>
                </div>

                <div className="bg-white p-8 rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md transition-shadow">
                    <div className="h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-6">
                        <Network size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-zinc-900 mb-3">Universal Registry</h3>
                    <p className="text-zinc-600 leading-relaxed">
                        A single source of truth for AI agents across Base, Ethereum, and other EVM chains. One interface to find them all.
                    </p>
                </div>
            </div>

            {/* How It Works */}
            <div className="w-full bg-zinc-50 py-24 border-y border-zinc-200/50">
                <div className="max-w-6xl mx-auto px-4">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-zinc-900 mb-4">How It Works</h2>
                        <p className="text-zinc-600 max-w-2xl mx-auto">
                            RegistrAI simplifies the process of bringing AI agents on-chain.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
                        {/* Connector Line (Desktop) */}
                        <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-0.5 bg-zinc-200 -z-10" />

                        <div className="flex flex-col items-center text-center">
                            <div className="w-24 h-24 rounded-full bg-white border-4 border-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm mb-6 z-10">
                                <LayoutTemplate size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-zinc-900 mb-2">1. Register</h3>
                            <p className="text-sm text-zinc-600">Connect your wallet and mint a unique identity NFT for your AI agent.</p>
                        </div>

                        <div className="flex flex-col items-center text-center">
                            <div className="w-24 h-24 rounded-full bg-white border-4 border-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm mb-6 z-10">
                                <Database size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-zinc-900 mb-2">2. Index</h3>
                            <p className="text-sm text-zinc-600">Our decentralized relayer indexes your agent's metadata and activity.</p>
                        </div>

                        <div className="flex flex-col items-center text-center">
                            <div className="w-24 h-24 rounded-full bg-white border-4 border-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm mb-6 z-10">
                                <Search size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-zinc-900 mb-2">3. Discover</h3>
                            <p className="text-sm text-zinc-600">Users can verify your agent's history and interact with it safely.</p>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
}
