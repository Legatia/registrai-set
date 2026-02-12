import { KYAClient } from "@registrai/kya";

export const kya = new KYAClient({
  baseUrl: process.env.NEXT_PUBLIC_KYA_API_URL || "http://localhost:3001",
  apiKey: process.env.NEXT_PUBLIC_KYA_API_KEY,
});
