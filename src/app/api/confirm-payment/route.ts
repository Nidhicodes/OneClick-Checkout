import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { db } from '@/lib/db';

const MERCHANT_WALLET = new PublicKey(process.env.MERCHANT_WALLET || "86xCnPeV69n6t3DnyGkfpPEX4kuT3t6eJ5iAbPGYATcp");

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
  console.log(`[${timestamp}] [TRANSACTION-VERIFY] [${level.toUpperCase()}] ${message}${logData}`);
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
          'User-Agent': 'Transaction-Verify/1.0'
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

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  apiLog('info', 'Transaction verification request received');

  try {
    const { signature, product } = await req.json();
    
    if (!signature || !product) {
      apiLog('error', 'Missing signature or product', { signature: !!signature, product: !!product });
      return new NextResponse('Missing signature or product', { status: 400 });
    }

    apiLog('info', 'Processing transaction verification', { 
      signature: signature.substring(0, 12) + '...',
      product: product.name,
      price: product.price
    });

    // Get working connection
    const connection = await getWorkingConnection();
    if (!connection) {
      apiLog('error', 'No working RPC endpoints available');
      return new NextResponse('Failed to connect to Solana network', { status: 503 });
    }

    // Verify transaction with retries
    let tx;
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        apiLog('info', `Fetching transaction (attempt ${attempt + 1}/${maxRetries})`, { 
          signature: signature.substring(0, 12) + '...',
          rpcEndpoint: cachedEndpoint
        });
        
        tx = await connection.getParsedTransaction(signature, 'confirmed');
        
        if (tx) {
          apiLog('info', 'Transaction found successfully', {
            signature: signature.substring(0, 12) + '...',
            blockTime: tx.blockTime,
            slot: tx.slot,
            rpcEndpoint: cachedEndpoint
          });
          break;
        } else {
          apiLog('warn', `Transaction not found (attempt ${attempt + 1}/${maxRetries})`, {
            signature: signature.substring(0, 12) + '...'
          });
        }
      } catch (error) {
        apiLog('error', `Error fetching transaction (attempt ${attempt + 1}/${maxRetries})`, {
          error: (error as Error).message,
          signature: signature.substring(0, 12) + '...',
          rpcEndpoint: cachedEndpoint
        });
        
        // If this attempt failed, invalidate cached connection and try next endpoint
        if (attempt < maxRetries - 1) {
          cachedConnection = null;
          cachedEndpoint = null;
          const newConnection = await getWorkingConnection();
          if (!newConnection) {
            apiLog('error', 'No more RPC endpoints to try');
            break;
          }
        }
      }
      attempt++;
    }

    if (tx) {
      const accountKeys = tx.transaction.message.accountKeys.map(k => k.pubkey.toBase58());
      const merchantIncluded = accountKeys.includes(MERCHANT_WALLET.toBase58());
      
      apiLog('info', 'Transaction analysis', {
        accountCount: accountKeys.length,
        merchantIncluded,
        merchantWallet: MERCHANT_WALLET.toBase58(),
        signature: signature.substring(0, 12) + '...'
      });

      if (merchantIncluded) {
        // --- AI Image Generation ---
let imageUrl = null;
try {
  const { AIImageGenerator } = await import('@/lib/ai-image-generator');
  const imageGenerator = new AIImageGenerator(process.env.STABILITY_API_KEY!);
  
  const generatedImage = await imageGenerator.generateImage({
    productName: product.name,
    style: 'futuristic',
    mood: 'dark'
  });
  
  imageUrl = generatedImage.dataUrl;
  
  apiLog('info', 'AI image generation successful', {
    productName: product.name,
    imageSize: generatedImage.base64.length
  });

} catch (aiError) {
  apiLog('error', 'AI image generation failed', { 
    error: (aiError as Error).message,
    productName: product.name 
  });
  // Continue without an image if AI fails
}
        const newTransaction = {
          buyer: tx.transaction.message.accountKeys[0].pubkey.toBase58(),
          product: product.name,
          amount: product.price,
          signature,
          timestamp: tx.blockTime ? tx.blockTime * 1000 : Date.now(),
          imageUrl: imageUrl, // Add imageUrl to the transaction
        };
        
        db.transactions.push(newTransaction);
        db.totalSales += product.price;
        db.nftReceiptsIssued += 1;

        const processingTime = Date.now() - startTime;
        apiLog('info', 'Transaction verification completed successfully', {
          processingTimeMs: processingTime,
          totalSales: db.totalSales,
          nftReceiptsIssued: db.nftReceiptsIssued,
          rpcEndpoint: cachedEndpoint
        });

        return NextResponse.json({ 
          status: 'ok',
          details: {
            processingTimeMs: processingTime,
            rpcEndpoint: cachedEndpoint,
            imageGenerated: !!imageUrl
          }
        });
      } else {
        apiLog('warn', 'Transaction does not include merchant wallet', {
          signature: signature.substring(0, 12) + '...',
          merchantWallet: MERCHANT_WALLET.toBase58()
        });
      }
    } else {
      apiLog('error', 'Transaction not found after all retries', {
        signature: signature.substring(0, 12) + '...',
        attempts: maxRetries
      });
    }
    
    return new NextResponse('Transaction not valid', { status: 400 });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    apiLog('error', 'Unexpected error in transaction verification', {
      error: (error as Error).message,
      name: (error as Error).name,
      stack: (error as Error).stack?.split('\n').slice(0, 5),
      processingTimeMs: processingTime
    });
    
    return NextResponse.json({
      error: 'Internal Server Error',
      message: (error as Error)?.message || 'Unknown error occurred',
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV === 'development' && {
        details: {
          name: (error as Error)?.name,
          stack: (error as Error)?.stack?.split('\n').slice(0, 10)
        }
      })
    }, { status: 500 });
  }
}