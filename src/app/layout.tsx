import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Web3AuthProviderWrapper } from "./Web3AuthProviderWrapper";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Frictionless Checkout",
  description: "Frictionless Walletless Checkout Demo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-gray-900 text-gray-100`}>
        <Web3AuthProviderWrapper>{children}</Web3AuthProviderWrapper>
      </body>
    </html>
  );
}
