
import { JsonRpcProvider } from "ethers";
import "dotenv/config";

async function testRpc(name: string, url: string | undefined) {
    if (!url) return;
    console.log(`Testing ${name} (${url})...`);
    try {
        const provider = new JsonRpcProvider(url);
        const network = await provider.getNetwork();
        console.log(`✅ ${name} connected: Chain ID ${network.chainId}`);
    } catch (error) {
        console.error(`❌ ${name} failed:`, error.message);
    }
}

async function main() {
    await testRpc("Ethereum Mainnet", process.env.MAINNET_RPC_URL);
    await testRpc("Sepolia", process.env.SEPOLIA_RPC_URL);
    await testRpc("Base", process.env.BASE_RPC_URL);
}

main();
