import { google } from 'googleapis';

// ============================================
// SINGLE ACCOUNT GOOGLE CLIENT
// ============================================

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

export const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
export const gmail    = google.gmail({ version: 'v1', auth: oauth2Client });
export const auth     = oauth2Client;

// ============================================
// SCHEDULE MEETING
// ============================================
export async function scheduleMeeting(data: {
  title: string;
  startTime: string;
  participants: string[];
  momRecipients: string[];
  description?: string;
}) {
  const startDate = new Date(data.startTime);
  const endDate   = new Date(startDate.getTime() + 60 * 60 * 1000);

  // Everyone gets the calendar invite
  const allAttendees = [
    ...data.participants.map(email => ({
      email,
      responseStatus: 'needsAction' as const,
    })),
    ...data.momRecipients.map(email => ({
      email,
      responseStatus: 'needsAction' as const,
    })),
  ];

  // Remove duplicates by email
  const uniqueAttendees = allAttendees.filter(
    (attendee, index, self) =>
      index === self.findIndex(a => a.email === attendee.email)
  );

  const event = {
    summary: data.title || 'Scheduled Call',
    description: buildDescription(data),
    start: {
      dateTime: startDate.toISOString(),
      timeZone: 'UTC',
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone: 'UTC',
    },
    attendees: uniqueAttendees,
    guestsCanModify: false,
    guestsCanInviteOthers: false,
    conferenceData: {
      createRequest: {
        requestId: `meet-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    // ✅ FIX: Store momRecipients as private extended properties
    // These are used later by sync-mom to find who to forward notes to
    extendedProperties: {
      private: {
        momRecipients: data.momRecipients.join(','),
        participants:  data.participants.join(','),
        appManaged:    'true',
      },
    },
  };

  const response = await calendar.events.insert({
    calendarId:            'primary',
    requestBody:           event,
    conferenceDataVersion: 1,
    sendUpdates:           'all',
  });

  const createdEvent = response.data;
  const meetLink =
    createdEvent.conferenceData?.entryPoints?.[0]?.uri || '';

  return {
    meetLink,
    eventId:      createdEvent.id      || '',
    subject:      createdEvent.summary || '',
    startTime:    startDate.toISOString(),
    endTime:      endDate.toISOString(),
    calendarLink: createdEvent.htmlLink || '',
  };
}

// ============================================
// SCAN GMAIL FOR MOM EMAILS AND FORWARD THEM
// ============================================
export async function scanAndSyncMOM(): Promise<{
  processed: number;
  results: string[];
}> {
  const query =
    'from:meet-recordings-noreply@google.com OR subject:"Meeting notes" is:unread newer_than:7d';

  const listResponse = await gmail.users.messages.list({
    userId:     'me',
    q:          query,
    maxResults: 20,
  });

  const messages = listResponse.data.messages || [];

  if (messages.length === 0) {
    return { processed: 0, results: ['No new MOM emails found.'] };
  }

  const results: string[] = [];
  let processed = 0;

  for (const msg of messages) {
    if (!msg.id) continue;

    try {
      const fullMsg = await gmail.users.messages.get({
        userId: 'me',
        id:     msg.id,
        format: 'full',
      });

      const headers = fullMsg.data.payload?.headers || [];
      const subject =
        headers.find(h => h.name === 'Subject')?.value || '';
      const body = extractEmailBody(fullMsg.data);

      // Find momRecipients from matching calendar event
      const momRecipients = await findMomRecipientsForMeeting(subject);

      if (momRecipients.length > 0) {
        await forwardMOMEmail(subject, body, momRecipients);

        // Mark original email as read
        await gmail.users.messages.modify({
          userId:      'me',
          id:          msg.id,
          requestBody: { removeLabelIds: ['UNREAD'] },
        });

        results.push(`✅ MOM forwarded for: ${subject}`);
        processed++;
      } else {
        results.push(`⚠️ No MOM recipients found for: ${subject}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      results.push(`❌ Error processing message: ${message}`);
    }
  }

  return { processed, results };
}

// ============================================
// FIND MOM RECIPIENTS FROM CALENDAR EVENT
// ============================================
async function findMomRecipientsForMeeting(
  emailSubject: string
): Promise<string[]> {
  const now       = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // ✅ FIX: privateExtendedProperty must be string[] not string
  const eventsResponse = await calendar.events.list({
    calendarId:              'primary',
    timeMin:                 yesterday.toISOString(),
    timeMax:                 now.toISOString(),
    singleEvents:            true,
    orderBy:                 'startTime',
    privateExtendedProperty: ['appManaged=true'], // ✅ Array, not string
  });

  const events = eventsResponse.data.items || [];

  for (const event of events) {
    const privateProps = event.extendedProperties?.private || {};

    if (privateProps.momRecipients) {
      const eventTitle  = (event.summary || '').toLowerCase();
      const subjectLower = emailSubject.toLowerCase();

      const isMatch =
        subjectLower.includes(eventTitle) ||
        subjectLower.includes('meeting notes') ||
        subjectLower.includes('notes from');

      if (isMatch) {
        return privateProps.momRecipients
          .split(',')
          .map((e: string) => e.trim())
          .filter(Boolean);
      }
    }
  }

  return [];
}

// ============================================
// EXTRACT PLAIN TEXT FROM EMAIL
// ============================================
function extractEmailBody(messageData: {
  payload?: {
    parts?: Array<{
      mimeType?: string | null;
      body?: { data?: string | null } | null;
    }> | null;
    body?: { data?: string | null } | null;
  } | null;
}): string {
  const parts = messageData.payload?.parts || [];

  // Try plain text first
  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return Buffer.from(part.body.data, 'base64').toString('utf-8');
    }
  }

  // Fallback to HTML
  for (const part of parts) {
    if (part.mimeType === 'text/html' && part.body?.data) {
      return Buffer.from(part.body.data, 'base64').toString('utf-8');
    }
  }

  // Direct body fallback
  if (messageData.payload?.body?.data) {
    return Buffer
      .from(messageData.payload.body.data, 'base64')
      .toString('utf-8');
  }

  return '';
}

