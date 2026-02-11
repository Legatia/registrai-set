
import { JsonRpcProvider } from "ethers";
import "dotenv/config";

// Jan 28, 2026 00:00:00 UTC
const TARGET_TIMESTAMP = 1769558400;

const CHAINS = [
    { name: "MAINNET", url: process.env.MAINNET_RPC_URL },
    { name: "BASE", url: process.env.BASE_RPC_URL },
    { name: "OPTIMISM", url: process.env.OPTIMISM_RPC_URL },
    { name: "ARBITRUM", url: process.env.ARBITRUM_RPC_URL },
    { name: "POLYGON", url: process.env.POLYGON_RPC_URL },
    { name: "BSC", url: process.env.BSC_RPC_URL },
    { name: "AVALANCHE", url: process.env.AVALANCHE_RPC_URL },
    // Add others if needed, but these are the majors
    { name: "SEPOLIA", url: process.env.SEPOLIA_RPC_URL },
    { name: "BASE_SEPOLIA", url: process.env.BASE_SEPOLIA_RPC_URL },
];

async function findBlockByTimestamp(provider: JsonRpcProvider, targetTimestamp: number): Promise<number | null> {
    let min = 0;
    let max = await provider.getBlockNumber();
    let closestBlock = null;
    let closestDiff = Infinity;

    while (min <= max) {
        const mid = Math.floor((min + max) / 2);
        try {
            const block = await provider.getBlock(mid);
            if (!block) {
                // If block is missing, try slightly different
                min++;
                continue;
            }

            const diff = block.timestamp - targetTimestamp;

            // Check if this is the closest so far (preferring slightly before or exact)
            if (Math.abs(diff) < closestDiff) {
                closestDiff = Math.abs(diff);
                closestBlock = mid;
            }

            if (diff === 0) return mid;
            if (diff < 0) min = mid + 1;
            else max = mid - 1;

        } catch (e) {
            // console.error("Error fetching block", mid, e.message);
            // Sometimes RPCs fail on deep history, but 2 weeks ago is recent
            break;
        }
    }
    return closestBlock;
}

async function main() {
    console.log(`Searching for blocks around ${new Date(TARGET_TIMESTAMP * 1000).toISOString()}...\n`);

    for (const chain of CHAINS) {
        if (!chain.url) {
            console.log(`# ${chain.name}: No RPC URL`);
            continue;
        }

        try {
            const provider = new JsonRpcProvider(chain.url);
            const block = await findBlockByTimestamp(provider, TARGET_TIMESTAMP);
            console.log(`${chain.name}_FROM_BLOCK=${block}`);
        } catch (e) {
            console.log(`# ${chain.name}: Error ${e.message}`);
        }
    }
}

main();
