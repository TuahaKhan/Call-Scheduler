export interface ScheduleFormData {
  participants: string[];
  momRecipients: string[];
  title: string;
  startTime: string;
  description?: string;
}

export interface MeetingResult {
  meetLink: string;
  eventId: string;
  subject: string;
  startTime: string;
  endTime: string;
  calendarLink: string;
}

export interface SyncResult {
  status: 'success' | 'error' | 'nothing';
  message: string;
  synced?: number;
}