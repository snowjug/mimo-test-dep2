import React, { useEffect, useRef, useState } from 'react';
import { Send, Image as ImageIcon, X, Loader2 } from 'lucide-react';
import { chatServiceFor, ChatMessage } from '../../services/chat.service';

const toMs = (v: string | { _seconds: number }) =>
  typeof v === 'string' ? new Date(v).getTime() : v?._seconds ? v._seconds * 1000 : Date.now();

const Avatar: React.FC<{ name: string; url: string | null }> = ({ name, url }) =>
  url ? (
    <img src={url} alt={name} className="size-8 shrink-0 rounded-full object-cover" />
  ) : (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
      {name.slice(0, 2).toUpperCase()}
    </div>
  );

/** Team chat for proof-of-work: text + optional photo, scoped to the caller's own portal/role.
 * Polls every 8s for near-real-time updates -- simple and reliable, no extra realtime infra needed. */
export const ChatPanel: React.FC<{ basePath: string; selfId: string; title?: string }> = ({ basePath, selfId, title = 'Team Chat' }) => {
  const service = React.useMemo(() => chatServiceFor(basePath), [basePath]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const msgs = await service.messages();
      setMessages(msgs);
    } catch {
      /* transient poll failure -- next tick retries */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const pickImage = (f: File | null) => {
    setImage(f);
    setImagePreview(f ? URL.createObjectURL(f) : null);
  };

  // Paste a screenshot directly from the clipboard -- the exact "proof of work" flow asked for.
  const onPaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
    if (item) {
      const file = item.getAsFile();
      if (file) pickImage(file);
    }
  };

  const send = async () => {
    if (!text.trim() && !image) return;
    setSending(true);
    try {
      const msg = await service.send(text.trim(), image);
      setMessages((prev) => [...prev, msg]);
      setText('');
      pickImage(null);
    } catch (err) {
      console.error('Failed to send chat message:', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-[480px] flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <p className="text-sm font-bold text-[var(--text-1)]">{title}</p>
        <p className="text-[11px] text-[var(--text-3)]">Share updates and proof of work -- text or a screenshot.</p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="flex h-full items-center justify-center text-[var(--text-3)]">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-[var(--text-3)]">No messages yet. Say hello, or drop in a screenshot of what you just finished.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex gap-2 ${m.senderId === selfId ? 'flex-row-reverse' : ''}`}>
              <Avatar name={m.senderName} url={m.senderAvatarUrl} />
              <div className={`max-w-[75%] ${m.senderId === selfId ? 'items-end text-right' : ''}`}>
                <p className="text-[10.5px] font-semibold text-[var(--text-3)]">
                  {m.senderName} · {new Date(toMs(m.createdAt)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
                <div className={`mt-0.5 rounded-2xl px-3 py-2 text-sm ${m.senderId === selfId ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-2)] text-[var(--text-1)]'}`}>
                  {m.imageUrl && (
                    <img src={m.imageUrl} alt="Proof of work" className="mb-1.5 max-h-64 rounded-lg object-contain" />
                  )}
                  {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-[var(--border)] p-3">
        {imagePreview && (
          <div className="relative mb-2 inline-block">
            <img src={imagePreview} alt="Attachment preview" className="max-h-28 rounded-lg border border-[var(--border)]" />
            <button type="button" onClick={() => pickImage(null)} className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-rose-600 text-white cursor-pointer">
              <X size={12} />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-2)] cursor-pointer"
            title="Attach a screenshot"
          >
            <ImageIcon size={16} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0] || null)} />
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Message, or paste a screenshot..."
            className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:border-[var(--primary)]"
          />
          <button
            type="button"
            onClick={send}
            disabled={sending || (!text.trim() && !image)}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] text-white disabled:opacity-40 cursor-pointer"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
};