// ============================================
// FORWARD MOM EMAIL TO RECIPIENTS
// ============================================
async function forwardMOMEmail(
  subject:    string,
  body:       string,
  recipients: string[]
): Promise<void> {
  const senderEmail = process.env.GOOGLE_GMAIL_USER!;

  const emailLines = [
    `From: "Call Scheduler" <${senderEmail}>`,
    `To: ${recipients.join(', ')}`,
    `Subject: MOM: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    buildMOMEmailHtml(body, recipients),
  ];

  const rawEmail    = emailLines.join('\r\n');
  const encodedEmail = Buffer.from(rawEmail)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId:      'me',
    requestBody: { raw: encodedEmail },
  });
}

// ============================================
// BUILD DESCRIPTION FOR CALENDAR EVENT
// ============================================
function buildDescription(data: {
  description?: string;
  participants:  string[];
  momRecipients: string[];
}): string {
  return `
${data.description ? data.description + '\n\n' : ''}
━━━━━━━━━━━━━━━━━━━━━━
MEETING INFO
━━━━━━━━━━━━━━━━━━━━━━

Participants (Call Only):
${data.participants.map(e => `  - ${e}`).join('\n') || '  None added'}

MOM Recipients:
${data.momRecipients.map(e => `  - ${e}`).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━
Scheduled via Call Scheduler
  `.trim();
}

// ============================================
// BUILD HTML FOR FORWARDED MOM EMAIL
// ============================================
function buildMOMEmailHtml(body: string, recipients: string[]): string {
  // Escape HTML special characters in body
  const safeBody = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      margin: 0; padding: 0; background: #f5f5f5;
    }
    .container {
      max-width: 680px; margin: 30px auto; background: white;
      border-radius: 12px; overflow: hidden;
      box-shadow: 0 2px 20px rgba(0,0,0,0.08);
    }
    .header {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      padding: 32px; text-align: center;
    }
    .header h1 { color: white; margin: 0; font-size: 22px; font-weight: 700; }
    .header p  { color: rgba(255,255,255,0.6); margin: 8px 0 0; font-size: 14px; }
    .content   { padding: 32px; }
    .mom-body  {
      background: #f9fafb; border-radius: 8px; padding: 24px;
      font-size: 14px; line-height: 1.7; color: #374151;
      white-space: pre-wrap;
    }
    .recipients {
      margin-top: 24px; padding: 16px;
      background: #eff6ff; border-radius: 8px;
    }
    .recipients h3 {
      margin: 0 0 8px; font-size: 13px; color: #1d4ed8;
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .recipients p { margin: 0; font-size: 13px; color: #374151; }
    .footer {
      padding: 20px 32px; background: #f9fafb;
      border-top: 1px solid #e5e7eb;
      text-align: center; font-size: 12px; color: #9ca3af;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Meeting Notes</h1>
      <p>Auto-synced from Google Meet</p>
    </div>
    <div class="content">
      <div class="mom-body">${safeBody}</div>
      <div class="recipients">
        <h3>Sent To</h3>
        <p>${recipients.join(' &middot; ')}</p>
      </div>
    </div>
    <div class="footer">
      Powered by Call Scheduler
    </div>
  </div>
</body>
</html>
  `.trim();
}