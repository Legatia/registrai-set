"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, Suspense } from "react";
import { SearchBar } from "@/components/search-bar";
import { AgentProfile } from "@/components/agent-profile";
import { LoadingProfile } from "@/components/loading-profile";
import { useResolveAgent } from "@/lib/hooks/use-resolve-agent";

function QueryPageContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { data, isLoading, error, resolve, reset } = useResolveAgent();

    const queryParam = searchParams.get("q") || "";

    useEffect(() => {
        if (queryParam) {
            resolve(queryParam);
        }
    }, [queryParam, resolve]);

    function handleSearch(globalAgentId: string) {
        reset();
        router.push(`/query?q=${encodeURIComponent(globalAgentId)}`);
    }

    return (
        <div className="flex flex-col min-h-[calc(100vh-200px)] py-12">
            <div className={`w-full max-w-2xl mx-auto space-y-8`}>

                <div className="space-y-4 text-center">
                    <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
                        Find an Agent
                    </h1>
                    <div className="p-1">
                        <SearchBar
                            initialValue={queryParam}
                            onSearch={handleSearch}
                            isLoading={isLoading}
                        />
                    </div>
                    {!data && !isLoading && (
                        <p className="text-sm text-zinc-500">
                            Try searching by Global Agent ID (eip155:...), Agent Hash (0x...), or Owner Address.
                        </p>
                    )}
                </div>

                {isLoading && <LoadingProfile />}

                {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center animate-in fade-in slide-in-from-bottom-2">
                        <p className="text-red-600 font-medium">{error}</p>
                    </div>
                )}

                {data && <AgentProfile agent={data} />}
            </div>
        </div>
    );
}

export default function QueryPage() {
    return (
        <Suspense>
            <QueryPageContent />
        </Suspense>
    );
}
