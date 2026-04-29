import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, Bot, User, Trash2, Loader2 } from 'lucide-react';
import { createSSEStream } from '../utils/api.js';
import api from '../utils/api.js';

const QUICK_PROMPTS = [
  'What should I eat for breakfast today?',
  'Why did my glucose spike after lunch?',
  'Analyze this menu: [paste a restaurant menu]',
  'Suggest a low-carb snack under 15g carbs',
  'Am I on track this week?',
];

export default function ChatBot({ open, onClose }) {
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError]         = useState('');
  const [loaded, setLoaded]       = useState(false);
  const bottomRef                 = useRef(null);
  const cancelRef                 = useRef(null);
  const textareaRef               = useRef(null);

  useEffect(() => {
    if (open && !loaded) {
      api.get('/chat/history').then((r) => {
        setMessages(r.data.messages.map((m) => ({ role: m.role, content: m.content, id: m.id })));
        setLoaded(true);
      }).catch(() => setLoaded(true));
    }
    if (open) setTimeout(() => textareaRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput('');
    setError('');
    const userMsg = { role: 'user', content: text, id: `u-${Date.now()}` };
    const aiMsg   = { role: 'assistant', content: '', id: `a-${Date.now()}`, streaming: true };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setStreaming(true);

    cancelRef.current = createSSEStream(
      '/api/chat/send',
      { message: text },
      (chunk) => {
        setMessages((prev) =>
          prev.map((m) => m.id === aiMsg.id ? { ...m, content: m.content + chunk } : m)
        );
      },
      () => {
        setMessages((prev) =>
          prev.map((m) => m.id === aiMsg.id ? { ...m, streaming: false } : m)
        );
        setStreaming(false);
      },
      (err) => {
        setError(err);
        setMessages((prev) => prev.filter((m) => m.id !== aiMsg.id));
        setStreaming(false);
      }
    );
  }, [input, streaming]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const clearHistory = async () => {
    if (!confirm('Clear all chat history?')) return;
    await api.delete('/chat/history').catch(() => {});
    setMessages([]);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:justify-end p-0 sm:p-4 bg-black/30 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="GlucoCoach AI Chat"
    >
      <div className="bg-white dark:bg-gray-900 w-full sm:w-96 h-full sm:h-[600px] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-brand-600 to-brand-700">
          <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-white text-sm">GlucoCoach</p>
            <p className="text-white/70 text-xs">AI Diet Coach • 24/7</p>
          </div>
          <button onClick={clearHistory} className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors" aria-label="Clear history">
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors" aria-label="Close chat">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3" aria-live="polite" aria-label="Chat messages">
          {messages.length === 0 && (
            <div className="text-center py-4">
              <Bot className="w-12 h-12 text-brand-200 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Hi, I'm GlucoCoach!</p>
              <p className="text-gray-400 text-xs mt-1">Ask me anything about your diet, glucose, or meal choices.</p>
              <div className="mt-4 space-y-1.5">
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => { setInput(p); textareaRef.current?.focus(); }}
                    className="block w-full text-left text-xs text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/40 px-3 py-2 rounded-lg transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 bg-brand-100 dark:bg-brand-800 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 text-brand-600 dark:text-brand-300" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-brand-600 text-white rounded-br-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-bl-sm'
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                {msg.streaming && (
                  <span className="inline-flex gap-0.5 ml-1">
                    {[0, 150, 300].map((d) => (
                      <span key={d} className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </span>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                </div>
              )}
            </div>
          ))}

          {error && <p className="text-xs text-red-500 text-center" role="alert">{error}</p>}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-gray-100 dark:border-gray-800">
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your diet, glucose, or meals…"
              rows={1}
              aria-label="Chat message"
              className="flex-1 resize-none rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-gray-100 placeholder-gray-400 max-h-28 overflow-y-auto"
              style={{ fieldSizing: 'content' }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || streaming}
              aria-label="Send message"
              className="p-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex-shrink-0"
            >
              {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 text-center mt-2">Enter to send • Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  );
}
