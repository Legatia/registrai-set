import { KYAClient } from "./kya-client";

export const kya = new KYAClient({
  baseUrl: process.env.NEXT_PUBLIC_KYA_API_URL || "http://localhost:3001",
});
