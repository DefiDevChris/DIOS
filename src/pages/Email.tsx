import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Mail, Search, MessageSquare, Plus, X, Loader2, Send } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';

interface EmailThread {
  id: string;
  snippet: string;
  historyId: string;
  messages: EmailMessage[];
}

interface EmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload: {
    headers: { name: string; value: string }[];
    body: { data?: string };
    parts?: any[];
  };
  date: Date;
  from: string;
  to: string;
  subject: string;
}

export default function Email() {
  const { user, googleAccessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [operationsEmails, setOperationsEmails] = useState<string[]>([]);

  // Composer state
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user || !googleAccessToken) {
      setLoading(false);
      return;
    }

    const fetchEmails = async () => {
      try {
        setLoading(true);
        // 1. Fetch active operations to get their emails
        const opsRef = collection(db, `users/${user.uid}/operations`);
        const q = query(opsRef, where("status", "==", "active"));
        const querySnapshot = await getDocs(q);

        const emails: string[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.email) {
            emails.push(data.email.trim());
          }
        });

        setOperationsEmails(emails);

        if (emails.length === 0) {
          setLoading(false);
          return;
        }

        // 2. Build Gmail query string (max 10 emails to keep query reasonable)
        const topEmails = emails.slice(0, 10);
        const searchQuery = topEmails.map(email => `from:${email} OR to:${email}`).join(' OR ');

        // 3. Fetch threads from Gmail API
        const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${encodeURIComponent(searchQuery)}&maxResults=20`, {
          headers: {
            Authorization: `Bearer ${googleAccessToken}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch threads');
        }

        const data = await response.json();

        if (!data.threads) {
          setThreads([]);
          setLoading(false);
          return;
        }

        // 4. Fetch details for each thread
        const threadDetailsPromises = data.threads.map(async (thread: any) => {
          const threadRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${thread.id}`, {
            headers: { Authorization: `Bearer ${googleAccessToken}` }
          });
          const threadData = await threadRes.json();

          const messages = threadData.messages.map((msg: any) => {
            const headers = msg.payload.headers;
            const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

            return {
              id: msg.id,
              threadId: msg.threadId,
              snippet: msg.snippet,
              payload: msg.payload,
              date: new Date(parseInt(msg.internalDate)),
              from: getHeader('from'),
              to: getHeader('to'),
              subject: getHeader('subject')
            };
          }).sort((a: any, b: any) => b.date.getTime() - a.date.getTime()); // Newest first

          return {
            id: threadData.id,
            snippet: threadData.messages[threadData.messages.length - 1].snippet,
            historyId: threadData.historyId,
            messages
          };
        });

        const detailedThreads = await Promise.all(threadDetailsPromises);
        // Sort threads by most recent message date
        detailedThreads.sort((a, b) => {
          const aDate = a.messages[0]?.date.getTime() || 0;
          const bDate = b.messages[0]?.date.getTime() || 0;
          return bDate - aDate;
        });

        setThreads(detailedThreads);
      } catch (error) {
        console.error('Error fetching emails:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEmails();
  }, [user, googleAccessToken]);

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleAccessToken || !composeTo || !composeSubject || !composeBody) return;

    try {
      setSending(true);

      // Create raw email string
      const emailContent = [
        `To: ${composeTo}`,
        `Subject: ${composeSubject}`,
        'Content-Type: text/plain; charset=utf-8',
        'MIME-Version: 1.0',
        '',
        composeBody
      ].join('\r\n');

      // Base64url encode
      const encodedEmail = btoa(unescape(encodeURIComponent(emailContent)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${googleAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          raw: encodedEmail
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send email');
      }

      setIsComposerOpen(false);
      setComposeTo('');
      setComposeSubject('');
      setComposeBody('');

      // Optionally refresh threads here
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Failed to send email. Check console for details.');
    } finally {
      setSending(false);
    }
  };

  const getCleanEmail = (emailString: string) => {
    const match = emailString.match(/<(.+)>/);
    return match ? match[1] : emailString;
  };

  const getCleanName = (emailString: string) => {
    const match = emailString.match(/(.+) </);
    return match ? match[1].replace(/"/g, '') : emailString;
  };

  const decodeBody = (payload: any): string => {
    let base64 = '';
    if (payload.body && payload.body.data) {
      base64 = payload.body.data;
    } else if (payload.parts && payload.parts.length > 0) {
      // Try to find text/plain
      const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
      if (textPart && textPart.body && textPart.body.data) {
        base64 = textPart.body.data;
      } else {
        // Fallback to text/html
        const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
        if (htmlPart && htmlPart.body && htmlPart.body.data) {
          base64 = htmlPart.body.data;
        }
      }
    }

    if (!base64) return 'Message body could not be decoded.';

    // Replace base64url characters
    base64 = base64.replace(/-/g, '+').replace(/_/g, '/');
    try {
      return decodeURIComponent(escape(atob(base64)));
    } catch (e) {
      return 'Message body decoding error.';
    }
  };

  const formatDate = (date: Date) => {
    if (isToday(date)) {
      return format(date, 'h:mm a');
    } else if (isYesterday(date)) {
      return 'Yesterday';
    } else {
      return format(date, 'MMM d');
    }
  };

  if (!googleAccessToken) {
    return (
      <div className="animate-in fade-in duration-500">
        <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight mb-8">Client Communications</h1>
        <div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-12 flex flex-col items-center justify-center text-center">
          <Mail size={48} className="text-stone-300 mb-4" />
          <h2 className="text-xl font-bold text-stone-900 mb-2">Connect Gmail</h2>
          <p className="text-stone-500 max-w-md mx-auto mb-6">
            To view and send emails directly from DOIS, please sign in with a Google account and grant Gmail permissions.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-6 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm"
          >
            Refresh App
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex justify-between items-end mb-6 shrink-0">
        <div>
          <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">Client Communications</h1>
          <p className="mt-2 text-stone-500 text-sm">Recent emails with your active operations.</p>
        </div>
        <button
          onClick={() => setIsComposerOpen(true)}
          className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
        >
          <Plus size={18} />
          Compose
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden flex flex-1 min-h-0">

        {/* Thread List Sidebar */}
        <div className={`w-full md:w-1/3 border-r border-stone-100 flex flex-col ${selectedThread ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 border-b border-stone-100 bg-stone-50/50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
              <input
                type="text"
                placeholder="Search emails..."
                className="w-full bg-white border border-stone-200 focus:border-[#D49A6A] focus:ring-2 focus:ring-[#D49A6A]/20 rounded-xl py-2 pl-9 pr-4 text-sm transition-all"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-8 flex flex-col items-center justify-center text-stone-400">
                <Loader2 size={24} className="animate-spin mb-2" />
                <span className="text-sm">Fetching emails...</span>
              </div>
            ) : threads.length === 0 ? (
              <div className="p-8 text-center text-stone-500 text-sm">
                <MessageSquare size={32} className="mx-auto text-stone-300 mb-3" />
                No recent emails found for active operations.
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {threads.map(thread => {
                  const latestMsg = thread.messages[0];
                  const isSelected = selectedThread?.id === thread.id;

                  return (
                    <button
                      key={thread.id}
                      onClick={() => setSelectedThread(thread)}
                      className={`w-full text-left p-4 hover:bg-stone-50 transition-colors flex flex-col gap-1 ${isSelected ? 'bg-stone-50 ring-1 ring-[#D49A6A] ring-inset' : ''}`}
                    >
                      <div className="flex justify-between items-baseline w-full">
                        <span className="font-bold text-stone-900 truncate text-sm">
                          {getCleanName(latestMsg.from)}
                        </span>
                        <span className="text-xs text-stone-500 shrink-0 ml-2">
                          {formatDate(latestMsg.date)}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-stone-700 truncate w-full">
                        {latestMsg.subject || '(No Subject)'}
                      </span>
                      <span className="text-xs text-stone-500 truncate w-full" dangerouslySetInnerHTML={{ __html: latestMsg.snippet }} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Thread Detail View */}
        <div className={`flex-1 flex flex-col bg-[#F9F8F6]/30 ${!selectedThread ? 'hidden md:flex' : 'flex'}`}>
          {selectedThread ? (
            <>
              {/* Detail Header */}
              <div className="p-4 md:p-6 border-b border-stone-100 bg-white shrink-0 flex items-center justify-between">
                <div>
                  <button
                    onClick={() => setSelectedThread(null)}
                    className="md:hidden text-stone-500 text-sm font-medium hover:text-stone-900 mb-2 flex items-center gap-1"
                  >
                    &larr; Back
                  </button>
                  <h2 className="text-xl font-bold text-stone-900">
                    {selectedThread.messages[0].subject || '(No Subject)'}
                  </h2>
                </div>
              </div>

              {/* Messages List */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                {/* Reverse to show oldest first in the thread view */}
                {[...selectedThread.messages].reverse().map((msg, idx) => {
                  const isMe = msg.from.includes(user?.email || '');

                  return (
                    <div key={msg.id} className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100">
                      <div className="flex justify-between items-start mb-4 pb-4 border-b border-stone-50">
                        <div>
                          <div className="font-bold text-stone-900 text-sm">
                            {isMe ? 'You' : getCleanName(msg.from)}
                          </div>
                          <div className="text-xs text-stone-500 mt-0.5">
                            to {getCleanName(msg.to)}
                          </div>
                        </div>
                        <div className="text-xs text-stone-400 whitespace-nowrap">
                          {format(msg.date, 'MMM d, yyyy h:mm a')}
                        </div>
                      </div>
                      <div
                        className="text-sm text-stone-700 whitespace-pre-wrap font-sans prose prose-sm max-w-none prose-p:my-1 prose-a:text-[#D49A6A]"
                        dangerouslySetInnerHTML={{
                          __html: decodeBody(msg.payload).replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Quick Reply Box */}
              <div className="p-4 bg-white border-t border-stone-100 shrink-0">
                <button
                  onClick={() => {
                    const to = selectedThread.messages[0].from.includes(user?.email || '')
                      ? selectedThread.messages[0].to
                      : selectedThread.messages[0].from;
                    setComposeTo(getCleanEmail(to));
                    setComposeSubject(`Re: ${selectedThread.messages[0].subject}`);
                    setIsComposerOpen(true);
                  }}
                  className="w-full bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-600 rounded-xl px-4 py-3 text-sm text-left transition-colors flex items-center gap-2"
                >
                  <MessageSquare size={16} />
                  Reply to this thread...
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-stone-400 p-8 text-center">
              <Mail size={48} className="mb-4 text-stone-200" />
              <p>Select a thread to view the conversation</p>
            </div>
          )}
        </div>
      </div>

      {/* Composer Modal */}
      {isComposerOpen && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-stone-100 flex justify-between items-center bg-stone-50/50 shrink-0">
              <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                New Message
              </h2>
              <button
                onClick={() => setIsComposerOpen(false)}
                className="text-stone-400 hover:text-stone-600 transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSendEmail} className="flex flex-col flex-1">
              <div className="p-6 flex flex-col gap-4 border-b border-stone-100">
                <div className="flex items-center gap-2 border-b border-stone-100 pb-2">
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-wider w-16">To:</label>
                  <input
                    type="email"
                    required
                    value={composeTo}
                    onChange={(e) => setComposeTo(e.target.value)}
                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-stone-900 p-0"
                    placeholder="client@example.com"
                  />
                </div>
                <div className="flex items-center gap-2 border-b border-stone-100 pb-2">
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-wider w-16">Subject:</label>
                  <input
                    type="text"
                    required
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-stone-900 p-0 font-medium"
                    placeholder="Inspection Follow-up"
                  />
                </div>
              </div>

              <div className="p-6 pt-0 flex-1">
                <textarea
                  required
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  className="w-full h-64 bg-transparent border-none focus:ring-0 text-sm text-stone-800 p-0 resize-none font-sans"
                  placeholder="Write your message here..."
                />
              </div>

              <div className="px-6 py-4 border-t border-stone-100 bg-stone-50/50 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsComposerOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-200/50 rounded-xl transition-colors"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  disabled={sending || !composeTo || !composeSubject || !composeBody}
                  className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-6 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {sending ? (
                    <><Loader2 size={16} className="animate-spin" /> Sending...</>
                  ) : (
                    <><Send size={16} /> Send Email</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
