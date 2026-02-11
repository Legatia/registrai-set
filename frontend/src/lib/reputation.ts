import { encodeFunctionData } from "viem";

// ─── ERC-8004 Identity Registry addresses ─────────────────────────────────────
export const IDENTITY_REGISTRIES: Record<number, `0x${string}`> = {
  1: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  8453: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  42161: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  10: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  11155111: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  84532: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
};

// ─── ERC-8004 Reputation Registry addresses ───────────────────────────────────
export const REPUTATION_REGISTRIES: Record<number, `0x${string}`> = {
  1: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  8453: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  42161: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  10: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  11155111: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  84532: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
};

const ZERO_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

const GIVE_FEEDBACK_ABI = [
  {
    name: "giveFeedback",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "value", type: "int128" },
      { name: "valueDecimals", type: "uint8" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
      { name: "endpoint", type: "string" },
      { name: "feedbackURI", type: "string" },
      { name: "feedbackHash", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

export function buildFeedbackCalldata(args: {
  agentId: bigint;
  value: bigint;
  valueDecimals: number;
  tag1?: string;
  tag2?: string;
  feedbackHash?: `0x${string}`;
}): `0x${string}` {
  return encodeFunctionData({
    abi: GIVE_FEEDBACK_ABI,
    functionName: "giveFeedback",
    args: [
      args.agentId,
      args.value,
      args.valueDecimals,
      args.tag1 || "",
      args.tag2 || "",
      "",
      "",
      args.feedbackHash || ZERO_HASH,
    ],
  });
}

// ─── Registration ─────────────────────────────────────────────────────────────

const REGISTER_ABI = [
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
] as const;

export function buildRegisterCalldata(agentURI: string): `0x${string}` {
  return encodeFunctionData({
    abi: REGISTER_ABI,
    functionName: "register",
    args: [agentURI],
  });
}
