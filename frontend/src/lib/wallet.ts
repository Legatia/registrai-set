import {
  createWalletClient,
  custom,
  type EIP1193Provider,
  type Chain,
} from "viem";
import {
  mainnet,
  sepolia,
  base,
  baseSepolia,
  arbitrum,
  optimism,
} from "viem/chains";

const CHAIN_MAP: Record<number, Chain> = {
  1: mainnet,
  11155111: sepolia,
  8453: base,
  84532: baseSepolia,
  42161: arbitrum,
  10: optimism,
};

function getProvider(): EIP1193Provider {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error(
      "No wallet detected. Please install MetaMask or another browser wallet."
    );
  }
  return window.ethereum as EIP1193Provider;
}

export async function connectWallet(): Promise<{
  address: `0x${string}`;
  chainId: number;
}> {
  const provider = getProvider();
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  const chainIdHex = (await provider.request({
    method: "eth_chainId",
  })) as string;
  return {
    address: accounts[0] as `0x${string}`,
    chainId: parseInt(chainIdHex, 16),
  };
}

export async function switchChain(chainId: number): Promise<void> {
  const provider = getProvider();
  const hexChainId = `0x${chainId.toString(16)}`;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexChainId }],
    });
  } catch (err: unknown) {
    const error = err as { code?: number };
    if (error.code === 4902) {
      throw new Error(
        `Chain ${chainId} is not configured in your wallet. Please add it manually.`
      );
    }
    throw err;
  }
}

export async function sendTransaction(params: {
  to: `0x${string}`;
  data: `0x${string}`;
  chainId: number;
}): Promise<`0x${string}`> {
  const chain = CHAIN_MAP[params.chainId];
  if (!chain) throw new Error(`Unsupported chain: ${params.chainId}`);

  const provider = getProvider();
  const client = createWalletClient({
    chain,
    transport: custom(provider),
  });

  const [account] = await client.getAddresses();
  return client.sendTransaction({
    account,
    to: params.to,
    data: params.data,
  });
}

// ── Wallet event listeners ──────────────────────────────────────────────

export function onAccountsChanged(
  cb: (accounts: string[]) => void
): () => void {
  try {
    const provider = getProvider();
    const handler = (accounts: unknown) => cb(accounts as string[]);
    provider.on("accountsChanged", handler);
    return () => provider.removeListener("accountsChanged", handler);
  } catch {
    return () => {};
  }
}

export function onChainChanged(cb: (chainId: number) => void): () => void {
  try {
    const provider = getProvider();
    const handler = (chainIdHex: unknown) =>
      cb(parseInt(chainIdHex as string, 16));
    provider.on("chainChanged", handler);
    return () => provider.removeListener("chainChanged", handler);
  } catch {
    return () => {};
  }
}
