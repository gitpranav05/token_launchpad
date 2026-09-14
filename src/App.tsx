import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import {
  WalletModalProvider,
  WalletDisconnectButton,
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import Launchpad from "./components/Launchpad";

export const RPC_URL = import.meta.env.VITE_RPC_URL;

function App() {

  return (
   <div className="bg-[#242424]">
      <ConnectionProvider endpoint={RPC_URL}>
        <WalletProvider wallets={[]} autoConnect>
          <WalletModalProvider>
            <div className="flex justify-between p-5 ">
              <WalletMultiButton />
              <WalletDisconnectButton />
            </div>
            {/* <TokenLaunchpad></TokenLaunchpad> */}
            <Launchpad></Launchpad>
            {/* <Minter></Minter> */}
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </div>
  )
}

export default App
