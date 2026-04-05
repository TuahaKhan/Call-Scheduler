import { google } from 'googleapis';

// ============================================
// SINGLE ACCOUNT GOOGLE CLIENT
// This uses ONE paid Google account's credentials
// to create all meetings and scan for MOM emails
// ============================================

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground' // redirect URI used to get refresh token
);

// Set credentials once (refresh token is permanent)
oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

// Export authenticated clients
export const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
export const gmail   = google.gmail({ version: 'v1', auth: oauth2Client });
export const auth    = oauth2Client;

// ============================================
// SCHEDULE MEETING
// Creates a Google Calendar event with Meet link
// momRecipients = people who should get MOM
// participants  = everyone on the call
// ============================================
export async function scheduleMeeting(data: {
  title: string;
  startTime: string;
  participants: string[];
  momRecipients: string[];
  description?: string;
}) {
  const startDate = new Date(data.startTime);
  const endDate   = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour default

  // Everyone gets the calendar invite
  const allAttendees = [
    ...data.participants.map(email => ({ email, responseStatus: 'needsAction' })),
    ...data.momRecipients.map(email => ({ email, responseStatus: 'needsAction' })),
  ];

  // Remove duplicates
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
    // Store momRecipients in extended properties for later MOM sync
    extendedProperties: {
      private: {
        momRecipients: data.momRecipients.join(','),
        participants:  data.participants.join(','),
        appManaged:    'true',
      },
    },
  };

  const response = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: event,
    conferenceDataVersion: 1,
    sendUpdates: 'all', // Sends calendar invites to everyone
  });

  const createdEvent = response.data;
  const meetLink = createdEvent.conferenceData?.entryPoints?.[0]?.uri || '';

  return {
    meetLink,
    eventId:      createdEvent.id || '',
    subject:      createdEvent.summary || '',
    startTime:    startDate.toISOString(),
    endTime:      endDate.toISOString(),
    calendarLink: createdEvent.htmlLink || '',
  };
}

// ============================================
// SCAN GMAIL FOR MOM EMAILS
// Google Meet (paid) sends "Meeting Notes" emails
// to the account that hosted the meeting
// We then FORWARD those to momRecipients
// ============================================
export async function scanAndSyncMOM(): Promise<{
  processed: number;
  results: string[];
}> {
  // Search for unread meeting notes from Google Meet
  const query = 'from:meet-recordings-noreply@google.com OR subject:"Meeting notes" is:unread newer_than:7d';
  
  const listResponse = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 20,
  });

  const messages = listResponse.data.messages || [];
  
  if (messages.length === 0) {
    return { processed: 0, results: ['No new MOM emails found.'] };
  }

  const results: string[] = [];
  let processed = 0;

  for (const msg of messages) {
    try {
      const fullMsg = await gmail.users.messages.get({
        userId: 'me',
        id:     msg.id!,
        format: 'full',
      });

      const headers = fullMsg.data.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const body    = extractEmailBody(fullMsg.data);

      // Find the related calendar event to get momRecipients
      // We look for a meeting title match in recent events
      const momRecipients = await findMomRecipientsForMeeting(subject, body);

      if (momRecipients.length > 0) {
        await forwardMOMEmail(subject, body, momRecipients);
        
        // Mark as read
        await gmail.users.messages.modify({
          userId:      'me',
          id:          msg.id!,
          requestBody: { removeLabelIds: ['UNREAD'] },
        });

        results.push(`✅ MOM forwarded for: ${subject}`);
        processed++;
      } else {
        results.push(`⚠️ No MOM recipients found for: ${subject}`);
      }
    } catch (err: any) {
      results.push(`❌ Error processing message: ${err.message}`);
    }
  }

  return { processed, results };
}

// ============================================
// HELPERS
// ============================================

function buildDescription(data: {
  description?: string;
  participants: string[];
  momRecipients: string[];
}): string {
  return `
${data.description ? data.description + '\n\n' : ''}
━━━━━━━━━━━━━━━━━━━━━━
📋 MEETING INFO
━━━━━━━━━━━━━━━━━━━━━━

👥 Participants (Call Only):
${data.participants.map(e => `  • ${e}`).join('\n')}

📧 MOM Recipients:
${data.momRecipients.map(e => `  • ${e}`).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━
Scheduled via Call Scheduler
  `.trim();
}

async function findMomRecipientsForMeeting(
  emailSubject: string,
  emailBody: string
): Promise<string[]> {
  // Strategy: Search recent calendar events (last 24 hours)
  // and find one where the meeting title matches the email subject
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const eventsResponse = await calendar.events.list({
    calendarId:   'primary',
    timeMin:      yesterday.toISOString(),
    timeMax:      now.toISOString(),
    singleEvents: true,
    orderBy:      'startTime',
    privateExtendedProperty: 'appManaged=true',
  });

  const events = eventsResponse.data.items || [];

  for (const event of events) {
    const privateProps = event.extendedProperties?.private || {};
    
    // Check if MOM recipients are stored
    if (privateProps.momRecipients) {
      // Simple matching: check if meeting title appears in email subject
      const eventTitle = (event.summary || '').toLowerCase();
      const subjectLower = emailSubject.toLowerCase();
      
      if (
        subjectLower.includes(eventTitle) ||
        subjectLower.includes('meeting notes') ||
        subjectLower.includes('notes from')
      ) {
        return privateProps.momRecipients.split(',').filter(Boolean);
      }
    }
  }

  return [];
}

function extractEmailBody(messageData: any): string {
  const parts = messageData.payload?.parts || [];
  
  // Try to get plain text first
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

  // Direct body
  if (messageData.payload?.body?.data) {
    return Buffer.from(messageData.payload.body.data, 'base64').toString('utf-8');
  }

  return '';
}

async function forwardMOMEmail(
  subject: string,
  body: string,
  recipients: string[]
): Promise<void> {
  const senderEmail = process.env.GOOGLE_GMAIL_USER!;
  
  // Build RFC 2822 email
  const emailLines = [
    `From: "Call Scheduler" <${senderEmail}>`,
    `To: ${recipients.join(', ')}`,
    `Subject: 📋 MOM: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    buildMOMEmailHtml(body, recipients),
  ];

  const rawEmail = emailLines.join('\r\n');
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

function buildMOMEmailHtml(body: string, recipients: string[]): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 680px; margin: 30px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 20px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 32px; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 22px; font-weight: 700; }
    .header p { color: rgba(255,255,255,0.6); margin: 8px 0 0; font-size: 14px; }
    .content { padding: 32px; }
    .mom-body { background: #f9fafb; border-radius: 8px; padding: 24px; font-size: 14px; line-height: 1.7; color: #374151; white-space: pre-wrap; }
    .recipients { margin-top: 24px; padding: 16px; background: #eff6ff; border-radius: 8px; }
    .recipients h3 { margin: 0 0 8px; font-size: 13px; color: #1d4ed8; text-transform: uppercase; letter-spacing: 0.5px; }
    .recipients p { margin: 0; font-size: 13px; color: #374151; }
    .footer { padding: 20px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📋 Meeting Notes</h1>
      <p>Auto-synced from Google Meet</p>
    </div>
    <div class="content">
      <div class="mom-body">${body}</div>
      <div class="recipients">
        <h3>📧 Sent to</h3>
        <p>${recipients.join(' · ')}</p>
      </div>
    </div>
    <div class="footer">
      Powered by Call Scheduler · Sent from the host's paid Google Meet account
    </div>
  </div>
</body>
</html>
  `.trim();
}