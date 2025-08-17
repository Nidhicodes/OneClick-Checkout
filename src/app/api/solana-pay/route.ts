import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, Transaction, clusterApiUrl } from '@solana/web3.js';
import { 
  createTransferInstruction, 
  getAssociatedTokenAddress, 
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import BigNumber from 'bignumber.js';

// Environment variables with fallbacks
const MERCHANT_WALLET = new PublicKey(
  process.env.MERCHANT_WALLET || "86xCnPeV69n6t3DnyGkfpPEX4kuT3t6eJ5iAbPGYATcp"
);

// Updated USDC mint addresses - prioritize Circle's devnet USDC
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

// Global connection cache
let cachedConnection: Connection | null = null;
let cachedEndpoint: string | null = null;

function apiLog(level: 'info' | 'warn' | 'error', message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logData = data ? ` | Data: ${JSON.stringify(data)}` : '';
  console.log(`[${timestamp}] [SOLANA-PAY-API] [${level.toUpperCase()}] ${message}${logData}`);
}

// Get a working RPC connection
async function getWorkingConnection(): Promise<Connection | null> {
  if (cachedConnection && cachedEndpoint) {
    try {
      // Test if cached connection still works
      await cachedConnection.getSlot();
      apiLog('info', `Using cached connection: ${cachedEndpoint}`);
      return cachedConnection;
    } catch (error) {
      apiLog('warn', `Cached connection failed, trying new endpoints: ${cachedEndpoint}`);
      cachedConnection = null;
      cachedEndpoint = null;
    }
  }

  for (const endpoint of RPC_ENDPOINTS) {
    try {
      apiLog('info', `Testing RPC endpoint: ${endpoint}`);
      const connection = new Connection(endpoint, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000,
        disableRetryOnRateLimit: false,
        httpHeaders: {
          'User-Agent': 'Frictionless-Checkout/1.0'
        }
      });
      
      // Test the connection with multiple calls
      const [slot, version] = await Promise.all([
        connection.getSlot(),
        connection.getVersion()
      ]);
      
      apiLog('info', `RPC endpoint working: ${endpoint}`, { slot, version: version['solana-core'] });
      
      // Cache the working connection
      cachedConnection = connection;
      cachedEndpoint = endpoint;
      
      return connection;
    } catch (error) {
      apiLog('warn', `RPC endpoint failed: ${endpoint}`, { error: (error as Error).message });
      continue;
    }
  }
  
  apiLog('error', 'No working RPC endpoints found');
  return null;
}

// Helper function to safely check if token account exists
async function tokenAccountExists(connection: Connection, address: PublicKey): Promise<boolean> {
  try {
    await getAccount(connection, address, 'confirmed', TOKEN_PROGRAM_ID);
    return true;
  } catch (error: any) {
    if (error?.name === 'TokenAccountNotFoundError' || 
        error?.name === 'TokenInvalidAccountOwnerError' ||
        error?.message?.includes('could not find account')) {
      return false;
    }
    // Re-throw other errors
    throw error;
  }
}

// Validate Solana address
function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

