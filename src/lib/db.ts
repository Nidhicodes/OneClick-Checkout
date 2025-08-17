export interface Transaction {
  buyer: string;
  product: string;
  amount: number;
  signature: string;
  timestamp: number;
  imageUrl: string | null;
}

export const db = {
  transactions: [] as Transaction[],
  totalSales: 0,
  nftReceiptsIssued: 0,
};
