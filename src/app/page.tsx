'use client';

import { useState, useEffect, FC, ReactNode } from 'react';
import Image from 'next/image';
import { useWeb3Auth, useWeb3AuthConnect, useWeb3AuthDisconnect, useWeb3AuthUser } from '@web3auth/modal/react';
import { Transaction, Connection, clusterApiUrl, Keypair, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createSolanaWallet, solanaChainConfig } from './web3authContext';
import { SolanaPrivateKeyProvider, SolanaWallet } from "@web3auth/solana-provider";

// Common USDC mint addresses on devnet (try these in order)
const POTENTIAL_USDC_MINTS = [
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // Circle USDC devnet (most common)
  'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', // Alternative devnet USDC
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Mainnet USDC (sometimes used in devnet)
];

// Multiple RPC endpoints to try
const RPC_ENDPOINTS = [
  clusterApiUrl('devnet'),
  'https://api.devnet.solana.com',
  'https://rpc.ankr.com/solana_devnet',
  'https://devnet.helius-rpc.com/?api-key=your-api-key'
];

// --- Data and Types ---
type Product = {
  id: string;
  name: string;
  price: number;
  image: string;
};

const products: Product[] = [
  {
    id: 'prod_1',
    name: 'Hackathon Hoodie',
    price: 20,
    image: 'bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-400',
  },
  {
    id: 'prod_2',
    name: 'Dev Tee',
    price: 15,
    image: 'bg-gradient-to-br from-green-400 to-blue-500',
  },
  {
    id: 'prod_3',
    name: 'WAGMI Cap',
    price: 10,
    image: 'bg-gradient-to-br from-yellow-400 via-red-500 to-pink-500',
  },
];

