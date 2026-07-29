'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Search, Send, Loader2, Plus, X } from 'lucide-react';
import { Avatar, Spinner } from '@nemis-desktop/ui';
import { useCurrentUserViewModel } from '@/lib/presentation/hooks';
import { useViewModel } from '@/hooks/use-view-model';
import { nemisBridge } from '@/services/nemis-bridge';
import type { StudentListItemResult, TeacherResult } from '@nemis-desktop/types';
import {
  SENDER_ROLE_LABEL, loadConversations, loadMessagesForConversation, getOrCreateConversation,
  sendMessage, markMessagesRead, relativeTime, type ConversationRow, type MessageRow,
} from './shared';

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

function NewConversationModal({ onClose, onCreated }: { onClose: () => void; onCreated: (conversationId: string) => void }) {
  const [studentQuery, setStudentQuery] = useState('');
  const [students, setStudents] = useState<StudentListItemResult[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentListItemResult | null>(null);
  const [teacherQuery, setTeacherQuery] = useState('');
  const [teachers, setTeachers] = useState<TeacherResult[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherResult | null>(null);
  const [subject, setSubject] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const handle = setTimeout(async () => {
      const page = await nemisBridge.listStudents({ keyword: studentQuery || undefined, isActive: true, limit: 15, sort: 'name' });
      setStudents([...page.items]);
    }, 200);
    return () => clearTimeout(handle);
  }, [studentQuery]);

  useEffect(() => {
    const handle = setTimeout(async () => {
      const page = await nemisBridge.listTeachers({ keyword: teacherQuery || undefined, isActive: true, limit: 15, sort: 'name' });
      setTeachers([...page.items]);
    }, 200);
    return () => clearTimeout(handle);
  }, [teacherQuery]);

  const canCreate = Boolean(selectedStudent && selectedTeacher) && !creating;

  const handleCreate = async () => {
    if (!selectedStudent || !selectedTeacher) return;
    setCreating(true);
    try {
      const record = await getOrCreateConversation({ studentId: selectedStudent.id, teacherId: selectedTeacher.id, subject });
      onCreated(String(record.id));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-900">New Conversation</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-400">About Student</label>
            {selectedStudent ? (
              <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <span>{selectedStudent.fullName}</span>
                <button onClick={() => setSelectedStudent(null)} className="text-xs text-slate-400 hover:text-slate-600">Change</button>
              </div>
            ) : (
              <>
                <input value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)} placeholder="Search students…"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-secondary" />
                <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-slate-100">
                  {students.map((s) => (
                    <button key={s.id} onClick={() => setSelectedStudent(s)} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50">
                      {s.fullName} <span className="text-xs text-slate-400">· {s.admissionNumber}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-400">Teacher</label>
            {selectedTeacher ? (
              <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <span>{selectedTeacher.firstName} {selectedTeacher.lastName}</span>
                <button onClick={() => setSelectedTeacher(null)} className="text-xs text-slate-400 hover:text-slate-600">Change</button>
              </div>
            ) : (
              <>
                <input value={teacherQuery} onChange={(e) => setTeacherQuery(e.target.value)} placeholder="Search teachers…"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-secondary" />
                <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-slate-100">
                  {teachers.map((t) => (
                    <button key={t.id} onClick={() => setSelectedTeacher(t)} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50">
                      {t.firstName} {t.lastName}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-400">Subject (optional)</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Attendance concern"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-secondary" />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={handleCreate} disabled={!canCreate}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40">
            {creating ? 'Starting…' : 'Start Conversation'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MessagesPage() {
  const currentUser = useCurrentUserViewModel();
  const userState = useViewModel(currentUser.store, (s) => s.user);
  const userId = userState.status === 'success' ? userState.data.id : null;

  const [conversations, setConversations] = useState<ConversationRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[] | null>(null);
  const [messageText, setMessageText] = useState('');
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    currentUser.loadCurrentUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadConversations = useCallback(async () => {
    if (!userId) return;
    const rows = await loadConversations(userId);
    setConversations(rows);
  }, [userId]);

  useEffect(() => { reloadConversations(); }, [reloadConversations]);

  const openConversation = useCallback(async (id: string) => {
    setSelectedId(id);
    setMessages(null);
    const rows = await loadMessagesForConversation(id);
    setMessages(rows);
    const unreadIds = rows.filter((m) => !m.isRead && m.senderId !== userId).map((m) => m.id);
    if (unreadIds.length > 0) {
      await markMessagesRead(unreadIds);
      await reloadConversations();
    }
  }, [userId, reloadConversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selected = useMemo(() => (conversations ?? []).find((c) => c.id === selectedId) ?? null, [conversations, selectedId]);

  const filteredConversations = useMemo(() => {
    const list = conversations ?? [];
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter((c) => c.studentName.toLowerCase().includes(q) || c.teacherName.toLowerCase().includes(q));
  }, [conversations, search]);

  const handleSend = async () => {
    if (!selectedId || !messageText.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage({ conversationId: selectedId, content: messageText.trim() });
      setMessageText('');
      const rows = await loadMessagesForConversation(selectedId);
      setMessages(rows);
      await reloadConversations();
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isSidebarLoading = conversations === null;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex items-center justify-between bg-slate-900 px-6 py-5 text-white">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">School Admin Portal</p>
          <h1 className="mt-0.5 text-xl font-bold">Messages</h1>
        </div>
      </div>

      <div className="px-6 py-6">
        <div className="flex h-[calc(100vh-140px)] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {/* Sidebar */}
          <div className="flex w-80 flex-shrink-0 flex-col border-r border-gray-200">
            <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold text-gray-900">Conversations</h2>
              </div>
              <button onClick={() => setShowNewModal(true)} title="New conversation"
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-white hover:bg-primary/90">
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <div className="px-3 pb-1 pt-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students & teachers…"
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-xs focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto border-t border-gray-100">
              {isSidebarLoading ? (
                <div className="flex justify-center py-8"><Spinner size="md" /></div>
              ) : filteredConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-12 text-gray-400">
                  <MessageSquare className="h-6 w-6" />
                  <p className="text-center text-xs">{search ? 'No conversations match your search.' : 'No conversations yet. Start one above.'}</p>
                </div>
              ) : (
                filteredConversations.map((c) => (
                  <button key={c.id} onClick={() => openConversation(c.id)}
                    className={`flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${selectedId === c.id ? 'border-l-2 border-l-secondary bg-sky-50' : ''}`}>
                    <Avatar {...splitName(c.studentName)} role="student" size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-gray-900">{c.studentName}</p>
                        {c.unreadCount > 0 && (
                          <span className="flex h-[18px] min-w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-secondary px-1 text-xs text-white">
                            {c.unreadCount > 9 ? '9+' : c.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs font-medium text-slate-500">with {c.teacherName}{c.subject ? ` · ${c.subject}` : ''}</p>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        {c.lastMessagePreview && <p className="truncate text-xs text-gray-400">{c.lastMessagePreview}</p>}
                        {c.lastMessageAt && <span className="flex-shrink-0 text-xs text-gray-400">{relativeTime(c.lastMessageAt)}</span>}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Thread */}
          <div className="flex min-w-0 flex-1 flex-col">
            {!selected ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-400">
                <MessageSquare className="h-12 w-12" />
                <p className="text-base font-medium text-gray-500">Select a conversation</p>
                <p className="text-sm text-gray-400">Choose one from the list, or start a new one</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-6 py-4">
                  <Avatar {...splitName(selected.studentName)} role="student" size="sm" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{selected.studentName}</p>
                    <p className="text-xs text-gray-500">
                      Teacher: {selected.teacherName}
                      {selected.guardianName ? ` · Guardian: ${selected.guardianName}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-gray-50/30 px-6 py-4">
                  {messages === null ? (
                    <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
                  ) : messages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400">
                      <MessageSquare className="h-8 w-8" />
                      <p className="text-sm">No messages yet. Say hello!</p>
                    </div>
                  ) : (
                    messages.map((m) => {
                      const isOwn = m.senderId === userId;
                      const time = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      return (
                        <div key={m.id} className={`mb-3 flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                          {!isOwn && <span className="mb-1 ml-1 text-xs text-gray-500">{SENDER_ROLE_LABEL[m.senderRole] ?? m.senderRole}</span>}
                          <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm ${isOwn ? 'rounded-tr-sm bg-primary text-white' : 'rounded-tl-sm border border-gray-200 bg-white text-gray-800'}`}>
                            <p className="whitespace-pre-wrap break-words text-sm">{m.content}</p>
                          </div>
                          <span className={`mt-1 text-xs text-gray-400 ${isOwn ? 'mr-1' : 'ml-1'}`}>{time}</span>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="border-t border-gray-200 bg-white px-6 py-4">
                  <div className="flex items-end gap-3">
                    <textarea value={messageText} onChange={(e) => setMessageText(e.target.value)} onKeyDown={handleKeyDown}
                      placeholder="Type a message… (Enter to send, Shift+Enter for new line)" rows={2}
                      className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20" />
                    <button onClick={handleSend} disabled={!messageText.trim() || sending}
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40">
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-400">Press Enter to send · Shift+Enter for new line</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showNewModal && (
        <NewConversationModal
          onClose={() => setShowNewModal(false)}
          onCreated={async (conversationId) => {
            setShowNewModal(false);
            await reloadConversations();
            await openConversation(conversationId);
          }}
        />
      )}
    </div>
  );
}
