import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ExtensionType,
  getExtensionData,
} from "@solana/spl-token";
import { unpack } from "@solana/spl-token-metadata";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useEffect, useState } from "react";
import {
  confirmTransactionPolling,
  CreatedToken,
  getExplorerUrl,
  getStoredTokens,
  parseTokenAmount,
  truncateAddress,
} from "../lib/token";
import { triggerMintConfetti } from "../lib/confetti";

interface MinterProps {
  defaultMintAddress?: string;
  onNavigateToLaunchpad?: () => void;
}

export function Minter({
  defaultMintAddress = "",
  onNavigateToLaunchpad,
}: MinterProps) {
  const wallet = useWallet();
  const { connection } = useConnection();

  const [mintAddress, setMintAddress] = useState(defaultMintAddress);
  const [recipientAddress, setRecipientAddress] = useState("");
  const [amount, setAmount] = useState("100");

  const [mintAuthority, setMintAuthority] = useState<string | null>(null);
  const [tokenDecimals, setTokenDecimals] = useState<number>(9);
  const [programType, setProgramType] = useState<string>("Token-2022");
  const [tokenMetadata, setTokenMetadata] = useState<{
    name: string;
    symbol: string;
    uri: string;
  } | null>(null);
  const [isLoadingMintInfo, setIsLoadingMintInfo] = useState(false);
  const [mintInfoError, setMintInfoError] = useState("");

  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState<"info" | "success" | "error">(
    "info"
  );
  const [isMinting, setIsMinting] = useState(false);
  const [lastTxSignature, setLastTxSignature] = useState<string | null>(null);
  const [lastMintedDetails, setLastMintedDetails] = useState<{
    amount: string;
    recipient: string;
    mint: string;
  } | null>(null);

  const [recentTokens, setRecentTokens] = useState<CreatedToken[]>([]);

  useEffect(() => {
    setRecentTokens(getStoredTokens());
  }, []);

  useEffect(() => {
    if (defaultMintAddress) {
      setMintAddress(defaultMintAddress);
    }
  }, [defaultMintAddress]);

  useEffect(() => {
    if (wallet.publicKey && !recipientAddress) {
      setRecipientAddress(wallet.publicKey.toBase58());
    }
  }, [wallet.publicKey]);

  // Query mint info when mint address is valid
  useEffect(() => {
    let isCancelled = false;
    const trimmed = mintAddress.trim();

    if (!trimmed) {
      setMintAuthority(null);
      setMintInfoError("");
      return;
    }

    let pubkey: PublicKey;
    try {
      pubkey = new PublicKey(trimmed);
    } catch {
      setMintInfoError("Invalid Solana base58 mint address.");
      setMintAuthority(null);
      return;
    }

    async function inspectMint() {
      setIsLoadingMintInfo(true);
      setMintInfoError("");
      try {
        const accInfo = await connection.getAccountInfo(pubkey);
        if (isCancelled) return;

        if (!accInfo) {
          setMintInfoError(
            "Account does not exist on Solana Devnet. Check the address."
          );
          setMintAuthority(null);
          return;
        }

        const isToken2022 = accInfo.owner.equals(TOKEN_2022_PROGRAM_ID);
        const isToken = accInfo.owner.equals(TOKEN_PROGRAM_ID);

        if (!isToken2022 && !isToken) {
          setMintInfoError(
            "This account is not a recognized SPL Token or Token-2022 Mint."
          );
          setMintAuthority(null);
          return;
        }

        const progId = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
        setProgramType(isToken2022 ? "Token-2022" : "SPL Token");

        const mintData = await getMint(
          connection,
          pubkey,
          "confirmed",
          progId
        );
        if (isCancelled) return;

        setTokenDecimals(mintData.decimals);
        setMintAuthority(
          mintData.mintAuthority ? mintData.mintAuthority.toBase58() : null
        );

        // Fetch on-chain Token-2022 metadata if present
        let parsedMeta: { name: string; symbol: string; uri: string } | null = null;
        if (isToken2022 && mintData.tlvData) {
          try {
            const metadataTlv = getExtensionData(
              ExtensionType.TokenMetadata,
              mintData.tlvData
            );
            if (metadataTlv) {
              const unpacked = unpack(metadataTlv);
              parsedMeta = {
                name: unpacked.name.trim(),
                symbol: unpacked.symbol.trim(),
                uri: unpacked.uri.trim(),
              };
            }
          } catch {
            // Non-fatal if metadata extension is missing or unparseable
          }
        }
        setTokenMetadata(parsedMeta);
      } catch (err) {
        if (isCancelled) return;
        setMintInfoError(
          err instanceof Error
            ? err.message
            : "Could not fetch mint details from Devnet."
        );
        setMintAuthority(null);
        setTokenMetadata(null);
      } finally {
        if (!isCancelled) {
          setIsLoadingMintInfo(false);
        }
      }
    }

    inspectMint();

    return () => {
      isCancelled = true;
    };
  }, [mintAddress, connection]);

  async function handleMintTokens(e: React.FormEvent) {
    e.preventDefault();

    if (!wallet.publicKey) {
      setStatusType("error");
      setStatusMessage("Please connect your wallet first.");
      return;
    }

    const trimmedMint = mintAddress.trim();
    const trimmedRecipient = recipientAddress.trim();
    const trimmedAmount = amount.trim();

    if (!trimmedMint) {
      setStatusType("error");
      setStatusMessage("Enter a valid Token Mint address.");
      return;
    }
    if (!trimmedRecipient) {
      setStatusType("error");
      setStatusMessage("Enter a recipient Solana address.");
      return;
    }

    let mintPubkey: PublicKey;
    try {
      mintPubkey = new PublicKey(trimmedMint);
    } catch {
      setStatusType("error");
      setStatusMessage("Invalid Token Mint address format.");
      return;
    }

    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(trimmedRecipient);
    } catch {
      setStatusType("error");
      setStatusMessage("Invalid Recipient address format.");
      return;
    }

    let rawAmount: bigint;
    try {
      rawAmount = parseTokenAmount(trimmedAmount, tokenDecimals);
    } catch (err) {
      setStatusType("error");
      setStatusMessage(
        err instanceof Error ? err.message : "Invalid token amount."
      );
      return;
    }

    try {
      setIsMinting(true);
      setStatusType("info");
      setStatusMessage("Verifying token mint and program on Devnet...");

      // Check account program
      const mintAcc = await connection.getAccountInfo(mintPubkey);
      if (!mintAcc) {
        throw new Error(
          "Token mint account not found on Devnet. Verify the address."
        );
      }

      const programId = mintAcc.owner.equals(TOKEN_2022_PROGRAM_ID)
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;

      // Verify mint authority
      const mintData = await getMint(
        connection,
        mintPubkey,
        "confirmed",
        programId
      );
      if (
        !mintData.mintAuthority ||
        !mintData.mintAuthority.equals(wallet.publicKey)
      ) {
        throw new Error(
          `Your wallet (${truncateAddress(
            wallet.publicKey.toBase58()
          )}) is not the designated mint authority for this token (${truncateAddress(
            mintData.mintAuthority?.toBase58() || "None"
          )}).`
        );
      }

      setStatusMessage("Resolving recipient Associated Token Account (ATA)...");

      const recipientAta = getAssociatedTokenAddressSync(
        mintPubkey,
        recipientPubkey,
        false,
        programId
      );

      const transaction = new Transaction();

      // 1. Create ATA idempotently if it doesn't already exist
      transaction.add(
        createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey, // payer for rent if created
          recipientAta,
          recipientPubkey, // owner of the ATA
          mintPubkey,
          programId
        )
      );

      // 2. Mint tokens to recipient ATA
      transaction.add(
        createMintToInstruction(
          mintPubkey,
          recipientAta,
          wallet.publicKey, // mint authority
          rawAmount,
          [],
          programId
        )
      );

      setStatusMessage("Please approve transaction in your wallet...");

      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      transaction.recentBlockhash = latestBlockhash.blockhash;
      transaction.feePayer = wallet.publicKey;

      let signature: string;
      if (wallet.signTransaction) {
        const signedTx = await wallet.signTransaction(transaction);
        setStatusMessage("Broadcasting mint transaction to Devnet...");
        signature = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: true,
          maxRetries: 5,
        });
      } else {
        signature = await wallet.sendTransaction(transaction, connection, {
          preflightCommitment: "confirmed",
        });
      }

      setStatusMessage("Mint transaction broadcasted! Confirming on Devnet...");


      await confirmTransactionPolling(signature, connection);

      // Trigger celebratory confetti burst!
      triggerMintConfetti();

      setLastTxSignature(signature);
      setLastMintedDetails({
        amount: trimmedAmount,
        recipient: trimmedRecipient,
        mint: trimmedMint,
      });

      setStatusType("success");
      setStatusMessage(
        `Successfully minted ${trimmedAmount} tokens to ${truncateAddress(
          trimmedRecipient,
          6
        )}!`
      );
    } catch (err: unknown) {
      console.error("Minting failed:", err);
      setStatusType("error");
      const errString = err instanceof Error ? err.message : String(err);
      if (errString.includes("User rejected")) {
        setStatusMessage("Transaction was cancelled in wallet.");
      } else {
        setStatusMessage(`Mint failed: ${errString.slice(0, 160)}`);
      }
    } finally {
      setIsMinting(false);
    }
  }

  const isConnectedAuthority =
    wallet.publicKey &&
    mintAuthority &&
    wallet.publicKey.toBase58() === mintAuthority;

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs font-medium mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
          Devnet Token Distribution
        </div>
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Mint Tokens to Any Address
        </h2>
        <p className="mt-2 text-sm text-zinc-400 max-w-lg mx-auto">
          Distribute tokens from your Token-2022 or SPL mint to any Solana
          wallet on Devnet. Recipient token accounts are created automatically.
        </p>
      </div>

      {/* Success Notification Banner */}
      {lastTxSignature && lastMintedDetails && (
        <div className="mb-8 p-5 rounded-2xl bg-gradient-to-br from-teal-950/60 via-zinc-900/80 to-emerald-950/50 border border-teal-500/50 shadow-2xl backdrop-blur-md animate-float relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-teal-500/20 rounded-full blur-2xl pointer-events-none animate-pulse-glow" />
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-500 text-zinc-950 shadow-lg shadow-teal-500/30 flex-shrink-0 animate-bounce">
              <span className="text-xl">🪙</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-base font-bold text-white">
                  Tokens Successfully Minted! 🎉
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 animate-pulse">
                  DEVNET CONFIRMED
                </span>
              </div>
              <p className="text-xs text-zinc-300 mt-1">
                Minted{" "}
                <span className="font-bold text-teal-300 text-sm">
                  {lastMintedDetails.amount}
                </span>{" "}
                tokens directly into recipient wallet{" "}
                <span className="font-mono text-zinc-200 bg-zinc-800/80 px-1.5 py-0.5 rounded">
                  {truncateAddress(lastMintedDetails.recipient, 6)}
                </span>
              </p>

              <div className="mt-3 flex items-center gap-2 bg-black/50 p-2.5 rounded-xl border border-zinc-800/80 text-xs text-zinc-300 backdrop-blur-sm">
                <span className="text-zinc-500 select-none">Signature:</span>
                <span className="truncate flex-1 font-mono text-teal-400">
                  {lastTxSignature}
                </span>
                <a
                  href={getExplorerUrl(lastTxSignature, "tx", "devnet")}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 text-xs bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 rounded-lg transition flex items-center gap-1 font-medium hover:scale-105 active:scale-95 duration-150"
                >
                  View on Explorer
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
            </div>
          </div>
        </div>
      )}

      {/* Main Card */}
      <div className="bg-zinc-900/80 backdrop-blur-md border border-zinc-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl">
        <form onSubmit={handleMintTokens} className="space-y-5">
          {/* Quick Select from Recent Tokens */}
          {recentTokens.length > 0 && (
            <div>
              <span className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                Recent Tokens You Created
              </span>
              <div className="flex flex-wrap gap-2">
                {recentTokens.slice(0, 4).map((tok) => (
                  <button
                    key={tok.mint}
                    type="button"
                    onClick={() => setMintAddress(tok.mint)}
                    className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-medium border transition flex items-center gap-1.5 ${
                      mintAddress === tok.mint
                        ? "bg-violet-500/20 border-violet-500/50 text-violet-300"
                        : "bg-zinc-800/60 border-zinc-700/60 hover:bg-zinc-800 text-zinc-300"
                    }`}
                  >
                    <span>{tok.name}</span>
                    <span className="text-zinc-500 font-mono">
                      (${tok.symbol})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Token Mint Address Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="mint-address"
                className="block text-xs font-semibold uppercase tracking-wider text-zinc-400"
              >
                Token Mint Address <span className="text-rose-400">*</span>
              </label>
              {onNavigateToLaunchpad && (
                <button
                  type="button"
                  onClick={onNavigateToLaunchpad}
                  className="text-xs text-teal-400 hover:text-teal-300 transition cursor-pointer"
                >
                  Create a new token first →
                </button>
              )}
            </div>
            <input
              id="mint-address"
              type="text"
              value={mintAddress}
              onChange={(e) => setMintAddress(e.target.value)}
              placeholder="e.g. 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950/70 border border-zinc-700/70 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 text-white placeholder-zinc-500 text-sm font-mono transition outline-none"
              required
            />

            {/* Mint Info Status Pill */}
            {isLoadingMintInfo && (
              <p className="mt-1.5 text-xs text-zinc-400 flex items-center gap-1.5">
                <span className="w-3 h-3 border border-teal-400 border-t-transparent rounded-full animate-spin" />
                Querying mint account from Devnet...
              </p>
            )}

            {mintInfoError && (
              <p className="mt-1.5 text-xs text-rose-400">{mintInfoError}</p>
            )}

            {mintAuthority && !isLoadingMintInfo && (
              <div className="mt-2 p-2.5 rounded-lg bg-zinc-950/50 border border-zinc-800 text-xs flex flex-col gap-1">
                <div className="flex items-center justify-between text-zinc-400">
                  <span>Standard: <strong className="text-zinc-200">{programType}</strong></span>
                  <span>Decimals: <strong className="text-zinc-200">{tokenDecimals}</strong></span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Mint Authority:</span>
                  <span className="font-mono text-zinc-300">
                    {truncateAddress(mintAuthority, 6)}
                  </span>
                </div>
                {wallet.publicKey && !isConnectedAuthority && (
                  <div className="mt-1 text-amber-400 text-[11px] bg-amber-500/10 p-1.5 rounded border border-amber-500/20">
                    ⚠️ Your connected wallet is not the mint authority. Minting
                    will fail unless signed by the authority.
                  </div>
                )}
                {isConnectedAuthority && (
                  <div className="mt-1 text-emerald-400 text-[11px] flex items-center gap-1">
                    <span>✓</span> You are the authorized mint authority!
                  </div>
                )}
                {tokenMetadata && (
                  <div className="mt-2 pt-2 border-t border-zinc-800 flex items-center gap-2.5">
                    {tokenMetadata.uri && (
                      <img
                        src={tokenMetadata.uri}
                        alt={tokenMetadata.name}
                        className="w-7 h-7 rounded-lg object-cover bg-zinc-800 border border-zinc-700 flex-shrink-0"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white text-xs truncate">
                        {tokenMetadata.name || "Unnamed Token"}
                      </div>
                      <div className="text-teal-400 font-mono text-[11px] truncate">
                        ${tokenMetadata.symbol || "UNKNOWN"}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Recipient Address */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="recipient-address"
                className="block text-xs font-semibold uppercase tracking-wider text-zinc-400"
              >
                Recipient Solana Address <span className="text-rose-400">*</span>
              </label>
              {wallet.publicKey && (
                <button
                  type="button"
                  onClick={() =>
                    setRecipientAddress(wallet.publicKey?.toBase58() || "")
                  }
                  className="text-xs text-teal-400 hover:text-teal-300 transition cursor-pointer"
                >
                  Send to My Wallet
                </button>
              )}
            </div>
            <input
              id="recipient-address"
              type="text"
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              placeholder="Solana wallet address (e.g. 4ESPKZUd...)"
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950/70 border border-zinc-700/70 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 text-white placeholder-zinc-500 text-sm font-mono transition outline-none"
              required
            />
            <p className="mt-1 text-xs text-zinc-500">
              The recipient does not need to pre-create a token account. One will
              be created automatically.
            </p>
          </div>

          {/* Amount to Mint */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="mint-amount"
                className="block text-xs font-semibold uppercase tracking-wider text-zinc-400"
              >
                Amount to Mint <span className="text-rose-400">*</span>
              </label>
              <span className="text-[11px] text-teal-400 font-mono">
                Decimals: {tokenDecimals}
              </span>
            </div>
            <div className="space-y-2">
              <input
                id="mint-amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="100"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950/70 border border-zinc-700/70 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 text-white placeholder-zinc-500 text-sm font-mono transition outline-none"
                required
              />
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-zinc-500 font-medium">Quick Presets:</span>
                {["100", "1,000", "10,000", "100,000", "1,000,000"].map((preset) => {
                  const rawVal = preset.replace(/,/g, "");
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAmount(rawVal)}
                      className={`cursor-pointer px-2.5 py-1 rounded-lg text-xs font-mono font-medium border transition-all duration-150 hover:scale-105 active:scale-95 ${
                        amount === rawVal
                          ? "bg-teal-500/20 border-teal-500/60 text-teal-300 shadow-sm shadow-teal-500/20"
                          : "bg-zinc-800/80 hover:bg-zinc-700/90 border-zinc-700/60 text-zinc-300"
                      }`}
                    >
                      +{preset}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Wallet check */}
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
              <span>Connect your wallet to execute this mint transaction.</span>
            </div>
          )}

          {/* Status Message */}
          {statusMessage && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-start gap-2 border transition-all duration-200 ${
                statusType === "error"
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                  : statusType === "success"
                  ? "bg-teal-500/10 border-teal-500/30 text-teal-300"
                  : "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
              }`}
            >
              {isMinting && (
                <div className="w-4 h-4 border-2 border-teal-400 border-t-transparent rounded-full animate-spin flex-shrink-0 mt-0.5" />
              )}
              <span className="flex-1">{statusMessage}</span>
            </div>
          )}

          {/* Mint Submit Button */}
          <button
            type="submit"
            disabled={isMinting || !wallet.publicKey}
            className="w-full cursor-pointer py-3.5 px-6 rounded-xl font-bold text-sm text-zinc-950 bg-gradient-to-r from-teal-400 via-emerald-400 to-cyan-400 hover:from-teal-300 hover:via-emerald-300 hover:to-cyan-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg shadow-teal-500/25 transition-all duration-200 flex items-center justify-center gap-2 group relative overflow-hidden"
          >
            {isMinting ? (
              <>
                <span className="text-base animate-spin">🪙</span>
                <span className="font-semibold tracking-wide">
                  Minting Tokens on Solana Devnet…
                </span>
              </>
            ) : (
              <>
                <span className="text-base transition-transform duration-200 group-hover:scale-125 group-hover:rotate-12">
                  🪙
                </span>
                <span className="tracking-wide">Mint Tokens to Recipient</span>
                <span className="text-base transition-transform duration-200 group-hover:translate-x-1">
                  ✨
                </span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
export default Minter;

