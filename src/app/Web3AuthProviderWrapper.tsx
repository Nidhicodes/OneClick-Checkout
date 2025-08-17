'use client';

import { Web3AuthProvider } from "@web3auth/modal/react";
import { web3AuthContextConfig } from "./web3authContext";
import { ReactNode } from "react";

export function Web3AuthProviderWrapper({ children }: { children: ReactNode }) {
  return (
    <Web3AuthProvider config={web3AuthContextConfig}>
      {children}
    </Web3AuthProvider>
  );
}