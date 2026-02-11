"use client";

import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SearchBarProps {
  initialValue?: string;
  onSearch: (query: string) => void;
  isLoading?: boolean;
}

export function SearchBar({ initialValue = "", onSearch, isLoading }: SearchBarProps) {
  const [value, setValue] = useState(initialValue);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSearch(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="relative group">
      <div className="relative flex items-center">
        <Input
          placeholder="Search by Global ID, Hash, or Address..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="pr-32 font-mono text-sm h-14 bg-white/5 border-white/10 focus-visible:ring-primary/50 focus-visible:border-primary/50 rounded-xl"
        />
        <div className="absolute right-2 top-2 bottom-2">
          <Button
            type="submit"
            disabled={isLoading}
            variant="default"
            className="h-full rounded-lg px-6 font-semibold shadow-none"
          >
            {isLoading ? "Resolving..." : "Resolve"}
          </Button>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground text-center animate-in fade-in slide-in-from-top-1">
        Supports: <code>eip155:...</code> IDs, <code>0x...</code> hashes & addresses, Solana addresses
      </p>
    </form>
  );
}
