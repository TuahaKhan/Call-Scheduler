import { NextRequest, NextResponse } from 'next/server';
import { scanAndSyncMOM } from '@/lib/google';

export async function POST(req: NextRequest) {
  try {
    // Optional: validate a secret key for cron jobs
    const authHeader = req.headers.get('authorization');
    const cronKey = process.env.API_SECRET_KEY;
    
    if (cronKey && authHeader !== `Bearer ${cronKey}`) {
      // Allow from UI without key in development
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const result = await scanAndSyncMOM();

    return NextResponse.json({
      success: true,
      data: result,
    });

  } catch (err: any) {
    console.error('[Sync MOM Error]', err);
    return NextResponse.json(
      { error: err.message || 'Failed to sync MOM' },
      { status: 500 }
    );
  }
}