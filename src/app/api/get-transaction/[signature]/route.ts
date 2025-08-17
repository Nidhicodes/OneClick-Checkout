import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { db } from '@/lib/db';

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
  console.log(`[${timestamp}] [GET-TRANSACTION] [${level.toUpperCase()}] ${message}${logData}`);
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
          'User-Agent': 'Get-Transaction/1.0'
        }
      });
      
      // Test the connection
      const slot = await connection.getSlot();
      apiLog('info', `RPC endpoint working: ${endpoint}`, { slot });
      
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

export async function GET(
  req: NextRequest,
  { params }: { params: { signature: string } }
) {
  const startTime = Date.now();
  apiLog('info', 'Get transaction request received');

  try {
    const signature = params?.signature;
    
    if (!signature) {
      apiLog('error', 'Missing signature parameter');
      return NextResponse.json(
        { 
          error: 'Missing signature parameter',
          details: 'Signature is required to fetch transaction details'
        }, 
        { status: 400 }
      );
    }

    if (typeof signature !== 'string' || signature.trim().length === 0) {
      apiLog('error', 'Invalid signature parameter', { signature: typeof signature, length: signature?.length });
      return NextResponse.json(
        { 
          error: 'Invalid signature parameter',
          details: 'Signature must be a non-empty string'
        }, 
        { status: 400 }
      );
    }

    const trimmedSignature = signature.trim();
    apiLog('info', 'Looking for transaction', { 
      signature: trimmedSignature.substring(0, 12) + '...',
      totalTransactions: db.transactions.length
    });

    // First, check local database
    const localTransaction = db.transactions.find(tx => tx.signature === trimmedSignature);
    
    if (localTransaction) {
      const processingTime = Date.now() - startTime;
      apiLog('info', 'Transaction found in local database', {
        signature: trimmedSignature.substring(0, 12) + '...',
        product: localTransaction.product,
        amount: localTransaction.amount,
        processingTimeMs: processingTime
      });
      
      return NextResponse.json({
        ...localTransaction,
        source: 'local_database',
        processingTimeMs: processingTime
      });
    }

    // If not found locally, try to fetch from Solana network
    apiLog('info', 'Transaction not found locally, checking Solana network', {
      signature: trimmedSignature.substring(0, 12) + '...'
    });

    const connection = await getWorkingConnection();
    if (!connection) {
      apiLog('error', 'No working RPC endpoints available');
      return NextResponse.json(
        { 
          error: 'Failed to connect to Solana network',
          details: 'All RPC endpoints are currently unavailable',
          signature: trimmedSignature.substring(0, 12) + '...'
        }, 
        { status: 503 }
      );
    }

    // Try to fetch transaction from Solana network
    let solanaTransaction = null;
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries && !solanaTransaction) {
      try {
        apiLog('info', `Fetching transaction from Solana network (attempt ${attempt + 1}/${maxRetries})`, {
          signature: trimmedSignature.substring(0, 12) + '...',
          rpcEndpoint: cachedEndpoint
        });
        
        solanaTransaction = await connection.getParsedTransaction(trimmedSignature, 'confirmed');
        
        if (solanaTransaction) {
          apiLog('info', 'Transaction found on Solana network', {
            signature: trimmedSignature.substring(0, 12) + '...',
            blockTime: solanaTransaction.blockTime,
            slot: solanaTransaction.slot
          });
          break;
        }
      } catch (error) {
        apiLog('error', `Error fetching transaction from Solana (attempt ${attempt + 1}/${maxRetries})`, {
          error: (error as Error).message,
          signature: trimmedSignature.substring(0, 12) + '...'
        });
        
        // Try next endpoint if this one failed
        if (attempt < maxRetries - 1) {
          cachedConnection = null;
          cachedEndpoint = null;
          const newConnection = await getWorkingConnection();
          if (!newConnection) break;
        }
      }
      attempt++;
    }

    if (solanaTransaction) {
      // Create a simplified transaction object from Solana data
      const simplifiedTransaction = {
        signature: trimmedSignature,
        buyer: solanaTransaction.transaction.message.accountKeys[0]?.pubkey.toBase58() || 'Unknown',
        amount: 0, // We don't have the exact amount without parsing instructions
        timestamp: solanaTransaction.blockTime ? solanaTransaction.blockTime * 1000 : Date.now(),
        blockHeight: solanaTransaction.slot,
        source: 'solana_network',
        status: solanaTransaction.meta?.err ? 'failed' : 'confirmed',
        processingTimeMs: Date.now() - startTime,
        rpcEndpoint: cachedEndpoint
      };

      apiLog('info', 'Returning transaction data from Solana network', {
        signature: trimmedSignature.substring(0, 12) + '...',
        processingTimeMs: simplifiedTransaction.processingTimeMs
      });

      return NextResponse.json(simplifiedTransaction);
    }

    // Transaction not found anywhere
    const processingTime = Date.now() - startTime;
    apiLog('warn', 'Transaction not found in local database or Solana network', {
      signature: trimmedSignature.substring(0, 12) + '...',
      processingTimeMs: processingTime,
      localTransactionCount: db.transactions.length
    });

    return NextResponse.json(
      { 
        error: 'Transaction not found',
        details: 'Transaction was not found in local database or on Solana network',
        signature: trimmedSignature.substring(0, 12) + '...',
        searchedLocations: ['local_database', 'solana_network'],
        processingTimeMs: processingTime,
        rpcEndpoint: cachedEndpoint
      }, 
      { status: 404 }
    );

  } catch (error) {
    const processingTime = Date.now() - startTime;
    apiLog('error', 'Unexpected error in get transaction API', {
      error: (error as Error).message,
      name: (error as Error).name,
      stack: (error as Error).stack?.split('\n').slice(0, 5),
      processingTimeMs: processingTime
    });
    
    return NextResponse.json({
      error: 'Internal Server Error',
      message: (error as Error)?.message || 'Unknown error occurred',
      timestamp: new Date().toISOString(),
      processingTimeMs: processingTime,
      ...(process.env.NODE_ENV === 'development' && {
        details: {
          name: (error as Error)?.name,
          stack: (error as Error)?.stack?.split('\n').slice(0, 10)
        }
      })
    }, { status: 500 });
  }
}