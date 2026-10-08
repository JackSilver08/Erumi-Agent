import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Folder,
  Image as ImageIcon,
  Loader2,
  Menu,
  MessageCircle,
  Paperclip,
  Plus,
  Send,
  Square,
  UserCircle,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { create } from 'zustand'

import {
  createConversation,
  getConversation,
  listConversations,
} from './lib/api'
import type { Conversation } from './lib/api'

type Message = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  status?: 'streaming' | 'completed' | 'failed'
}

type ConversationState = {
  messages: Message[]
  isStreaming: boolean
  addMessage: (message: Message) => void
  updateMessage: (id: string, content: string, status?: Message['status']) => void
  setMessages: (messages: Message[]) => void
  setStreaming: (value: boolean) => void
}

const useConversation = create<ConversationState>((set) => ({
  messages: [],
  isStreaming: false,
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, content, status) =>
    set((state) => ({
      messages: state.messages.map((message) =>
        message.id === id ? { ...message, content, status } : message,
      ),
    })),
  setMessages: (messages) => set({ messages }),
  setStreaming: (value) => set({ isStreaming: value }),
}))

function titleForMessage(content: string) {
  const normalized = content.trim().replace(/\s+/g, ' ')
  return normalized.length > 30 ? `${normalized.slice(0, 30)}…` : normalized
}

