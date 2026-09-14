import {
  ConnectionProvider,
  useConnection,
  useWallet,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import {
  WalletDisconnectButton,
  WalletModalProvider,
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import "@solana/wallet-adapter-react-ui/styles.css";
import Launchpad from "./components/Launchpad";
import Minter from "./components/Minter";
import { CreatedToken, truncateAddress } from "./lib/token";

const RPC_URL = import.meta.env.VITE_RPC_URL?.trim() || clusterApiUrl("devnet");

type ActiveTab = "launch" | "mint";

function LaunchpadDashboard() {
  const wallet = useWallet();
  const { connection } = useConnection();

  const [activeTab, setActiveTab] = useState<ActiveTab>("launch");
  const [selectedMintForMinter, setSelectedMintForMinter] = useState<string>("");
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);

  // Fetch Devnet SOL balance
  const fetchBalance = useCallback(async () => {
    if (!wallet.publicKey) {
      setSolBalance(null);
      return;
    }
    try {
      setIsRefreshingBalance(true);
      const bal = await connection.getBalance(wallet.publicKey, "confirmed");
      setSolBalance(bal / LAMPORTS_PER_SOL);
    } catch (err) {
      console.warn("Failed to fetch devnet balance:", err);
    } finally {
      setIsRefreshingBalance(false);
    }
  }, [wallet.publicKey, connection]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  function handleNavigateToMint(mintAddress: string) {
    setSelectedMintForMinter(mintAddress);
    setActiveTab("mint");
  }

  function handleTokenCreated(token: CreatedToken) {
    setSelectedMintForMinter(token.mint);
    // Refresh balance after transaction
    fetchBalance();
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-violet-500 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-lg">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between">
          {/* Logo / Branding */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-teal-400 p-0.5 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <div className="w-full h-full bg-zinc-950 rounded-[10px] flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-teal-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white">
                  Solana Launchpad
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                  Devnet
                </span>
              </div>
              <p className="text-xs text-zinc-400 hidden sm:block">
                Token-2022 Creator &amp; Minter
              </p>
            </div>
          </div>

          {/* Right Header: Balance & Wallet */}
          <div className="flex items-center gap-3">
            {wallet.publicKey && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs">
                <span className="text-zinc-500">Devnet SOL:</span>
                <span className="font-mono font-medium text-emerald-400">
                  {solBalance !== null ? solBalance.toFixed(3) : "..."} SOL
                </span>
                <button
                  type="button"
                  onClick={fetchBalance}
                  title="Refresh Devnet Balance"
                  disabled={isRefreshingBalance}
                  className="p-1 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
                >
                  <svg
                    className={`w-3.5 h-3.5 ${isRefreshingBalance ? "animate-spin" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <WalletMultiButton />
              {wallet.publicKey && (
                <div className="hidden md:block">
                  <WalletDisconnectButton />
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">
        {/* Wallet Not Connected Notice */}
        {!wallet.publicKey && (
          <div className="mb-10 rounded-2xl bg-gradient-to-r from-violet-900/30 via-indigo-900/20 to-teal-900/30 border border-violet-500/20 p-6 sm:p-8 text-center backdrop-blur-sm">
            <div className="inline-flex p-3 rounded-2xl bg-violet-500/10 border border-violet-500/20 text-violet-400 mb-4">
              <svg
                className="w-8 h-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Connect Your Wallet to Get Started
            </h2>
            <p className="text-sm text-zinc-400 max-w-md mx-auto mb-6">
              Connect your Phantom or Solana wallet set to <strong>Devnet</strong>.
              You will be able to create custom tokens with on-chain metadata and
              mint them to any address.
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <div className="scale-105">
                <WalletMultiButton />
              </div>
              <a
                href="https://faucet.solana.com"
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-medium transition flex items-center gap-1.5"
              >
                <span>Get Free Devnet SOL Faucet</span>
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
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            </div>

            {/* Phantom Devnet Config Tip */}
            <div className="mt-6 pt-4 border-t border-zinc-800/80 max-w-lg mx-auto text-left">
              <div className="flex items-start gap-2 text-[12px] text-zinc-400">
                <span className="text-violet-400 font-bold flex-shrink-0">⚠️ Phantom Note:</span>
                <span>
                  In Phantom, enable <strong>Settings ⚙️ ➔ Developer Settings ➔ Testnet Mode</strong> and select <strong>Solana Devnet</strong>. Otherwise, Phantom will try to simulate transactions on Mainnet and show a simulation error.
                </span>
              </div>
            </div>
          </div>
        )}


        {/* Low Devnet SOL warning */}
        {wallet.publicKey && solBalance !== null && solBalance < 0.05 && (
          <div className="mb-8 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5 flex-shrink-0 text-amber-400"
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
                Your Devnet balance is low (<strong>{solBalance.toFixed(3)} SOL</strong>).
                Creating a Token-2022 mint requires ~0.005 SOL for account rent exemption.
              </span>
            </div>
            <a
              href="https://faucet.solana.com"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold transition"
            >
              Airdrop SOL →
            </a>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center justify-center mb-8">
          <div className="inline-flex p-1 rounded-xl bg-zinc-900/90 border border-zinc-800 shadow-lg">
            <button
              type="button"
              onClick={() => setActiveTab("launch")}
              className={`cursor-pointer px-5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center gap-2 ${
                activeTab === "launch"
                  ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-600/30"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              <span>1. Create Token</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("mint")}
              className={`cursor-pointer px-5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center gap-2 ${
                activeTab === "mint"
                  ? "bg-gradient-to-r from-teal-500 to-emerald-600 text-zinc-950 shadow-md shadow-teal-500/30"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              <span>2. Mint to Address</span>
              {selectedMintForMinter && (
                <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
              )}
            </button>
          </div>
        </div>

        {/* Tab Views */}
        <div className="transition-all duration-200">
          {activeTab === "launch" ? (
            <Launchpad
              onTokenCreated={handleTokenCreated}
              onNavigateToMint={handleNavigateToMint}
            />
          ) : (
            <Minter
              defaultMintAddress={selectedMintForMinter}
              onNavigateToLaunchpad={() => setActiveTab("launch")}
            />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/80 py-6 text-center text-xs text-zinc-500">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>Solana Devnet Token Launchpad &amp; Minter</p>
          <div className="flex items-center gap-4 text-zinc-400">
            <a
              href="https://faucet.solana.com"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition"
            >
              Solana Faucet
            </a>
            <span>•</span>
            <a
              href="https://explorer.solana.com/?cluster=devnet"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition"
            >
              Solana Explorer (Devnet)
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <LaunchpadDashboard />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

