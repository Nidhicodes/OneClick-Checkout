import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const data = {
      transactions: db.transactions,
      totalSales: db.totalSales,
      nftReceiptsIssued: db.nftReceiptsIssued,
    };
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