function App() {
  const {
    messages,
    isStreaming,
    addMessage,
    updateMessage,
    setMessages,
    setStreaming,
  } = useConversation()

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [activeModal, setActiveModal] = useState<'schedule' | 'library' | null>(null)
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const initializedRef = useRef(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const attachmentRef = useRef<HTMLDivElement | null>(null)

  const canSubmit = input.trim().length > 0 && !isStreaming && !loading

  // Close attachment dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        attachmentRef.current &&
        !attachmentRef.current.contains(event.target as Node)
      ) {
        setShowAttachmentMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  async function selectConversation(id: string) {
    try {
      setError(null)
      const conversation = await getConversation(id)
      setActiveConversationId(id)
      setMessages(
        conversation.messages.map((message) => ({
          id: message.id,
          role:
            message.role === 'assistant' ||
            message.role === 'user' ||
            message.role === 'system'
              ? message.role
              : 'assistant',
          content: message.content,
          status:
            message.status === 'failed'
              ? 'failed'
              : message.status === 'streaming'
                ? 'streaming'
                : 'completed',
        })),
      )
      setMobileSidebarOpen(false)
      window.requestAnimationFrame(() => {
        if (inputRef.current) inputRef.current.focus()
        if (textareaRef.current) textareaRef.current.focus()
      })
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể mở đoạn chat này.',
      )
    }
  }

  async function refreshConversations() {
    const items = await listConversations()
    setConversations(items)
    return items
  }

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    async function initialize() {
      try {
        setLoading(true)
        setError(null)
        const items = await refreshConversations()

        if (items.length > 0) {
          await selectConversation(items[0].id)
        } else {
          const created = await createConversation()
          setConversations([created])
          setActiveConversationId(created.id)
          setMessages([])
        }
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Không thể khởi động Erumi.',
        )
      } finally {
        setLoading(false)
      }
    }

    void initialize()
  }, [])

  async function handleNewChat() {
    try {
      const created = await createConversation()
      setConversations((items) => [created, ...items])
      setActiveConversationId(created.id)
      setMessages([])
      setInput('')
      setError(null)
      setMobileSidebarOpen(false)
      window.requestAnimationFrame(() => {
        if (inputRef.current) inputRef.current.focus()
        if (textareaRef.current) textareaRef.current.focus()
      })
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể tạo đoạn chat mới.',
      )
    }
  }

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    if (event) event.preventDefault()

    const prompt = input.trim()
    if (!prompt || isStreaming || !activeConversationId) return

    const userMessageId = crypto.randomUUID()
    const assistantId = crypto.randomUUID()

    addMessage({
      id: userMessageId,
      role: 'user',
      content: prompt,
      status: 'completed',
    })

    addMessage({
      id: assistantId,
      role: 'assistant',
      content: '',
      status: 'streaming',
    })

    setConversations((items) =>
      items.map((conversation) =>
        conversation.id === activeConversationId
          ? { ...conversation, title: titleForMessage(prompt) }
          : conversation,
      ),
    )

    setInput('')
    setShowAttachmentMenu(false)
    setStreaming(true)
    setError(null)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await fetch('/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: activeConversationId,
          model: 'erumi-auto',
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        }),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        throw new Error('Erumi không thể kết nối tới dịch vụ trò chuyện.')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let answer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const eventText of events) {
          const dataLine = eventText
            .split('\n')
            .find((line) => line.startsWith('data: '))

          if (!dataLine) continue

          const payload = JSON.parse(dataLine.slice(6)) as {
            type?: string
            content?: string
            message?: string
            conversation_id?: string
          }

          if (payload.type === 'metadata' && payload.conversation_id) {
            setActiveConversationId(payload.conversation_id)
          }

          if (payload.type === 'token') {
            answer += payload.content ?? ''
            updateMessage(assistantId, answer, 'streaming')
          }

          if (payload.type === 'error') {
            throw new Error(payload.message ?? 'Erumi không thể tạo câu trả lời.')
          }

          if (payload.type === 'done') {
            updateMessage(assistantId, answer, 'completed')
          }
        }
      }

      await refreshConversations()
    } catch (requestError) {
      if ((requestError as Error).name !== 'AbortError') {
        const message =
          requestError instanceof Error
            ? requestError.message
            : 'Erumi chưa thể phản hồi.'

        updateMessage(assistantId, message, 'failed')
        setError(message)
      }
    } finally {
      abortRef.current = null
      setStreaming(false)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSubmit()
    }
  }

  function stopStreaming() {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
  }

  const emptyState = messages.length === 0 && !loading

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-[#3f3f3f]">
      {/* Mobile Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 lg:hidden transition-opacity duration-200 ${
          mobileSidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setMobileSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* ========================================================
          SIDEBAR: Khớp chính xác với hình 1.png và 2.png
          ======================================================== */}
      <aside
        className={`relative z-50 flex flex-col h-full bg-[#145da0] text-white transition-all duration-300 select-none shadow-xl lg:shadow-none ${
          mobileSidebarOpen
            ? 'fixed inset-y-0 left-0 w-[275px] translate-x-0'
            : 'fixed inset-y-0 left-0 -translate-x-full lg:static lg:translate-x-0'
        } ${sidebarCollapsed ? 'lg:w-[70px]' : 'lg:w-[275px]'}`}
      >
        {/* Toggle tab on right edge (nút mũi tên ở mép sidebar) */}
        <button
          type="button"
          onClick={() => setSidebarCollapsed((v) => !v)}
          className="sidebar-toggle-tab hidden lg:flex"
          title={sidebarCollapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
          aria-label={sidebarCollapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
        >
          {sidebarCollapsed ? (
            <ChevronRight size={13} strokeWidth={2.8} />
          ) : (
            <ChevronLeft size={13} strokeWidth={2.8} />
          )}
        </button>

        {/* Top Header & Brand */}
        <div className="flex flex-col pt-6 pb-2">
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center justify-center gap-4 mb-2">
              <span className="text-2xl font-black italic tracking-wider">E</span>
            </div>
          ) : (
            <div className="px-7 mb-4 flex items-center justify-between">
              <h1 className="erumi-brand-title">ERUMI</h1>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="lg:hidden text-white/80 hover:text-white p-1"
                aria-label="Đóng thanh bên"
              >
                <X size={22} />
              </button>
            </div>
          )}

          {/* Navigation Items */}
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center gap-3 px-2">
              <button
                type="button"
                onClick={() => void handleNewChat()}
                className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all"
                title="Đoạn chat mới"
              >
                <Plus size={22} strokeWidth={2.4} />
              </button>
              <button
                type="button"
                onClick={() => setActiveModal('schedule')}
                className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-white/15 text-white transition-all"
                title="Lịch trình"
              >
                <Clock size={20} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                onClick={() => setActiveModal('library')}
                className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-white/15 text-white transition-all"
                title="Thư viện"
              >
                <Folder size={20} strokeWidth={2.2} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1 px-5">
              <button
                type="button"
                onClick={() => void handleNewChat()}
                className="sidebar-menu-btn"
              >
                <Plus size={22} strokeWidth={2.4} />
                <span>Đoạn chat mới</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveModal('schedule')}
                className="sidebar-menu-btn"
              >
                <Clock size={21} strokeWidth={2.2} />
                <span>Lịch trình</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveModal('library')}
                className="sidebar-menu-btn"
              >
                <Folder size={21} strokeWidth={2.2} />
                <span>Thư viện</span>
              </button>
            </div>
          )}
        </div>

        {/* Solid Divider */}
        {!sidebarCollapsed && <div className="border-t border-white/70 mx-6 my-3" />}

        {/* Middle Section: Recent Chats inside Dashed Box */}
        <div className="flex-1 flex flex-col min-h-0 px-5 overflow-hidden">
          {!sidebarCollapsed ? (
            <>
              <div className="mb-2 px-2 text-[14px] italic text-white/95 font-normal">
                Gần đây
              </div>
              <div className="sidebar-history-container flex-1 min-h-[220px] flex flex-col overflow-hidden mb-2">
                {conversations.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-white/90 text-[15px] select-none text-center px-2">
                    Lịch sử chat
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                    {conversations.map((conversation) => {
                      const active = conversation.id === activeConversationId
                      return (
                        <div
                          key={conversation.id}
                          className={`sidebar-history-item ${active ? 'active' : ''}`}
                          onClick={() => void selectConversation(conversation.id)}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <MessageCircle size={16} className="shrink-0 opacity-80" />
                            <span className="truncate">
                              {conversation.title || 'Đoạn chat mới'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center opacity-70">
              <MessageCircle size={22} />
            </div>
          )}
        </div>

        {/* Solid Divider */}
        {!sidebarCollapsed && <div className="border-t border-white/70 mx-6 my-3" />}

        {/* Bottom User Profile */}
        <div className="p-4 pt-2">
          {sidebarCollapsed ? (
            <div
              className="flex justify-center text-white cursor-pointer hover:opacity-90 transition-opacity"
              title="Username"
            >
              <UserCircle size={32} strokeWidth={1.8} />
            </div>
          ) : (
            <div className="flex items-center gap-3 px-3 py-2 text-white">
              <UserCircle size={36} strokeWidth={1.8} className="shrink-0" />
              <span className="text-[17px] font-medium tracking-wide">Username</span>
            </div>
          )}
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="relative flex flex-1 flex-col h-full min-w-0 bg-white overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="p-2 rounded-lg bg-[#145da0] text-white"
            aria-label="Mở menu"
          >
            <Menu size={20} />
          </button>
          <div className="text-xl font-black italic text-[#145da0]">ERUMI</div>
          <button
            type="button"
            onClick={() => void handleNewChat()}
            className="p-2 rounded-lg bg-[#145da0] text-white"
            aria-label="Đoạn chat mới"
          >
            <Plus size={20} />
          </button>
        </header>

        {/* Floating Error Alert */}
        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 max-w-lg w-[90%] bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-xl text-sm shadow-md flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700 p-1"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* CONTENT SWITCH: EMPTY STATE (1.png) vs ACTIVE CHAT (2.png) */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 className="animate-spin text-[#145da0]" size={28} />
            <span className="text-sm">Erumi đang khởi động…</span>
          </div>
        ) : emptyState ? (
          /* ========================================================
             EMPTY STATE / TRANG CHỦ (Khớp 100% với phác thảo 1.png)
             ======================================================== */
          <div className="flex-1 flex flex-col items-center justify-center px-4 pb-16">
            {/* Mascot Robot */}
            <img
              src="/erumi-chatbot.png"
              alt="ERUMI Mascot"
              className="w-[125px] h-[125px] object-contain select-none mb-4 drop-shadow-sm transition-transform hover:scale-105 duration-200"
            />

            {/* Heading: ERUMI CÓ THỂ GIÚP GÌ CHO BẠN ? */}
            <h2 className="text-center font-extrabold text-[24px] sm:text-[32px] md:text-[38px] text-[#3f3f3f] tracking-tight uppercase max-w-3xl px-4 select-none mb-8">
              ERUMI CÓ THỂ GIÚP GÌ CHO BẠN ?
            </h2>

            {/* Centered Pill Search / Input Bar (Khớp 1.png) */}
            <div className="w-full max-w-[620px] px-2 relative" ref={attachmentRef}>
              <form onSubmit={handleSubmit} className="w-full">
                <div className="erumi-pill-input">
                  {/* Left '+' button */}
                  <button
                    type="button"
                    onClick={() => setShowAttachmentMenu((v) => !v)}
                    className="pill-action-btn"
                    title="Thêm tùy chọn"
                  >
                    <Plus size={26} strokeWidth={2.4} />
                  </button>

                  {/* Input field */}
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Hỏi Erumi"
                    className="flex-1 bg-transparent border-0 outline-none text-white text-[17px] font-medium placeholder:text-white/80 px-3 py-2"
                  />

                  {/* Right Send icon button */}
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="pill-action-btn"
                    title="Gửi tin nhắn"
                  >
                    <Send size={22} strokeWidth={2} />
                  </button>
                </div>
              </form>

              {/* Attachment Popup Menu */}
              {showAttachmentMenu && (
                <div className="absolute left-6 -top-36 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 w-56 text-[#373A3C] z-30 animate-fade-in">
                  <button
                    type="button"
                    onClick={() => {
                      setInput((prev) => `${prev} [Tài liệu đính kèm] `)
                      setShowAttachmentMenu(false)
                    }}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                  >
                    <Paperclip size={18} className="text-[#145da0]" />
                    <span>Đính kèm tệp tin</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInput((prev) => `${prev} [Hình ảnh] `)
                      setShowAttachmentMenu(false)
                    }}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                  >
                    <ImageIcon size={18} className="text-[#145da0]" />
                    <span>Tải ảnh lên</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveModal('schedule')
                      setShowAttachmentMenu(false)
                    }}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                  >
                    <Calendar size={18} className="text-[#145da0]" />
                    <span>Lập lịch trình</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ========================================================
             ACTIVE CHAT STATE (Khớp 100% với phác thảo 2.png)
             ======================================================== */
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Scrollable Message List */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-8 lg:px-16 pt-8 pb-32">
              <div className="max-w-4xl mx-auto space-y-7">
                {messages.map((message) => {
                  const isUser = message.role === 'user'
                  return (
                    <div
                      key={message.id}
                      className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}
                    >
                      {isUser ? (
                        /* USER SPEECH BUBBLE WITH CURVED RIGHT TAIL (Khớp 2.png) */
                        <div className="relative max-w-[80%] sm:max-w-[70%]">
                          <div className="speech-bubble-user">
                            <p className="whitespace-pre-wrap">{message.content}</p>
                          </div>
                          {/* Curved tail pointing downwards-right matching 2.png */}
                          <svg
                            className="absolute -bottom-2 right-2 w-[18px] h-[15px] text-[#004aad] fill-current pointer-events-none"
                            viewBox="0 0 18 15"
                          >
                            <path d="M0 0 C6 1 12 5 18 15 C15 10 11 5 6 0 Z" />
                          </svg>
                        </div>
                      ) : (
                        /* ASSISTANT SPEECH BUBBLE WITH CURVED LEFT TAIL + MASCOT (Khớp 2.png) */
                        <div className="flex items-start gap-3 max-w-[85%] sm:max-w-[75%]">
                          <img
                            src="/erumi-chatbot.png"
                            alt="ERUMI"
                            className="w-10 h-10 object-contain shrink-0 mt-1 select-none"
                          />
                          <div className="relative flex-1">
                            <div className="speech-bubble-assistant">
                              <p className="whitespace-pre-wrap">
                                {message.content ||
                                  (message.status === 'streaming'
                                    ? 'Erumi đang suy nghĩ…'
                                    : '')}
                              </p>
                              {message.status === 'streaming' && (
                                <div className="mt-2 flex items-center gap-1.5 text-xs text-white/80">
                                  <Loader2 size={12} className="animate-spin" />
                                  <span>Đang phản hồi...</span>
                                </div>
                              )}
                            </div>
                            {/* Curved tail pointing downwards-left toward mascot matching 2.png */}
                            <svg
                              className="absolute -bottom-2 left-2 w-[18px] h-[15px] text-[#004aad] fill-current pointer-events-none"
                              viewBox="0 0 18 15"
                            >
                              <path d="M18 0 C12 1 6 5 0 15 C3 10 7 5 12 0 Z" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Pinned Bottom Input Bar (Khớp 2.png) */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white/95 to-transparent pt-6 pb-6 px-4 flex justify-center">
              <div className="w-full max-w-3xl relative" ref={attachmentRef}>
                <form onSubmit={handleSubmit} className="w-full">
                  <div className="erumi-pill-input">
                    {/* Left '+' button */}
                    <button
                      type="button"
                      onClick={() => setShowAttachmentMenu((v) => !v)}
                      className="pill-action-btn"
                      title="Thêm tùy chọn"
                    >
                      <Plus size={26} strokeWidth={2.4} />
                    </button>

                    {/* Auto-growing Textarea or Input */}
                    <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      rows={1}
                      placeholder="Hỏi Erumi"
                      className="flex-1 bg-transparent border-0 outline-none text-white text-[17px] font-medium placeholder:text-white/80 px-3 py-2 resize-none max-h-32"
                    />

                    {/* Right Action Button (Send or Stop) */}
                    {isStreaming ? (
                      <button
                        type="button"
                        onClick={stopStreaming}
                        className="pill-action-btn"
                        title="Dừng"
                      >
                        <Square size={20} fill="currentColor" />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={!canSubmit}
                        className="pill-action-btn"
                        title="Gửi"
                      >
                        <Send size={22} strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </form>

                {/* Attachment Menu in Chat View */}
                {showAttachmentMenu && (
                  <div className="absolute left-6 -top-36 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 w-56 text-[#373A3C] z-30 animate-fade-in">
                    <button
                      type="button"
                      onClick={() => {
                        setInput((prev) => `${prev} [Tài liệu đính kèm] `)
                        setShowAttachmentMenu(false)
                      }}
                      className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                    >
                      <Paperclip size={18} className="text-[#145da0]" />
                      <span>Đính kèm tệp tin</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setInput((prev) => `${prev} [Hình ảnh] `)
                        setShowAttachmentMenu(false)
                      }}
                      className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                    >
                      <ImageIcon size={18} className="text-[#145da0]" />
                      <span>Tải ảnh lên</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveModal('schedule')
                        setShowAttachmentMenu(false)
                      }}
                      className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                    >
                      <Calendar size={18} className="text-[#145da0]" />
                      <span>Lập lịch trình</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================
          MODAL: LỊCH TRÌNH (SCHEDULE)
          ======================================================== */}
      {activeModal === 'schedule' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl p-6 border border-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#145da0]/10 text-[#145da0] flex items-center justify-center">
                  <Clock size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Lịch trình Erumi</h3>
                  <p className="text-xs text-slate-500">Tác vụ tự động & Nhắc nhở</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="py-6 space-y-3">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-slate-800">Báo cáo hàng ngày</h4>
                  <p className="text-xs text-slate-500">Mỗi ngày lúc 08:00 sáng</p>
                </div>
                <span className="text-xs bg-[#145da0]/15 text-[#145da0] font-semibold px-2.5 py-1 rounded-full">
                  Đang bật
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-slate-800">Cập nhật tin tức & tóm tắt</h4>
                  <p className="text-xs text-slate-500">Thứ 2 & Thứ 6 lúc 17:00</p>
                </div>
                <span className="text-xs bg-[#145da0]/15 text-[#145da0] font-semibold px-2.5 py-1 rounded-full">
                  Đang bật
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-5 py-2.5 rounded-xl bg-[#145da0] text-white text-sm font-semibold hover:bg-[#10528e] transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: THƯ VIỆN (LIBRARY)
          ======================================================== */}
      {activeModal === 'library' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl p-6 border border-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#145da0]/10 text-[#145da0] flex items-center justify-center">
                  <Folder size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Thư viện của bạn</h3>
                  <p className="text-xs text-slate-500">Tài liệu, dữ liệu và mẫu câu hỏi</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="py-6 space-y-3">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-3">
                <FileText size={20} className="text-[#145da0] shrink-0" />
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-semibold text-slate-800 truncate">
                    Erumi_Agent_Project_Plan.docx
                  </h4>
                  <p className="text-xs text-slate-500">Kế hoạch dự án và tài liệu tham khảo</p>
                </div>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-3">
                <FileText size={20} className="text-[#145da0] shrink-0" />
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-semibold text-slate-800 truncate">
                    Hướng dẫn sử dụng Erumi AI
                  </h4>
                  <p className="text-xs text-slate-500">Tài liệu hướng dẫn mẫu</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-5 py-2.5 rounded-xl bg-[#145da0] text-white text-sm font-semibold hover:bg-[#10528e] transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
