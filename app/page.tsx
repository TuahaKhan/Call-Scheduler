'use client';

import { useState, useCallback } from 'react';
import {
  Calendar,
  Video,
  Users,
  Mail,
  Clock,
  CheckCircle2,
  XCircle,
  Copy,
  ExternalLink,
  RefreshCw,
  ChevronRight,
  Sparkles,
  ArrowRight,
  Info,
  Loader2,
  Plus,
  X,
  FileText,
} from 'lucide-react';
import { format, addHours } from 'date-fns';

// ============================================================
// TYPES
// ============================================================
interface ScheduleResult {
  meetLink: string;
  eventId: string;
  subject: string;
  startTime: string;
  endTime: string;
  calendarLink: string;
}

interface SyncResult {
  processed: number;
  results: string[];
}

// ============================================================
// EMAIL INPUT COMPONENT
// ============================================================
function EmailTagInput({
  label,
  icon,
  placeholder,
  helperText,
  emails,
  onAdd,
  onRemove,
  accentColor = 'indigo',
}: {
  label: string;
  icon: React.ReactNode;
  placeholder: string;
  helperText?: string;
  emails: string[];
  onAdd: (email: string) => void;
  onRemove: (email: string) => void;
  accentColor?: 'indigo' | 'rose';
}) {
  const [inputVal, setInputVal] = useState('');
  const [error, setError] = useState('');

  const isValidEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleAdd = () => {
    // Handle multiple emails pasted/typed with comma or space
    const parts = inputVal.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
    let added = false;

    for (const part of parts) {
      if (!isValidEmail(part)) {
        setError(`"${part}" is not a valid email`);
        return;
      }
      if (emails.includes(part)) {
        setError(`"${part}" already added`);
        return;
      }
      onAdd(part);
      added = true;
    }

    if (added) {
      setInputVal('');
      setError('');
    }
  };

  const chipClass = accentColor === 'rose'
    ? 'email-chip email-chip-red'
    : 'email-chip';

  const ringClass = accentColor === 'rose'
    ? 'focus:ring-rose-500/30 focus:border-rose-400'
    : 'focus:ring-indigo-500/30 focus:border-indigo-400';

  return (
    <div className="space-y-2">
      {/* Label */}
      <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
        <span className={`text-${accentColor === 'rose' ? 'rose' : 'indigo'}-500`}>
          {icon}
        </span>
        {label}
      </label>

      {/* Tag Display Area */}
      {emails.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100 min-h-[52px] animate-fade-in-up">
          {emails.map(email => (
            <span key={email} className={`${chipClass} animate-slide-in`}>
              {email}
              <button
                type="button"
                onClick={() => onRemove(email)}
                className="hover:opacity-70 transition-opacity ml-0.5"
                aria-label={`Remove ${email}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input Row */}
      <div className="flex gap-2">
        <input
          type="email"
          value={inputVal}
          onChange={e => { setInputVal(e.target.value); setError(''); }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              handleAdd();
            }
            if (e.key === 'Backspace' && !inputVal && emails.length > 0) {
              onRemove(emails[emails.length - 1]);
            }
          }}
          placeholder={placeholder}
          className={`input-base flex-1 ${ringClass}`}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!inputVal.trim()}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold
            ${accentColor === 'rose'
              ? 'bg-rose-500 hover:bg-rose-600 text-white'
              : 'bg-indigo-500 hover:bg-indigo-600 text-white'}
            transition-all duration-150 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed
            active:scale-95`}
        >
          <Plus size={15} />
          Add
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-rose-500 flex items-center gap-1">
          <XCircle size={12} /> {error}
        </p>
      )}

      {/* Helper */}
      {helperText && (
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <Info size={11} className="shrink-0" />
          {helperText}
        </p>
      )}
    </div>
  );
}

// ============================================================
// QUICK TIME CHIPS
// ============================================================
function QuickTimeChip({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-xs font-medium bg-indigo-50 
        text-indigo-600 border border-indigo-200 hover:bg-indigo-100 
        transition-all duration-150 hover:shadow-sm active:scale-95"
    >
      {label}
    </button>
  );
}

// ============================================================
// RESULT CARD
// ============================================================
function ResultCard({ result }: { result: ScheduleResult }) {
  const [copied, setCopied] = useState(false);

  const copyLink = () => {
    navigator.clipboard.writeText(result.meetLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const formattedTime = format(new Date(result.startTime), "EEEE, MMMM d · h:mm a");
  const formattedEnd  = format(new Date(result.endTime),   "h:mm a");

  return (
    <div className="animate-fade-in-up mt-6 rounded-2xl overflow-hidden border border-green-200 shadow-lg shadow-green-500/10">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-6 py-4 flex items-center gap-3 border-b border-green-200">
        <div className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center shadow-md shadow-green-500/30">
          <CheckCircle2 size={18} className="text-white" />
        </div>
        <div>
          <p className="font-semibold text-green-800 text-sm">Meeting Scheduled!</p>
          <p className="text-xs text-green-600">Calendar invites sent to all attendees</p>
        </div>
      </div>

      {/* Body */}
      <div className="bg-white px-6 py-5 space-y-4">
        {/* Title & Time */}
        <div>
          <p className="font-bold text-gray-900 text-base">{result.subject}</p>
          <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
            <Clock size={13} />
            {formattedTime} – {formattedEnd}
          </p>
        </div>

        {/* Meet Link */}
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Google Meet Link</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm text-indigo-600 font-mono truncate">
              {result.meetLink}
            </code>
            <button
              type="button"
              onClick={copyLink}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                transition-all duration-200 border
                ${copied
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
            >
              {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-1">
          <a
            href={result.meetLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
              bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm
              transition-all duration-150 shadow-md shadow-indigo-500/20
              hover:shadow-lg hover:shadow-indigo-500/30 hover:-translate-y-0.5"
          >
            <Video size={15} />
            Join Meeting
            <ExternalLink size={13} className="opacity-70" />
          </a>
          <a
            href={result.calendarLink}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            <Calendar size={15} />
            Calendar
          </a>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SYNC PANEL
// ============================================================
function SyncPanel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState('');

  const handleSync = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/sync-mom', { method: 'POST' });
      const json = await res.json();

      if (!res.ok) throw new Error(json.error || 'Sync failed');
      setResult(json.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
          <FileText size={18} className="text-violet-600" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 text-sm">MOM Sync Center</h3>
          <p className="text-xs text-gray-400">Forward meeting notes to recipients</p>
        </div>
      </div>

      {/* Info Banner */}
      <div className="flex gap-3 p-4 bg-violet-50 rounded-xl border border-violet-100">
        <Sparkles size={16} className="text-violet-500 shrink-0 mt-0.5" />
        <p className="text-xs text-violet-700 leading-relaxed">
          After a meeting ends, Google Meet (paid account) sends AI-generated notes 
          to the host. This sync scans that inbox and forwards the MOM to all 
          designated recipients automatically.
        </p>
      </div>

      {/* Sync Button */}
      <button
        type="button"
        onClick={handleSync}
        disabled={loading}
        className="flex items-center justify-center gap-2.5 w-full py-3.5 px-5
          bg-white hover:bg-gray-50 text-gray-800 font-semibold text-sm
          rounded-xl border-2 border-gray-200 hover:border-indigo-300
          shadow-sm hover:shadow-md transition-all duration-200
          disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]"
      >
        {loading ? (
          <>
            <Loader2 size={16} className="spin-slow" />
            Scanning inbox...
          </>
        ) : (
          <>
            <RefreshCw size={16} />
            Run MOM Sync
          </>
        )}
      </button>

      {/* Error */}
      {error && (
        <div className="animate-fade-in-up flex items-start gap-2.5 p-4 rounded-xl bg-rose-50 border border-rose-200">
          <XCircle size={15} className="text-rose-500 shrink-0 mt-0.5" />
          <p className="text-sm text-rose-700">{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="animate-fade-in-up space-y-2">
          <div className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-semibold
            ${result.processed > 0
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-gray-50 border-gray-200 text-gray-600'
            }`}
          >
            {result.processed > 0 ? (
              <CheckCircle2 size={15} />
            ) : (
              <Info size={15} />
            )}
            {result.processed > 0
              ? `${result.processed} MOM email(s) forwarded`
              : 'No new MOM emails found'}
          </div>

          {result.results.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {result.results.map((r, i) => (
                <p key={i} className="text-xs text-gray-500 px-3 py-1.5 bg-gray-50 rounded-lg">
                  {r}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================
export default function Page() {
  // Form state
  const [title, setTitle]               = useState('');
  const [startTime, setStartTime]       = useState('');
  const [description, setDescription]   = useState('');
  const [participants, setParticipants] = useState<string[]>([]);
  const [momRecipients, setMomRecipients] = useState<string[]>([]);

  // UI state
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<ScheduleResult | null>(null);
  const [error, setError]       = useState('');

  // ── Quick Time Chips ──
  const setQuickTime = useCallback((daysOffset: number, hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    d.setHours(hour, 0, 0, 0);
    // Format for datetime-local input: YYYY-MM-DDTHH:mm
    const iso = format(d, "yyyy-MM-dd'T'HH:mm");
    setStartTime(iso);
  }, []);

  // ── Email Handlers ──
  const addParticipant    = (e: string) => setParticipants(prev => [...prev, e]);
  const removeParticipant = (e: string) => setParticipants(prev => prev.filter(x => x !== e));
  const addMomRecipient    = (e: string) => setMomRecipients(prev => [...prev, e]);
  const removeMomRecipient = (e: string) => setMomRecipients(prev => prev.filter(x => x !== e));

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);

    if (momRecipients.length === 0) {
      setError('Please add at least one MOM recipient (the host/scheduler).');
      return;
    }
    if (!startTime) {
      setError('Please select a date and time.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:         title || 'Scheduled Call',
          startTime:     new Date(startTime).toISOString(),
          participants,
          momRecipients,
          description,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Scheduling failed');

      setResult(json.data);
      // Reset form
      setTitle('');
      setStartTime('');
      setDescription('');
      setParticipants([]);
      setMomRecipients([]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Min datetime for input ──
  const minDateTime = format(new Date(), "yyyy-MM-dd'T'HH:mm");

  return (
    <div className="gradient-bg min-h-screen py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="text-center space-y-2 mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full 
            bg-indigo-50 border border-indigo-200 text-indigo-600 text-xs font-semibold mb-4">
            <span className="w-2 h-2 rounded-full bg-indigo-500 pulse-dot" />
            Powered by Google Meet (Paid Account)
          </div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            Call Scheduler
          </h1>
          <p className="text-gray-500 text-sm max-w-sm mx-auto">
            Schedule meetings via a single paid account. Participants join the call.
            MOM recipients automatically receive AI-generated notes after the meeting.
          </p>
        </div>

        {/* ── Flow Diagram (Visual Explainer) ── */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between gap-2 text-center">
            <div className="flex-1 space-y-1.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center mx-auto">
                <Users size={18} className="text-indigo-600" />
              </div>
              <p className="text-xs font-semibold text-gray-700">Participants</p>
              <p className="text-[11px] text-gray-400 leading-tight">Join the call<br/>No MOM</p>
            </div>
            <ChevronRight size={16} className="text-gray-300 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center mx-auto">
                <Video size={18} className="text-green-600" />
              </div>
              <p className="text-xs font-semibold text-gray-700">Google Meet</p>
              <p className="text-[11px] text-gray-400 leading-tight">AI transcription<br/>& notes</p>
            </div>
            <ChevronRight size={16} className="text-gray-300 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center mx-auto">
                <Mail size={18} className="text-rose-500" />
              </div>
              <p className="text-xs font-semibold text-gray-700">MOM Recipients</p>
              <p className="text-[11px] text-gray-400 leading-tight">Receive meeting<br/>notes via email</p>
            </div>
          </div>
        </div>

        {/* ── Schedule Form ── */}
        <div className="glass-card p-8">
          <div className="flex items-center gap-3 mb-7">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Calendar size={18} className="text-white" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">Schedule a Call</h2>
              <p className="text-xs text-gray-400">Meeting link will be generated instantly</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Meeting Title */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <span className="text-indigo-500"><Sparkles size={15} /></span>
                Meeting Title
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Product Sync · Q4 Review · Customer Call"
                className="input-base"
              />
            </div>

            {/* Date & Time */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <span className="text-indigo-500"><Clock size={15} /></span>
                Date & Time
                <span className="text-rose-500">*</span>
              </label>

              {/* Quick Chips */}
              <div className="flex flex-wrap gap-2">
                <QuickTimeChip label="Today 10 AM" onClick={() => setQuickTime(0, 10)} />
                <QuickTimeChip label="Today 2 PM"  onClick={() => setQuickTime(0, 14)} />
                <QuickTimeChip label="Today 5 PM"  onClick={() => setQuickTime(0, 17)} />
                <QuickTimeChip label="Tmrw 10 AM"  onClick={() => setQuickTime(1, 10)} />
                <QuickTimeChip label="Tmrw 2 PM"   onClick={() => setQuickTime(1, 14)} />
              </div>

              <input
                type="datetime-local"
                value={startTime}
                min={minDateTime}
                onChange={e => setStartTime(e.target.value)}
                required
                className="input-base [color-scheme:light]"
              />
              <p className="text-xs text-gray-400">Meeting duration: 1 hour (default)</p>
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-100" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-3 text-xs font-medium text-gray-400">People</span>
              </div>
            </div>

            {/* Participants (Call Only) */}
            <EmailTagInput
              label="Call Participants"
              icon={<Users size={15} />}
              placeholder="participant@company.com"
              helperText="These people join the meeting but do NOT receive MOM emails. Press Enter or comma to add."
              emails={participants}
              onAdd={addParticipant}
              onRemove={removeParticipant}
              accentColor="indigo"
            />

            {/* MOM Recipients */}
            <EmailTagInput
              label="MOM Recipients (Hosts)"
              icon={<Mail size={15} />}
              placeholder="host@company.com"
              helperText="These people receive the AI-generated Meeting Notes email after the call ends. Add yourself and any stakeholders."
              emails={momRecipients}
              onAdd={addMomRecipient}
              onRemove={removeMomRecipient}
              accentColor="rose"
            />

            {/* Optional Description */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <span className="text-indigo-500"><FileText size={15} /></span>
                Agenda / Notes
                <span className="text-xs font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Add agenda items, context, or pre-read links..."
                rows={3}
                className="input-base resize-none"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="animate-fade-in-up flex items-start gap-2.5 p-4 rounded-xl bg-rose-50 border border-rose-200">
                <XCircle size={15} className="text-rose-500 shrink-0 mt-0.5" />
                <p className="text-sm text-rose-700">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="spin-slow" />
                  Creating your meeting...
                </>
              ) : (
                <>
                  <Video size={18} />
                  Schedule Meeting
                  <ArrowRight size={16} className="ml-auto opacity-70" />
                </>
              )}
            </button>
          </form>

          {/* Result */}
          {result && <ResultCard result={result} />}
        </div>

        {/* ── MOM Sync Panel ── */}
        <SyncPanel />

        {/* ── Footer ── */}
        <p className="text-center text-xs text-gray-400 pb-4">
          Meetings are scheduled via a shared paid Google account · MOM is auto-forwarded after calls end
        </p>
      </div>
    </div>
  );
}