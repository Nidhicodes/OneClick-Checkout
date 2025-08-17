'use client';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Transaction {
  buyer: string;
  product: string;
  amount: number;
  signature: string;
  timestamp: number;
}

export default function Dashboard() {
  const searchParams = useSearchParams();
  const auth = searchParams.get('auth');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalSales, setTotalSales] = useState(0);
  const [nftReceiptsIssued, setNftReceiptsIssued] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/dashboard');
        if (!response.ok) {
          throw new Error('Failed to fetch dashboard data');
        }
        const data = await response.json();
        setTransactions(data.transactions);
        setTotalSales(data.totalSales);
        setNftReceiptsIssued(data.nftReceiptsIssued);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      }
    };

    fetchData(); // Fetch data on initial load
    const interval = setInterval(fetchData, 2000); // Poll every 2 seconds

    return () => clearInterval(interval); // Cleanup on component unmount
  }, []);

  if (auth !== 'true') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <h1 className="text-2xl font-bold">Access Denied</h1>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">Merchant Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold text-gray-600">Total Sales</h2>
          <p className="text-4xl font-bold">${totalSales.toFixed(2)}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold text-gray-600">Total Transactions</h2>
          <p className="text-4xl font-bold">{transactions.length}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold text-gray-600">NFT Receipts Issued</h2>
          <p className="text-4xl font-bold">{nftReceiptsIssued}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Recent Transactions</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Timestamp</th>
                <th className="text-left p-2">Buyer</th>
                <th className="text-left p-2">Product</th>
                <th className="text-left p-2">Amount</th>
                <th className="text-left p-2">Signature</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx, index) => (
                <tr key={index} className="border-b">
                  <td className="p-2">{new Date(tx.timestamp).toLocaleString()}</td>
                  <td className="p-2 truncate max-w-xs">{tx.buyer}</td>
                  <td className="p-2">{tx.product}</td>
                  <td className="p-2">${tx.amount.toFixed(2)}</td>
                  <td className="p-2 truncate max-w-xs">{tx.signature}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
