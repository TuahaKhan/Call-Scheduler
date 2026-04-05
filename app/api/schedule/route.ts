import { NextRequest, NextResponse } from 'next/server';
import { scheduleMeeting } from '@/lib/google';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      title,
      startTime,
      participants,    // Array<string> - people on call, no MOM
      momRecipients,   // Array<string> - people who get MOM
      description,
    } = body;

    // Validation
    if (!startTime) {
      return NextResponse.json(
        { error: 'Start time is required' },
        { status: 400 }
      );
    }
    if (!momRecipients || momRecipients.length === 0) {
      return NextResponse.json(
        { error: 'At least one MOM recipient is required' },
        { status: 400 }
      );
    }

    // Clean email arrays
    const cleanParticipants = (participants || [])
      .map((e: string) => e.trim().toLowerCase())
      .filter((e: string) => e.includes('@'));

    const cleanMomRecipients = momRecipients
      .map((e: string) => e.trim().toLowerCase())
      .filter((e: string) => e.includes('@'));

    const result = await scheduleMeeting({
      title:         title || 'Scheduled Call',
      startTime,
      participants:  cleanParticipants,
      momRecipients: cleanMomRecipients,
      description,
    });

    return NextResponse.json({ success: true, data: result });

  } catch (err: any) {
    console.error('[Schedule API Error]', err);
    return NextResponse.json(
      { error: err.message || 'Failed to schedule meeting' },
      { status: 500 }
    );
  }
}