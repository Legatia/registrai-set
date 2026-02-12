import test from "node:test";
import assert from "node:assert/strict";
import { KYAClient, KYAErrorCode } from "../dist/esm/index.js";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("sends X-API-Key on GET requests when configured", async () => {
  const fetchMock = async (_url, init) => {
    assert.equal(init?.method, "GET");
    assert.equal(init?.headers?.["X-API-Key"], "kya_test_key");
    return jsonResponse({ webhooks: [] });
  };

  const client = new KYAClient({
    baseUrl: "https://api.example.com",
    apiKey: "kya_test_key",
    fetch: fetchMock,
  });

  const res = await client.listWebhooks();
  assert.deepEqual(res.webhooks, []);
});

test("maps HTTP status codes to KYAError", async () => {
  const fetchMock = async () => jsonResponse({ error: "Agent not found" }, 404);

  const client = new KYAClient({
    baseUrl: "https://api.example.com",
    fetch: fetchMock,
  });

  await assert.rejects(client.getAgent("missing"), (err) => {
    assert.equal(err.name, "KYAError");
    assert.equal(err.code, KYAErrorCode.NOT_FOUND);
    assert.equal(err.status, 404);
    return true;
  });
});

test("handles large feedback counts in trust checks", async () => {
  const fetchMock = async () =>
    jsonResponse({
      masterAgentId: "0xabc",
      unified: {
        value: "7500",
        decimals: 2,
        totalFeedbackCount: "9007199254740993",
      },
      perChain: [],
    });

  const client = new KYAClient({
    baseUrl: "https://api.example.com",
    fetch: fetchMock,
  });

  const result = await client.isAgentTrusted("0xabc", {
    minScore: 50,
    minFeedback: 1000,
  });

  assert.equal(result.trusted, true);
  assert.equal(result.score, 75);
});