// Determine the correct USDC mint to use
function getUsdcMint(providedMint?: string): PublicKey {
  if (providedMint && isValidSolanaAddress(providedMint)) {
    apiLog('info', `Using provided USDC mint: ${providedMint}`);
    return new PublicKey(providedMint);
  }
  
  // Default to Circle's devnet USDC
  const defaultMint = POTENTIAL_USDC_MINTS[0];
  apiLog('info', `Using default USDC mint: ${defaultMint}`);
  return new PublicKey(defaultMint);
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  apiLog('info', 'Solana Pay API request received');

  try {
    // Parse and validate request body
    let body;
    try {
      const rawBody = await req.text();
      apiLog('info', 'Raw request body received', { length: rawBody.length, preview: rawBody.substring(0, 200) });
      
      if (!rawBody.trim()) {
        apiLog('error', 'Empty request body');
        return NextResponse.json(
          { 
            error: 'Empty request body',
            details: 'Request body must contain JSON with account parameter'
          }, 
          { status: 400 }
        );
      }

      body = JSON.parse(rawBody);
      apiLog('info', 'Request body parsed successfully', body);
    } catch (error) {
      apiLog('error', 'Invalid JSON in request body', { error: (error as Error).message });
      return NextResponse.json(
        { 
          error: 'Invalid JSON in request body',
          details: 'Please ensure request body contains valid JSON'
        }, 
        { status: 400 }
      );
    }

    // Validate required parameters
    const { account, product, usdcMint } = body;
    if (!account || !product) {
      apiLog('error', 'Missing account or product parameter', { receivedBody: body });
      return NextResponse.json(
        { 
          error: 'Missing account or product parameter',
          details: 'Request must include "account" and "product" fields.',
          receivedFields: Object.keys(body)
        }, 
        { status: 400 }
      );
    }

    if (typeof product.price !== 'number' || product.price <= 0) {
      apiLog('error', 'Invalid product price', { product });
      return NextResponse.json(
        { 
          error: 'Invalid product price',
          details: 'Product must have a valid price greater than 0.'
        }, 
        { status: 400 }
      );
    }

    // Validate account format
    if (typeof account !== 'string') {
      apiLog('error', 'Invalid account parameter type', { type: typeof account, value: account });
      return NextResponse.json(
        { 
          error: 'Invalid account parameter type',
          details: 'Account must be a string representing a Solana wallet address'
        }, 
        { status: 400 }
      );
    }

    const trimmedAccount = account.trim();
    if (!trimmedAccount) {
      apiLog('error', 'Empty account parameter after trimming');
      return NextResponse.json(
        { 
          error: 'Empty account parameter',
          details: 'Account parameter cannot be empty or whitespace only'
        }, 
        { status: 400 }
      );
    }

    // Validate Solana address format
    if (!isValidSolanaAddress(trimmedAccount)) {
      apiLog('error', 'Invalid Solana address format', { address: trimmedAccount });
      return NextResponse.json(
        { 
          error: 'Invalid Solana address format',
          details: 'Account must be a valid base58-encoded Solana public key',
          providedAddress: trimmedAccount
        }, 
        { status: 400 }
      );
    }

    const userPublicKey = new PublicKey(trimmedAccount);
    const USDC_MINT = getUsdcMint(usdcMint);
    
    apiLog('info', 'Processing payment for valid account', { 
      address: userPublicKey.toBase58(),
      usdcMint: USDC_MINT.toBase58(),
      providedMint: usdcMint
    });

    // Get working connection
    const connection = await getWorkingConnection();
    if (!connection) {
      apiLog('error', 'No working RPC endpoints available');
      return NextResponse.json(
        { 
          error: 'Failed to connect to Solana network',
          details: 'All RPC endpoints are currently unavailable',
          network: 'devnet',
          triedEndpoints: RPC_ENDPOINTS
        }, 
        { status: 503 }
      );
    }

    // Get associated token addresses
    const userUsdcAddress = await getAssociatedTokenAddress(
      USDC_MINT,
      userPublicKey,
      true, // allowOwnerOffCurve
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const merchantUsdcAddress = await getAssociatedTokenAddress(
      USDC_MINT,
      MERCHANT_WALLET,
      true, // allowOwnerOffCurve
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    apiLog('info', 'Token addresses calculated', {
      userUsdcAddress: userUsdcAddress.toBase58(),
      merchantUsdcAddress: merchantUsdcAddress.toBase58(),
      usdcMint: USDC_MINT.toBase58(),
      merchantWallet: MERCHANT_WALLET.toBase58(),
      rpcEndpoint: cachedEndpoint
    });

    // Check if token accounts exist
    let userAccountExists = false;
    let merchantAccountExists = false;

    try {
      userAccountExists = await tokenAccountExists(connection, userUsdcAddress);
      apiLog('info', `User USDC account ${userAccountExists ? 'exists' : 'does not exist'}`, {
        address: userUsdcAddress.toBase58()
      });
    } catch (error) {
      apiLog('error', 'Error checking user token account', { 
        error: (error as Error).message,
        address: userUsdcAddress.toBase58()
      });
      return NextResponse.json(
        { 
          error: 'Error checking user token account',
          details: 'Failed to verify user USDC account status',
          userUsdcAddress: userUsdcAddress.toBase58()
        }, 
        { status: 500 }
      );
    }

    try {
      merchantAccountExists = await tokenAccountExists(connection, merchantUsdcAddress);
      apiLog('info', `Merchant USDC account ${merchantAccountExists ? 'exists' : 'does not exist'}`, {
        address: merchantUsdcAddress.toBase58()
      });
    } catch (error) {
      apiLog('error', 'Error checking merchant token account', { 
        error: (error as Error).message,
        address: merchantUsdcAddress.toBase58()
      });
      return NextResponse.json(
        { 
          error: 'Error checking merchant token account',
          details: 'Failed to verify merchant USDC account status',
          merchantUsdcAddress: merchantUsdcAddress.toBase58()
        }, 
        { status: 500 }
      );
    }

    // Create transaction
    const transaction = new Transaction();
    let instructionCount = 0;

    // Add instruction to create user's token account if it doesn't exist
    if (!userAccountExists) {
      apiLog('info', 'Adding create user token account instruction');
      transaction.add(
        createAssociatedTokenAccountInstruction(
          userPublicKey, // payer
          userUsdcAddress, // associatedToken
          userPublicKey, // owner
          USDC_MINT, // mint
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
      instructionCount++;
    }

    // Add instruction to create merchant's token account if it doesn't exist
    if (!merchantAccountExists) {
      apiLog('info', 'Adding create merchant token account instruction');
      transaction.add(
        createAssociatedTokenAccountInstruction(
          userPublicKey, // payer (user pays for merchant's account creation)
          merchantUsdcAddress, // associatedToken
          MERCHANT_WALLET, // owner
          USDC_MINT, // mint
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
      instructionCount++;
    }

    // Calculate transfer amount
    const amount = new BigNumber(product.price);
    const decimals = 6; // USDC has 6 decimal places
    const transferAmount = amount.shiftedBy(decimals).toNumber();

    apiLog('info', 'Transfer amount calculated', { 
      humanReadable: `${product.price} USDC`,
      rawAmount: transferAmount,
      decimals: decimals
    });

    // Add transfer instruction
    transaction.add(
      createTransferInstruction(
        userUsdcAddress, // source
        merchantUsdcAddress, // destination
        userPublicKey, // owner of source account
        transferAmount, // amount
        [], // multiSigners (empty for single signer)
        TOKEN_PROGRAM_ID
      )
    );
    instructionCount++;

    // Set transaction properties
    let blockhash: string;
    let lastValidBlockHeight: number;
    
    try {
      const latestBlockhash = await connection.getLatestBlockhash('confirmed');
      blockhash = latestBlockhash.blockhash;
      lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
      
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = userPublicKey;
      
      apiLog('info', 'Transaction configured', {
        blockhash: blockhash.substring(0, 12) + '...',
        lastValidBlockHeight,
        feePayer: userPublicKey.toBase58(),
        instructionCount,
        rpcEndpoint: cachedEndpoint
      });
    } catch (error) {
      apiLog('error', 'Failed to get latest blockhash', { error: (error as Error).message });
      return NextResponse.json(
        { 
          error: 'Failed to get latest blockhash',
          details: 'Could not retrieve current blockchain state'
        }, 
        { status: 503 }
      );
    }

    // Serialize transaction
    let serializedTransaction: Buffer;
    try {
      serializedTransaction = transaction.serialize({ 
        requireAllSignatures: false,
        verifySignatures: false 
      });
      
      apiLog('info', 'Transaction serialized successfully', { 
        size: serializedTransaction.length,
        instructionCount,
        accounts: transaction.instructions.reduce((acc, ix) => acc + ix.keys.length, 0)
      });
    } catch (error) {
      apiLog('error', 'Failed to serialize transaction', { 
        error: (error as Error).message,
        instructionCount,
        hasBlockhash: !!transaction.recentBlockhash,
        hasFeePayer: !!transaction.feePayer
      });
      return NextResponse.json(
        { 
          error: 'Failed to serialize transaction',
          details: 'Could not prepare transaction for signing'
        }, 
        { status: 500 }
      );
    }

    const processingTime = Date.now() - startTime;
    const response = {
      transaction: serializedTransaction.toString('base64'),
      message: 'Transaction created successfully',
      details: {
        userAccount: userUsdcAddress.toBase58(),
        merchantAccount: merchantUsdcAddress.toBase58(),
        amount: transferAmount,
        humanReadableAmount: `${product.price} USDC`,
        userAccountExists,
        merchantAccountExists,
        blockhash: blockhash.substring(0, 12) + '...',
        lastValidBlockHeight,
        instructionCount,
        processingTimeMs: processingTime,
        usdcMint: USDC_MINT.toBase58(),
        rpcEndpoint: cachedEndpoint
      }
    };

    apiLog('info', 'Transaction response prepared successfully', {
      transactionSize: serializedTransaction.length,
      processingTimeMs: processingTime,
      rpcEndpoint: cachedEndpoint
    });

    return NextResponse.json(response);

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    apiLog('error', 'Unexpected error in Solana Pay API', {
      error: error?.message,
      name: error?.name,
      stack: error?.stack?.split('\n').slice(0, 5),
      processingTimeMs: processingTime
    });
    
    return NextResponse.json({
      error: 'Internal Server Error',
      message: error?.message || 'Unknown error occurred',
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV === 'development' && {
        details: {
          name: error?.name,
          stack: error?.stack?.split('\n').slice(0, 10)
        }
      })
    }, { status: 500 });
  }
}

// Health check endpoint
export async function GET() {
  apiLog('info', 'Health check requested');
  
  try {
    // Get a working connection for health check
    const connection = await getWorkingConnection();
    if (!connection) {
      throw new Error('No working RPC endpoints available');
    }
    
    const slot = await connection.getSlot();
    
    return NextResponse.json({
      status: 'OK',
      service: 'Solana Pay API',
      timestamp: new Date().toISOString(),
      network: 'devnet',
      currentSlot: slot,
      merchantWallet: MERCHANT_WALLET.toBase58(),
      availableUsdcMints: POTENTIAL_USDC_MINTS,
      rpcEndpoint: cachedEndpoint,
      version: '2.1.0'
    });
  } catch (error) {
    apiLog('error', 'Health check failed', { error: (error as Error).message });
    
    return NextResponse.json({
      status: 'ERROR',
      service: 'Solana Pay API',
      timestamp: new Date().toISOString(),
      error: 'Cannot connect to Solana network',
      details: (error as Error).message,
      triedEndpoints: RPC_ENDPOINTS
    }, { status: 503 });
  }
}