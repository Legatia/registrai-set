"use client";

import { RegisterAgentForm } from "@/components/register-agent-form";

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-2">Register Agent</h1>
        <p className="text-muted-foreground text-sm">
          Register a new AI agent on-chain via the ERC-8004 Identity Registry.
        </p>
      </div>

      <RegisterAgentForm />
    </div>
  );
}
