import "dotenv/config";

async function main() {
    const accountId = process.env.CF_ACCOUNT_ID;
    const databaseId = process.env.D1_DATABASE_ID;
    const apiToken = process.env.CF_API_TOKEN;

    if (!accountId || !databaseId || !apiToken) {
        console.error("Missing env vars");
        return;
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

    console.log("Testing D1 Batching...");

    // Test 1: Array of objects (Current Failing Method)
    console.log("\n--- Test 1: Array of objects ---");
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify([
                { sql: "SELECT 1 as res", params: [] },
                { sql: "SELECT 2 as res", params: [] },
            ]),
        });
        console.log("Status:", res.status);
        console.log("Body:", await res.text());
    } catch (e) {
        console.error("Error:", e);
    }

    // Test 2: Single object with multiple statements
    console.log("\n--- Test 2: Single object, multi-statement SQL ---");
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                sql: "SELECT 1 as res; SELECT 2 as res;",
                params: [], // Params for all statements flattened? Or does it support params at all for multi-stmt?
            }),
        });
        console.log("Status:", res.status);
        console.log("Body:", await res.text());
    } catch (e) {
        console.error("Error:", e);
    }
    // Test 3: Params binding
    console.log("\n--- Test 3: Params binding ---");
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                sql: "SELECT ? as a; SELECT ? as b;",
                params: [10, 20],
            }),
        });
        console.log("Status:", res.status);
        console.log("Body:", await res.text());
    } catch (e) {
        console.error("Error:", e);
    }
    // Test 4: Wrapped array
    console.log("\n--- Test 4: Wrapped array { statements: ... } ---");
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                statements: [
                    { sql: "SELECT ? as a", params: [30] },
                    { sql: "SELECT ? as b", params: [40] }
                ]
            }),
        });
        console.log("Status:", res.status);
        console.log("Body:", await res.text());
    } catch (e) {
        console.error("Error:", e);
    }
    // Test 5: Wrapped array { batch: ... }
    console.log("\n--- Test 5: Wrapped array { batch: ... } ---");
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                batch: [
                    { sql: "SELECT ? as a", params: [30] },
                    { sql: "SELECT ? as b", params: [40] }
                ]
            }),
        });
        console.log("Status:", res.status);
        console.log("Body:", await res.text());
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
