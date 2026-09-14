import { Connection } from "@solana/web3.js";

export const TOKEN_DECIMALS = 9;

export type CreatedToken = {
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  initialSupply: string;
  createdAt: string;
};

export async function confirmTransactionPolling(
  signature: string,
  connection: Connection,
  timeoutMs = 45000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const status = await connection.getSignatureStatus(signature, {
        searchTransactionHistory: true,
      });

      if (
        status?.value?.confirmationStatus === "confirmed" ||
        status?.value?.confirmationStatus === "finalized"
      ) {
        if (status.value.err) {
          throw new Error(
            `Transaction failed on-chain: ${JSON.stringify(status.value.err)}`
          );
        }
        return;
      }

      // Fallback check: check if transaction details can already be parsed
      const tx = await connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });
      if (tx) {
        if (tx.meta?.err) {
          throw new Error(
            `Transaction failed on-chain: ${JSON.stringify(tx.meta.err)}`
          );
        }
        return;
      }
    } catch (e: any) {
      if (e.message && e.message.includes("Transaction failed on-chain")) {
        throw e;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  // Final attempt
  const finalTx = await connection.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
  });
  if (finalTx && !finalTx.meta?.err) {
    return;
  }

  throw new Error(
    "Transaction confirmation timed out on Devnet. Check Explorer."
  );
}

export function truncateAddress(address: string, visibleCharacters = 4) {
  if (!address) return "";
  if (address.length <= visibleCharacters * 2 + 3) return address;

  return `${address.slice(0, visibleCharacters)}...${address.slice(-visibleCharacters)}`;
}

export function parseTokenAmount(value: string, decimals: number): bigint {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error("Enter a valid token amount.");
  }

  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) {
    throw new Error(`This token supports up to ${decimals} decimal places.`);
  }

  const baseUnits =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0"));

  if (baseUnits <= 0n) {
    throw new Error("Amount must be greater than zero.");
  }

  if (baseUnits > 2n ** 64n - 1n) {
    throw new Error("Amount is too large.");
  }

  return baseUnits;
}

export function getExplorerUrl(
  identifier: string,
  type: "address" | "tx" = "address",
  cluster = "devnet"
) {
  return `https://explorer.solana.com/${type}/${identifier}?cluster=${cluster}`;
}

const STORAGE_KEY = "solana_devnet_created_tokens";

export function getStoredTokens(): CreatedToken[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveStoredToken(token: CreatedToken) {
  try {
    const existing = getStoredTokens();
    // Prepend new token, avoid duplicates
    const filtered = existing.filter((t) => t.mint !== token.mint);
    const updated = [token, ...filtered].slice(0, 20); // keep last 20
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn("Failed to cache token to localStorage:", err);
  }
}

