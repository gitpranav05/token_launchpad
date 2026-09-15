import {
  createInitializeMetadataPointerInstruction,
  createInitializeMint2Instruction,
  ExtensionType,
  getMintLen,
  LENGTH_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TYPE_SIZE,
} from "@solana/spl-token";
import { createInitializeInstruction, pack } from "@solana/spl-token-metadata";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import { useState, type FormEvent } from "react";
import {
  confirmTransactionPolling,
  CreatedToken,
  getExplorerUrl,
  saveStoredToken,
  truncateAddress,
} from "../lib/token";
import { triggerSuccessConfetti } from "../lib/confetti";

interface LaunchpadProps {
  onTokenCreated?: (token: CreatedToken) => void;
  onNavigateToMint?: (mintAddress: string) => void;
}

export default function Launchpad({
  onTokenCreated,
  onNavigateToMint,
}: LaunchpadProps) {
  const wallet = useWallet();
  const { connection } = useConnection();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [decimals, setDecimals] = useState("9");

  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState<"info" | "success" | "error">(
    "info"
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdToken, setCreatedToken] = useState<CreatedToken | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  async function createToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!wallet.publicKey) {
      setStatusType("error");
      setStatusMessage("Please connect your Solana wallet first.");
      return;
    }

    const tokenName = name.trim();
    const tokenSymbol = symbol.trim().toUpperCase();
    const tokenUri = imageUrl.trim();
    const parsedDecimals = parseInt(decimals, 10);

    if (!tokenName) {
      setStatusType("error");
      setStatusMessage("Token name is required.");
      return;
    }
    if (!tokenSymbol) {
      setStatusType("error");
      setStatusMessage("Token symbol is required.");
      return;
    }
    if (!tokenUri) {
      setStatusType("error");
      setStatusMessage("Metadata / Image URL is required.");
      return;
    }
    if (isNaN(parsedDecimals) || parsedDecimals < 0 || parsedDecimals > 9) {
      setStatusType("error");
      setStatusMessage("Decimals must be an integer between 0 and 9.");
      return;
    }

    try {
      const uri = new URL(tokenUri);
      if (uri.protocol !== "https:" && uri.protocol !== "http:") {
        throw new Error("Metadata URI must use HTTP or HTTPS protocol.");
      }
    } catch {
      setStatusType("error");
      setStatusMessage("Please enter a valid HTTP or HTTPS metadata URL.");
      return;
    }

    setIsSubmitting(true);
    setStatusType("info");
    setStatusMessage("Generating mint keypair and estimating rent...");

    try {
      const mintKeypair = Keypair.generate();
      const mintPublicKey = mintKeypair.publicKey;
      const ownerPublicKey = wallet.publicKey;

      const metadata = {
        updateAuthority: ownerPublicKey,
        mint: mintPublicKey,
        name: tokenName,
        symbol: tokenSymbol,
        uri: tokenUri,
        additionalMetadata: [] as [string, string][],
      };

      const mintLen = getMintLen([ExtensionType.MetadataPointer]);
      const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
      // createInitializeInstruction expands the account dynamically from mintLen into mintLen + metadataLen.
      // Therefore, space in createAccount must be exactly mintLen, and lamports must cover the final size (mintLen + metadataLen).
      const finalAccountSpace = mintLen + metadataLen;

      const lamports =
        await connection.getMinimumBalanceForRentExemption(finalAccountSpace);

      setStatusMessage("Building transaction instructions...");

      const transaction = new Transaction();

      // 1. Create system account for mint with space: mintLen
      transaction.add(
        SystemProgram.createAccount({
          fromPubkey: ownerPublicKey,
          newAccountPubkey: mintPublicKey,
          space: mintLen,
          lamports,
          programId: TOKEN_2022_PROGRAM_ID,
        })
      );

      // 2. Initialize metadata pointer to point to the mint itself
      transaction.add(
        createInitializeMetadataPointerInstruction(
          mintPublicKey,
          ownerPublicKey, // authority that can update pointer
          mintPublicKey, // metadata address is the mint itself
          TOKEN_2022_PROGRAM_ID
        )
      );

      // 3. Initialize the mint with InitializeMint2
      transaction.add(
        createInitializeMint2Instruction(
          mintPublicKey,
          parsedDecimals,
          ownerPublicKey, // mint authority
          null, // freeze authority (null)
          TOKEN_2022_PROGRAM_ID
        )
      );

      // 4. Initialize metadata on the mint account (reallocates account to fit metadata)
      transaction.add(
        createInitializeInstruction({
          programId: TOKEN_2022_PROGRAM_ID,
          mint: mintPublicKey,
          metadata: mintPublicKey,
          name: metadata.name,
          symbol: metadata.symbol,
          uri: metadata.uri,
          mintAuthority: ownerPublicKey,
          updateAuthority: ownerPublicKey,
        })
      );

      setStatusMessage("Please approve the transaction in your wallet...");

      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      transaction.recentBlockhash = latestBlockhash.blockhash;
      transaction.feePayer = ownerPublicKey;

      // Partial sign with the new mint keypair first
      transaction.partialSign(mintKeypair);

      let signature: string;

      if (wallet.signTransaction) {
        // Request wallet to sign the partially signed transaction
        const signedTx = await wallet.signTransaction(transaction);
        setStatusMessage("Broadcasting transaction to Solana Devnet...");
        signature = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: true,
          maxRetries: 5,
        });
      } else {
        signature = await wallet.sendTransaction(transaction, connection, {
          signers: [mintKeypair],
          preflightCommitment: "confirmed",
        });
      }

      setStatusMessage(
        "Transaction submitted! Confirming on Solana Devnet..."
      );

      await confirmTransactionPolling(signature, connection);


      const newToken: CreatedToken = {
        mint: mintPublicKey.toBase58(),
        name: tokenName,
        symbol: tokenSymbol,
        uri: tokenUri,
        decimals: parsedDecimals,
        initialSupply: "0",
        createdAt: new Date().toISOString(),
      };

      setCreatedToken(newToken);
      saveStoredToken(newToken);
      if (onTokenCreated) {
        onTokenCreated(newToken);
      }

      setStatusType("success");
      setStatusMessage(
        `🎉 Token "${tokenName}" (${tokenSymbol}) launched successfully on Devnet!`
      );
      triggerSuccessConfetti();
    } catch (err: unknown) {
      console.error("Token creation error:", err);
      if (err && typeof err === "object") {
        if ("logs" in err && Array.isArray((err as any).logs)) {
          console.error("Solana simulation logs:", (err as any).logs);
        } else if ("getLogs" in err && typeof (err as any).getLogs === "function") {
          try {
            const logs = await (err as any).getLogs(connection);
            console.error("Solana simulation logs:", logs);
          } catch {}
        }
      }
      setStatusType("error");
      const errString = err instanceof Error ? err.message : String(err);
      if (errString.includes("User rejected")) {
        setStatusMessage("Transaction was cancelled in wallet.");
      } else if (errString.includes("Blockhash not found") || errString.includes("expired")) {
        setStatusMessage(
          "Transaction expired before wallet approval. Please click Deploy Token again and approve in Phantom promptly."
        );
      } else if (errString.includes("0x1")) {
        setStatusMessage(
          "Insufficient SOL balance for rent exemption and gas fees. Please get Devnet SOL."
        );
      } else {
        setStatusMessage(
          `Token creation failed: ${errString.slice(0, 140)}`
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header Info */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-medium mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
          Solana Devnet Token-2022 Standard
        </div>
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Create Solana Token
        </h2>
        <p className="mt-2 text-sm text-zinc-400 max-w-lg mx-auto">
          Deploy a custom SPL Token-2022 on Solana Devnet with built-in on-chain
          metadata pointer. You can mint tokens to yourself and anyone else.
        </p>
      </div>

      {/* Success Notification Banner */}
      {createdToken && (
        <div className="mb-8 p-5 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-zinc-900/60 to-emerald-900/20 border border-emerald-500/40 shadow-xl backdrop-blur-sm">
          <div className="flex items-start gap-3.5">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-base font-semibold text-white">
                  {createdToken.name} (${createdToken.symbol})
                </h4>
                <span className="px-2 py-0.5 text-xs rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Live on Devnet
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Token Mint & On-Chain Metadata created on Devnet (Decimals: {createdToken.decimals})
              </p>

              {/* Mint address block */}
              <div className="mt-3 flex items-center gap-2 bg-black/40 p-2.5 rounded-lg border border-zinc-800 font-mono text-xs text-zinc-300">
                <span className="text-zinc-500 select-none">Mint:</span>
                <span className="truncate flex-1 font-mono text-emerald-400">
                  {createdToken.mint}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(createdToken.mint)}
                  className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded transition cursor-pointer"
                  title="Copy Mint Address"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
                <a
                  href={getExplorerUrl(createdToken.mint, "address", "devnet")}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2 py-1 text-xs bg-violet-600/30 hover:bg-violet-600/50 text-violet-300 rounded transition flex items-center gap-1"
                >
                  Explorer
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              </div>

              {/* Quick action button to navigate to Minter */}
              {onNavigateToMint && (
                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onNavigateToMint(createdToken.mint)}
                    className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 shadow-md shadow-emerald-500/20 transition transform hover:-translate-y-0.5"
                  >
                    <span>Mint this Token to a Recipient</span>
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M14 5l7 7m0 0l-7 7m7-7H3"
                      />
                    </svg>
                  </button>
                  <span className="text-xs text-zinc-400">
                    Send to any wallet address
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Creation Card */}
      <div className="bg-zinc-900/80 backdrop-blur-md border border-zinc-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-teal-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Live Animated Holographic Token Preview Badge */}
        <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-violet-950/40 via-zinc-900/60 to-teal-950/40 border border-violet-500/20 shimmer-wrapper shadow-lg flex items-center justify-between gap-4 animate-float">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="relative flex-shrink-0">
              <div className="w-12 h-12 rounded-2xl overflow-hidden bg-zinc-950 border border-violet-500/40 flex items-center justify-center p-0.5 shadow-md shadow-violet-500/20">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="Token Preview"
                    className="w-full h-full object-cover rounded-[14px]"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-full h-full rounded-[14px] bg-gradient-to-br from-violet-600 via-indigo-600 to-teal-400 flex items-center justify-center text-white font-bold text-lg animate-pulse-glow">
                    {symbol ? symbol.slice(0, 2) : "🪙"}
                  </div>
                )}
              </div>
              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-zinc-900 flex items-center justify-center text-[9px] text-zinc-950 font-bold">
                ✓
              </span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm sm:text-base font-bold text-white truncate">
                  {name || "Your Token Name"}
                </h4>
                <span className="px-2 py-0.5 rounded-md bg-violet-500/20 border border-violet-500/30 text-violet-300 font-mono text-xs font-semibold">
                  ${symbol || "SYMBOL"}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-2">
                <span>Standard: <strong className="text-zinc-300">Token-2022</strong></span>
                <span>•</span>
                <span>Decimals: <strong className="text-zinc-300">{decimals}</strong></span>
              </p>
            </div>
          </div>

          <div className="hidden sm:flex flex-col items-end text-right flex-shrink-0">
            <span className="text-[10px] uppercase font-semibold tracking-wider text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-ping" />
              Live Preview
            </span>
            <span className="text-[11px] text-zinc-500 mt-1">Updates in real time</span>
          </div>
        </div>

        <form onSubmit={createToken} className="space-y-5 relative">
          {/* Row 1: Name & Symbol */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="token-name"
                className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5"
              >
                Token Name <span className="text-rose-400">*</span>
              </label>
              <input
                id="token-name"
                type="text"
                value={name}
                maxLength={32}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Solana Emerald"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950/70 border border-zinc-700/70 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 text-white placeholder-zinc-500 text-sm transition outline-none"
                required
              />
            </div>
            <div>
              <label
                htmlFor="token-symbol"
                className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5"
              >
                Token Symbol <span className="text-rose-400">*</span>
              </label>
              <input
                id="token-symbol"
                type="text"
                value={symbol}
                maxLength={10}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="e.g. EMERALD"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950/70 border border-zinc-700/70 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 text-white placeholder-zinc-500 text-sm uppercase transition outline-none"
                required
              />
            </div>
          </div>

          {/* Row 2: Metadata URI / Image URL */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="token-uri"
                className="block text-xs font-semibold uppercase tracking-wider text-zinc-400"
              >
                Metadata / Image URL <span className="text-rose-400">*</span>
              </label>
              <button
                type="button"
                onClick={() =>
                  setImageUrl(
                    "https://raw.githubusercontent.com/solana-developers/opos-asset/main/assets/Compressed-NFT/image.png"
                  )
                }
                className="text-xs text-violet-400 hover:text-violet-300 transition cursor-pointer"
              >
                Use sample image
              </button>
            </div>
            <div className="flex gap-3">
              <input
                id="token-uri"
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/logo.png or metadata.json"
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-zinc-950/70 border border-zinc-700/70 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 text-white placeholder-zinc-500 text-sm transition outline-none"
                required
              />
              {imageUrl && (
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700 flex-shrink-0 flex items-center justify-center">
                  <img
                    src={imageUrl}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Provide a direct HTTPS image URL or a JSON metadata URI.
            </p>
          </div>

          {/* Row 3: Decimals */}
          <div>
            <label
              htmlFor="token-decimals"
              className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5"
            >
              Decimals
            </label>
            <select
              id="token-decimals"
              value={decimals}
              onChange={(e) => setDecimals(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950/70 border border-zinc-700/70 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 text-white text-sm transition outline-none"
            >
              <option value="9">9 (Solana native standard - Recommended)</option>
              <option value="6">6 (USDC / USDT standard)</option>
              <option value="2">2 (Fiat currency style)</option>
              <option value="0">0 (Whole units, NFT / Gaming)</option>
            </select>
            <div className="mt-3 p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-xs text-zinc-300 flex items-start gap-2.5">
              <span className="text-violet-400 text-sm">💡</span>
              <span>
                <strong>Step 1:</strong> Deploy your token and on-chain metadata. Once confirmed, you can instantly mint tokens to yourself or any recipient address in <strong>Step 2 (Mint to Address)</strong>.
              </span>
            </div>
          </div>

          {/* Wallet requirement banner if not connected */}
          {!wallet.publicKey && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
              <svg
                className="w-4 h-4 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span>
                Please connect your Devnet wallet using the button at the top to
                create this token.
              </span>
            </div>
          )}

          {/* Status Message */}
          {statusMessage && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-start gap-2 border ${
                statusType === "error"
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                  : statusType === "success"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : "bg-violet-500/10 border-violet-500/30 text-violet-300"
              }`}
            >
              {isSubmitting && (
                <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin flex-shrink-0 mt-0.5" />
              )}
              <span className="flex-1">{statusMessage}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !wallet.publicKey}
            className="w-full group cursor-pointer py-3.5 px-6 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-violet-600 via-indigo-600 to-teal-500 hover:from-violet-500 hover:via-indigo-500 hover:to-teal-400 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-xl shadow-violet-600/25 hover:shadow-violet-500/40 transition-all duration-200 flex items-center justify-center gap-2.5 relative overflow-hidden"
          >
            {isSubmitting ? (
              <>
                <span className="text-xl animate-bounce">🚀</span>
                <span className="font-semibold tracking-wide animate-pulse">
                  Deploying Token to Solana Devnet…
                </span>
              </>
            ) : (
              <>
                <span className="text-lg group-hover:rotate-12 group-hover:scale-125 transition-transform duration-200">
                  ✨
                </span>
                <span className="tracking-wide">Deploy Token</span>
                <span className="text-xs opacity-75 group-hover:translate-x-1 transition-transform">
                  →
                </span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
