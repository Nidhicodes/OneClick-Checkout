import { Web3AuthOptions } from "@web3auth/modal";
import { WEB3AUTH_NETWORK, CHAIN_NAMESPACES } from "@web3auth/base";
import { Web3AuthContextConfig } from "@web3auth/modal/react";
import { SolanaWallet } from "@web3auth/solana-provider";

// Chain configuration for Solana
export const solanaChainConfig = {
  chainNamespace: CHAIN_NAMESPACES.SOLANA,
  chainId: "0x3", // Please use 0x1 for Mainnet, 0x2 for Testnet, 0x3 for Devnet
  rpcTarget: "https://api.devnet.solana.com",
  displayName: "Solana Devnet",
  blockExplorerUrl: "https://explorer.solana.com/?cluster=devnet",
  ticker: "SOL",
  tickerName: "Solana",
  logo: "https://images.toruswallet.io/sol.svg",
};

export const web3AuthOptions: Web3AuthOptions = {
  clientId: "BKwdhq5MpGJxiqkbDworiKYrsQ5XK5k_b9BtFqsbnrJ_SZXBj8BYwZpYYxmtylQJMPoQ0vOBSR3go3Pcgd44nj8",
  web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET, // Use the enum instead of string
  uiConfig: {
    appName: "Frictionless Checkout",
    logoLight: "https://your-domain.com/logo-light.png",
    logoDark: "https://your-domain.com/logo-dark.png",
    theme: {
      primary: "#0364ff",
      onPrimary: "#ffffff",
    },
  },
  // Disable discovery of injected wallets like MetaMask
  multiInjectedProviderDiscovery: false,
  // chainConfig is not part of Web3AuthOptions - it's configured separately
};

export const web3AuthContextConfig: Web3AuthContextConfig = {
  web3AuthOptions,
  // You can configure adapters here if needed
  // adapters: [solanaAdapter] // for example
};

// SolanaWallet is instantiated after Web3Auth login with the provider
// The chain configuration is used when initializing the wallet/adapter
export const createSolanaWallet = (provider: any) => {
  const wallet = new SolanaWallet(provider);
  // Chain config is typically used during adapter configuration
  return wallet;
};