export default function Home() {
  const { provider, isConnected } = useWeb3Auth();
  const { connect, loading: connectLoading } = useWeb3AuthConnect();
  const { disconnect } = useWeb3AuthDisconnect();
  const { userInfo } = useWeb3AuthUser();
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<ReactNode>('');
  const [solanaAddress, setSolanaAddress] = useState<string>('');
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [isBalanceLoading, setIsBalanceLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [detectedUsdcMint, setDetectedUsdcMint] = useState<string | null>(null);
  const [workingRpc, setWorkingRpc] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const devMode = searchParams.get('dev') === 'true';

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isLoggedIn = isConnected || devMode;
  const displayEmail = devMode ? 'dev-user@example.com' : userInfo?.email;
  const displayAddress = devMode ? 'DEV_USER_WALLET_ADDRESS_PLACEHOLDER' : solanaAddress;

  const isValidSolanaAddress = (address: string): boolean => {
    if (!address) return false;
    try {
      new PublicKey(address);
      return true;
    } catch (error) {
      return false;
    }
  };

  async function derivePublicKeyFromPrivateKey(privateKey: string): Promise<string> {
    try {
      const { Keypair } = require('@solana/web3.js');
      const bs58 = require("bs58");
      
      let privateKeyBytes: Uint8Array;
      if (/^[0-9A-Fa-f]{64,}$/.test(privateKey)) {
        privateKeyBytes = new Uint8Array(privateKey.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
      } else {
        privateKeyBytes = bs58.decode(privateKey);
      }

      let keypair: Keypair;
      if (privateKeyBytes.length === 32) {
        keypair = Keypair.fromSeed(privateKeyBytes);
      } else if (privateKeyBytes.length === 64) {
        keypair = Keypair.fromSecretKey(privateKeyBytes);
      } else {
        throw new Error(`Unexpected private key length: ${privateKeyBytes.length}`);
      }

      return keypair.publicKey.toBase58();
    } catch (err) {
      console.error("Failed to derive Solana keypair:", err);
      return "";
    }
  }

  // Get a working RPC connection
  const getWorkingConnection = async (): Promise<Connection | null> => {
    if (workingRpc) {
      return new Connection(workingRpc, 'confirmed');
    }

    for (const endpoint of RPC_ENDPOINTS) {
      try {
        console.log(`🔌 Testing RPC: ${endpoint}`);
        const connection = new Connection(endpoint, 'confirmed');
        
        // Test the connection with a simple call
        await connection.getVersion();
        console.log(`✅ RPC working: ${endpoint}`);
        
        setWorkingRpc(endpoint);
        return connection;
      } catch (error) {
        console.log(`❌ RPC failed: ${endpoint}`, error);
        continue;
      }
    }
    
    console.error('❌ No working RPC endpoints found');
    return null;
  };

  // Debug function to check wallet tokens
  const debugWalletTokens = async (userAddress: string, connection: Connection) => {
    console.log(`🔍 Debug: Checking tokens for address: ${userAddress}`);
    
    try {
      const userPublicKey = new PublicKey(userAddress);
      
      // Check SOL balance first
      const solBalance = await connection.getBalance(userPublicKey);
      console.log(`💰 SOL Balance: ${solBalance / 1e9} SOL`);
      
      // Get ALL token accounts using the simpler method
      const tokenAccounts = await connection.getTokenAccountsByOwner(userPublicKey, {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      });
      
      console.log(`📊 Found ${tokenAccounts.value.length} token accounts`);
      
      for (let i = 0; i < tokenAccounts.value.length; i++) {
        const { pubkey } = tokenAccounts.value[i];
        console.log(`\n📍 Token Account ${i + 1}: ${pubkey.toBase58()}`);
        
        try {
          // Get token account balance
          const balance = await connection.getTokenAccountBalance(pubkey);
          console.log(`   Balance:`, balance);
          
          if (balance.value.uiAmount && balance.value.uiAmount > 0) {
            console.log(`   ✅ NON-ZERO BALANCE FOUND!`);
            console.log(`   Amount: ${balance.value.uiAmount}`);
            console.log(`   Decimals: ${balance.value.decimals}`);
            
            // Get the mint address from the token account
            try {
              const accountInfo = await connection.getAccountInfo(pubkey);
              if (accountInfo && accountInfo.data.length >= 32) {
                // First 32 bytes are the mint address in token account data
                const mintBytes = accountInfo.data.slice(0, 32);
                const mintAddress = new PublicKey(mintBytes).toBase58();
                console.log(`   🏷️ Mint Address: ${mintAddress}`);
                
                return {
                  balance: balance.value.uiAmount,
                  mint: mintAddress,
                  tokenAccount: pubkey.toBase58()
                };
              }
            } catch (err) {
              console.log(`   ⚠️ Could not get mint info:`, err);
            }
          }
        } catch (err) {
          console.log(`   ❌ Error getting balance:`, err);
        }
      }
      
      return { balance: 0, mint: null, tokenAccount: null };
      
    } catch (error) {
      console.error('❌ Debug wallet tokens failed:', error);
      return { balance: 0, mint: null, tokenAccount: null };
    }
  };

  // Improved USDC detection function
  const detectUsdcBalanceAndMint = async (connection: Connection, userPublicKey: PublicKey): Promise<{balance: number, mint: string | null}> => {
    console.log(`🔍 Starting USDC detection for address: ${userPublicKey.toBase58()}`);
    
    try {
      // Method 1: Try known USDC mints with better error handling
      console.log('📋 Method 1: Checking known USDC mints...');
      for (const mintAddress of POTENTIAL_USDC_MINTS) {
        try {
          console.log(`   🔍 Checking mint: ${mintAddress}`);
          const mint = new PublicKey(mintAddress);
          const ata = await getAssociatedTokenAddress(mint, userPublicKey, false);
          console.log(`   📍 ATA for ${mintAddress}: ${ata.toBase58()}`);
          
          // Check if the account exists first
          const accountInfo = await connection.getAccountInfo(ata);
          
          if (accountInfo && accountInfo.data && accountInfo.data.length > 0) {
            console.log(`   ✅ Account exists, checking balance...`);
            
            try {
              const balance = await connection.getTokenAccountBalance(ata);
              console.log(`   📊 Balance response:`, balance);
              
              if (balance?.value?.uiAmount && balance.value.uiAmount > 0) {
                console.log(`🎉 FOUND USDC! Mint: ${mintAddress}, Balance: ${balance.value.uiAmount}`);
                return { balance: balance.value.uiAmount, mint: mintAddress };
              } else {
                console.log(`   💸 Balance is zero for ${mintAddress}`);
              }
            } catch (balanceError) {
              console.log(`   ❌ Error getting balance for ${mintAddress}:`, balanceError);
            }
          } else {
            console.log(`   ❌ Account does not exist for mint ${mintAddress}`);
          }
        } catch (error) {
          console.log(`   ❌ Error with mint ${mintAddress}:`, error);
          continue;
        }
      }

      // Method 2: Debug and scan all token accounts
      console.log('📋 Method 2: Scanning all token accounts...');
      const debugResult = await debugWalletTokens(userPublicKey.toBase58(), connection);
      
      if (debugResult.balance > 0 && debugResult.mint) {
        console.log(`🎉 Found token via debug scan!`);
        return { balance: debugResult.balance, mint: debugResult.mint };
      }

      // Method 3: Alternative scanning method
      console.log('📋 Method 3: Alternative token account scanning...');
      try {
        const programAccounts = await connection.getProgramAccounts(
          new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
          {
            filters: [
              {
                memcmp: {
                  offset: 32, // owner field offset in token account
                  bytes: userPublicKey.toBase58(),
                },
              },
              {
                dataSize: 165, // size of token account
              }
            ],
          }
        );
        
        console.log(`📊 Found ${programAccounts.length} program accounts`);
        
        for (const { pubkey, account } of programAccounts) {
          try {
            const balance = await connection.getTokenAccountBalance(pubkey);
            if (balance.value.uiAmount && balance.value.uiAmount > 0) {
              // Extract mint from account data
              const mintBytes = account.data.slice(0, 32);
              const mintAddress = new PublicKey(mintBytes).toBase58();
              
              console.log(`🎯 Found token via program accounts! Balance: ${balance.value.uiAmount}, Mint: ${mintAddress}`);
              return { balance: balance.value.uiAmount, mint: mintAddress };
            }
          } catch (err) {
            console.log(`Error checking program account ${pubkey.toBase58()}:`, err);
          }
        }
      } catch (error) {
        console.log('❌ Program accounts method failed:', error);
      }
      
      console.log('❌ All methods failed to find USDC balance');
      return { balance: 0, mint: null };
      
    } catch (error) {
      console.error('💥 Error detecting USDC balance:', error);
      return { balance: 0, mint: null };
    }
  };

  useEffect(() => {
    const fetchWalletAddress = async () => {
      if (!isConnected || !provider) {
        setSolanaAddress('');
        setDebugInfo('Not connected or no provider available');
        return;
      }
      let address = '';
      try {
        const privateKey = await provider.request({ method: "private_key" }) as string;
        if (privateKey) {
          address = await derivePublicKeyFromPrivateKey(privateKey);
        }
      } catch (error) {
         console.log(error)
      }
      setSolanaAddress(address);
    };

    fetchWalletAddress();
  }, [isConnected, provider]);

  useEffect(() => {
    const fetchUsdcBalance = async () => {
      if (!solanaAddress || !isValidSolanaAddress(solanaAddress)) {
        setUsdcBalance(0);
        setDetectedUsdcMint(null);
        setIsBalanceLoading(false);
        return;
      }
      
      setIsBalanceLoading(true);
      setStatusMessage('Loading USDC balance...');
      
      try {
        console.log(`🚀 Starting USDC detection for: ${solanaAddress}`);
        
        // Get a working RPC connection
        const connection = await getWorkingConnection();
        if (!connection) {
          throw new Error('No working RPC endpoints available');
        }
        
        const userPublicKey = new PublicKey(solanaAddress);
        
        // Run the improved detection
        const { balance, mint } = await detectUsdcBalanceAndMint(connection, userPublicKey);
        
        setUsdcBalance(balance);
        setDetectedUsdcMint(mint);
        
        if (balance > 0 && mint) {
          console.log(`✅ USDC detected - Balance: ${balance}, Mint: ${mint}`);
          setStatusMessage('');
        } else {
          console.log('❌ No USDC balance found');
          setStatusMessage('');
        }
        
      } catch (error) {
        console.error("❌ Could not fetch USDC balance:", error);
        setUsdcBalance(0);
        setDetectedUsdcMint(null);
        setStatusMessage(`Error loading balance: ${(error as Error).message}`);
      } finally {
        setIsBalanceLoading(false);
      }
    };

    fetchUsdcBalance();
  }, [solanaAddress]);

  const handleLogin = async () => {
    try {
      setStatusMessage('Connecting to Web3Auth...');
      await connect();
      setStatusMessage('');
    } catch (error) {
      console.error('Login failed:', error);
      setStatusMessage(`Login failed: ${(error as Error).message}`);
    }
  };

  const handleLogout = async () => {
    try {
      await disconnect();
      setSolanaAddress('');
      setDebugInfo('');
      setStatusMessage('');
      setDetectedUsdcMint(null);
      setUsdcBalance(null);
      setWorkingRpc(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handlePayment = async () => {
    if (!selectedProduct) {
        setStatusMessage("Please select a product first.");
        return;
    }

    if (!isLoggedIn) {
      setStatusMessage("Please log in to pay");
      return;
    }

    if (devMode) {
      setIsProcessing(true);
      setStatusMessage('Processing payment...');
      setTimeout(() => {
        const fakeSignature = 'DEV_MODE_SIGNATURE_5kh3g9g8d3j4f8g9h0d4j5g8h9f0d3j4f8g9h0d4j5g8h9f0d3j4f8g9h0d4j5';
        fetch('/api/confirm-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signature: fakeSignature, product: selectedProduct }),
        });
        router.push(`/receipt/${fakeSignature}`);
        setIsProcessing(false);
      }, 2000);
      return;
    }

    if (!isValidSolanaAddress(solanaAddress)) {
      setStatusMessage("Invalid or missing Solana address. Please reconnect wallet.");
      return;
    }

    if (!provider) {
      setStatusMessage("Wallet provider not available");
      return;
    }

    if (!detectedUsdcMint) {
      setStatusMessage("No USDC token detected. Please ensure you have USDC in your wallet.");
      return;
    }

    setIsProcessing(true);
    setStatusMessage('Creating transaction...');

    try {
      const connection = await getWorkingConnection();
      if (!connection) {
        throw new Error('No working RPC connection available');
      }

      const res = await fetch('/api/solana-pay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          account: solanaAddress.trim(),
          product: selectedProduct,
          usdcMint: detectedUsdcMint // Pass the detected mint to your API
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`API error (${res.status}): ${errorText}`);
      }

      const responseData = await res.json();
      if (!responseData.transaction) {
        throw new Error('No transaction data received from API');
      }

      setStatusMessage('Signing transaction...');
      const transaction = Transaction.from(Buffer.from(responseData.transaction, 'base64'));

      const privateKeySeed = await provider.request({ method: "private_key" }) as string;
      const privateKeyBytes = new Uint8Array(privateKeySeed.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
      const keypair = Keypair.fromSeed(privateKeyBytes);
      const fullPrivateKey = Buffer.from(keypair.secretKey).toString('hex');

      const solanaPrivateProvider = await SolanaPrivateKeyProvider.getProviderInstance({
        chainConfig: solanaChainConfig,
        privKey: fullPrivateKey,
      });

      const solanaWallet = new SolanaWallet(solanaPrivateProvider as any);

      setStatusMessage('Sending transaction...');
      const { signature } = await solanaWallet.signAndSendTransaction(transaction);

      setStatusMessage('Confirming transaction...');
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        {
          signature,
          ...latestBlockhash,
        },
        "confirmed"
      );

      setStatusMessage('Recording payment...');
      await fetch('/api/confirm-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature, product: selectedProduct }),
      });

      router.push(`/receipt/${signature}`);

    } catch (error) {
      console.error("Payment failed:", error);
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('Attempt to debit an account but found no record of a prior credit') || errorMessage.includes('custom program error: 0x1')) {
        setStatusMessage(
          <div>
            <p className="font-semibold">Payment failed: Your new wallet is empty or has insufficient funds.</p>
            <p className="my-2 text-sm">Your address: <code className="bg-gray-700 p-1 rounded break-all">{solanaAddress}</code></p>
            <p className="text-sm">You'll need some Devnet SOL for transaction fees and some Devnet USDC for the purchase.</p>
            <div className="flex gap-4 mt-3 justify-center">
              <a href={`https://faucet.solana.com/?address=${solanaAddress}`} target="_blank" rel="noopener noreferrer" className="text-cyan-400 font-bold hover:underline">Get SOL</a>
              <a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer" className="text-cyan-400 font-bold hover:underline">Get USDC</a>
              <a href={`https://spl-token-faucet.com/?token-name=USDC&address=${solanaAddress}`} target="_blank" rel="noopener noreferrer" className="text-cyan-400 font-bold hover:underline">SPL Faucet</a>
            </div>
          </div>
        );
      } else {
        setStatusMessage(`Payment failed: ${errorMessage}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
    setStatusMessage('');
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedProduct(null);
  };

  const ProductCard: FC<{ product: Product; onSelect: (product: Product) => void }> = ({ product, onSelect }) => (
    <div 
      className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 cursor-pointer hover:border-cyan-400 transition-all group"
      onClick={() => onSelect(product)}
    >
      <div className={`w-full h-64 ${product.image} rounded-lg flex items-center justify-center text-white text-xl font-bold mb-4`}>
        {/* Product Image Placeholder */}
      </div>
      <h2 className="text-2xl font-semibold text-gray-200">{product.name}</h2>
      <p className="text-xl font-bold text-cyan-400 mt-1">{product.price} USDC</p>
      <button className="w-full mt-4 bg-gray-700 text-white font-bold py-2 rounded-md group-hover:bg-cyan-500 transition-all">
        Buy Now
      </button>
    </div>
  );

  const BalanceDisplay: FC<{ balance: number | null; isLoading: boolean; mint: string | null }> = ({ balance, isLoading, mint }) => {
    if (isLoading) {
      return <p className="text-xs mt-1 text-yellow-400">Loading balance...</p>;
    }
    
    if (balance === null) {
      return <p className="text-xs mt-1 text-red-400">Unable to load balance</p>;
    }
    
    if (balance === 0) {
      return (
        <div className="text-xs mt-1">
          <p className="text-red-400">USDC Balance: 0.00</p>
          <p className="text-gray-500">Need USDC? Get some from the faucets below</p>
        </div>
      );
    }
    
    return (
      <div className="text-xs mt-1">
        <p className="text-green-400">USDC Balance: {balance.toFixed(2)}</p>
        {mint && <p className="text-gray-500 text-[10px]">Mint: {mint.slice(0, 8)}...{mint.slice(-8)}</p>}
        {workingRpc && <p className="text-gray-500 text-[10px]">RPC: {workingRpc.includes('api.devnet') ? 'Official Devnet' : 'Ankr'}</p>}
      </div>
    );
  };

  const CheckoutModal: FC<{ product: Product | null; onClose: () => void }> = ({ product, onClose }) => {
    if (!product) return null;

    const isAffordable = usdcBalance !== null && usdcBalance >= product.price;
  
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
        <div className="bg-gray-800 p-8 rounded-lg border border-gray-700 w-full max-w-lg relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">&times;</button>
          
          <div className="flex flex-col md:flex-row gap-8">
            <div className="flex-1">
              <div className={`w-full h-48 ${product.image} rounded-lg flex items-center justify-center text-white text-xl font-bold mb-4`}>
              </div>
              <h2 className="text-3xl font-bold text-white">{product.name}</h2>
              <p className="text-xl font-bold text-cyan-400 mt-1">{product.price} USDC</p>
            </div>

            <div className="flex-1 flex flex-col justify-center">
              {!isLoggedIn ? (
                <div className="w-full">
                  <h3 className="text-xl font-semibold text-gray-300 mb-4">Login to Purchase</h3>
                  <button
                    onClick={handleLogin}
                    disabled={connectLoading}
                    className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-bold py-3 rounded-md hover:from-purple-600 hover:to-indigo-700 disabled:bg-gray-600 disabled:from-gray-600 transition-all"
                  >
                    {connectLoading ? 'Connecting...' : 'Login with Web3Auth'}
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-gray-300 mb-2">Welcome, <span className="font-semibold text-white">{displayEmail}</span>!</p>

                  <div className="text-gray-400 mb-4">
                    <p className="font-semibold text-gray-300">Your Solana Address:</p>
                    <div className="text-sm break-all bg-gray-900 p-2 rounded border border-gray-700 text-gray-400">
                      {displayAddress}
                    </div>
                    <BalanceDisplay 
                      balance={usdcBalance} 
                      isLoading={isBalanceLoading} 
                      mint={detectedUsdcMint}
                    />
                  </div>

                  <button
                    onClick={handlePayment}
                    disabled={isProcessing || isBalanceLoading || (!devMode && !isValidSolanaAddress(solanaAddress)) || !isAffordable}
                    className="w-full bg-gradient-to-r from-green-500 to-teal-500 text-white py-4 rounded-md text-lg font-bold hover:from-green-600 hover:to-teal-600 disabled:bg-gray-600 disabled:from-gray-600 transition-all mb-4"
                  >
                    {isProcessing ? 'Processing...' : `Pay ${product.price} USDC`}
                  </button>

                  {!isAffordable && !isBalanceLoading && usdcBalance !== null && (
                    <p className="text-red-400 text-xs -mt-2 mb-4">
                      Insufficient USDC balance to purchase this item.
                    </p>
                  )}

                  <button
                    onClick={handleLogout}
                    className="w-full bg-red-600 text-white py-2 rounded-md hover:bg-red-700 transition-colors"
                  >
                    Logout
                  </button>
                </div>
              )}

              {statusMessage && (
                <div className={`mt-4 text-center p-3 rounded-md border ${typeof statusMessage === 'string' && (statusMessage.includes('successful') || statusMessage.includes('Confirming'))
                    ? 'bg-green-900/50 text-green-300 border-green-700'
                    : typeof statusMessage === 'string' && (statusMessage.includes('failed') || statusMessage.includes('error'))
                      ? 'bg-red-900/50 text-red-300 border-red-700'
                      : 'bg-blue-900/50 text-blue-300 border-blue-700'
                  }`}>
                  {statusMessage}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="font-sans flex flex-col items-center min-h-screen p-8 bg-gray-900 text-gray-100">
      <header className="w-full max-w-5xl mx-auto text-center mb-12">
        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
          The Modern Merchant
        </h1>
        <p className="text-lg text-gray-400 mt-2">Select a product to begin the walletless checkout experience.</p>
      </header>

      <main className="w-full max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {products.map(product => (
            <ProductCard 
              key={product.id} 
              product={product} 
              onSelect={handleSelectProduct}
            />
          ))}
        </div>
      </main>
      
      {isModalOpen && (
        <CheckoutModal
          product={selectedProduct}
          onClose={handleCloseModal}
        />
      )}

      <footer className="w-full max-w-4xl mx-auto text-center mt-12 text-gray-400">
        <p>Powered by Solana Pay, Web3Auth, and blockchain technology.</p>
        <div className="mt-4">
          <Link href="/dashboard?auth=true" className="text-cyan-400 hover:underline">
            View Merchant Dashboard
          </Link>
        </div>
      </footer>
    </div>
  );
}