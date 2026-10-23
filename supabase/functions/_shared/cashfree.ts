export function credentials(mode: string) {
  if (!["production","test","sandbox"].includes(mode)) throw new Error("Unknown payment environment");
  const sandbox = mode !== "production";
  const appId = Deno.env.get(sandbox ? "CASHFREE_TEST_APP_ID" : "CASHFREE_APP_ID")?.trim();
  const secret = Deno.env.get(sandbox ? "CASHFREE_TEST_SECRET_KEY" : "CASHFREE_SECRET_KEY")?.trim();
  if (!appId || !secret) throw new Error("Payment credentials are not configured");
  if (!sandbox && appId.toUpperCase().startsWith("TEST")) throw new Error("Production checkout requires production credentials");
  return { base: sandbox ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg", headers: {
    "Content-Type": "application/json", "x-api-version": "2023-08-01", "x-client-id": appId, "x-client-secret": secret,
  } };
}
