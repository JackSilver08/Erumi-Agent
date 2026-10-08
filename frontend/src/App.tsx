import {
  Archive,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Folder,
  Loader2,
  Menu,
  MessageCircle,
  MessageSquarePlus,
  Plus,
  Search,
  Send,
  Settings,
  Square,
  UserCircle,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
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
  return normalized.length > 34 ? `${normalized.slice(0, 34)}…` : normalized
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
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null,
  )
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const initializedRef = useRef(false)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const canSubmit = input.trim().length > 0 && !isStreaming && !loading

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
      window.requestAnimationFrame(() => inputRef.current?.focus())
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
      window.requestAnimationFrame(() => inputRef.current?.focus())
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể tạo đoạn chat mới.',
      )
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

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

  function stopStreaming() {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
  }

  function SidebarContent() {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-[#2168a6] text-white">
        <div className="border-b border-white/20 px-5 pb-5 pt-6">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setSidebarCollapsed((value) => !value)}
              className="sidebar-collapse-button"
              aria-label={sidebarCollapsed ? 'Mở thanh bên' : 'Thu gọn thanh bên'}
            >
              {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>

            {!sidebarCollapsed && (
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
                aria-label="Đóng"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {!sidebarCollapsed && (
            <div className="mt-4">
              <div className="erumi-wordmark">ERUMI</div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-hidden px-4 pt-4">
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => void handleNewChat()}
                className="sidebar-icon-button"
                title="Đoạn chat mới"
              >
                <Plus size={22} />
              </button>
              <button
                type="button"
                className="sidebar-icon-button"
                title="Lịch trình"
              >
                <CalendarDays size={21} />
              </button>
              <button
                type="button"
                className="sidebar-icon-button"
                title="Thư viện"
              >
                <Folder size={21} />
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => void handleNewChat()}
                  className="sidebar-nav-button"
                >
                  <Plus size={24} />
                  <span>Đoạn chat mới</span>
                </button>

                <button type="button" className="sidebar-nav-button">
                  <CalendarDays size={23} />
                  <span>Lịch trình</span>
                </button>

                <button type="button" className="sidebar-nav-button">
                  <Folder size={23} />
                  <span>Thư viện</span>
                </button>
              </div>

              <div className="my-5 border-t border-white/75" />

              <div className="mb-2 text-sm italic text-white/85">Gần đây</div>

              <div className="sidebar-history">
                {conversations.length === 0 ? (
                  <div className="flex h-full items-center justify-center px-5 text-center text-sm text-white/80">
                    Lịch sử chat
                  </div>
                ) : (
                  <div className="space-y-2">
                    {conversations.map((conversation) => {
                      const active = conversation.id === activeConversationId

                      return (
                        <button
                          key={conversation.id}
                          type="button"
                          onClick={() => void selectConversation(conversation.id)}
                          className={
                            active
                              ? 'sidebar-history-item sidebar-history-item-active'
                              : 'sidebar-history-item'
                          }
                        >
                          <MessageCircle size={17} />
                          <span>{conversation.title}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="border-t border-white/75 p-4">
          {sidebarCollapsed ? (
            <button
              type="button"
              className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#2168a6]"
              title="Tài khoản"
            >
              <UserCircle size={30} />
            </button>
          ) : (
            <div className="flex items-center gap-3 px-2 py-1">
              <UserCircle size={39} strokeWidth={1.6} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">Username</p>
                <p className="text-xs text-white/70">Tài khoản</p>
              </div>
              <Settings size={19} className="text-white/70" />
            </div>
          )}
        </div>
      </div>
    )
  }

  const emptyState = messages.length === 0 && !loading

  return (
    <main className="min-h-screen bg-white text-[#3e4045]">
      <div className="flex min-h-screen">
        <div
          className={`fixed inset-0 z-40 bg-black/35 lg:hidden ${
            mobileSidebarOpen
              ? 'opacity-100'
              : 'pointer-events-none opacity-0'
          }`}
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />

        <aside
          className={`fixed inset-y-0 left-0 z-50 w-[300px] shrink-0 shadow-[6px_0_20px_rgba(18,77,129,0.08)] transition-transform duration-200 lg:static lg:translate-x-0 ${
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          } ${
            sidebarCollapsed ? 'lg:w-[88px]' : 'lg:w-[300px]'
          }`}
        >
          <SidebarContent />
        </aside>

        <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="absolute left-0 right-0 top-0 z-10 flex h-16 items-center justify-between px-4 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="rounded-xl bg-[#2168a6] p-2.5 text-white shadow-sm"
              aria-label="Mở thanh bên"
            >
              <Menu size={20} />
            </button>

            <button
              type="button"
              onClick={() => void handleNewChat()}
              className="rounded-xl bg-[#2168a6] p-2.5 text-white shadow-sm"
              aria-label="Đoạn chat mới"
            >
              <MessageSquarePlus size={18} />
            </button>
          </header>

          {error && (
            <div className="absolute left-1/2 top-4 z-30 w-[min(680px,calc(100%-32px))] -translate-x-1/2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
              {error}
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div
                className={`mx-auto flex min-h-full w-full max-w-[1200px] flex-col px-5 pb-36 pt-20 sm:px-8 lg:px-12 ${
                  emptyState ? 'justify-center' : ''
                }`}
              >
                {loading ? (
                  <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">
                    <Loader2 className="mr-2 animate-spin" size={18} />
                    Erumi đang khởi động…
                  </div>
                ) : emptyState ? (
                  <div className="flex flex-col items-center justify-center pb-6">
                    <img
                      src="/erumi-chatbot.png"
                      alt="Erumi"
                      className="mb-8 h-[92px] w-[92px] object-contain sm:h-[108px] sm:w-[108px]"
                    />

                    <h1 className="text-center text-[30px] font-extrabold tracking-[-0.025em] text-[#404145] sm:text-[44px]">
                      ERUMI CÓ THỂ GIÚP GÌ CHO BẠN?
                    </h1>

                    <p className="mt-3 max-w-2xl text-center text-sm text-slate-500 sm:text-base">
                      Hỏi Erumi bất cứ điều gì. Bạn có thể trò chuyện, nghiên cứu hoặc
                      nhờ Erumi cùng bạn hoàn thành một việc nào đó.
                    </p>
                  </div>
                ) : (
                  <div className="mx-auto w-full max-w-5xl space-y-8 pt-2 sm:space-y-10">
                    {messages.map((message) => (
                      <article
                        key={message.id}
                        className={message.role === 'user' ? 'flex justify-end' : 'flex gap-3'}
                      >
                        {message.role !== 'user' && (
                          <img
                            src="/erumi-chatbot.png"
                            alt=""
                            className="mt-1 h-10 w-10 shrink-0 object-contain"
                          />
                        )}

                        <div
                          className={
                            message.role === 'user'
                              ? 'chat-bubble chat-bubble-user'
                              : message.status === 'failed'
                                ? 'chat-bubble chat-bubble-error'
                                : 'chat-bubble chat-bubble-assistant'
                          }
                        >
                          <p className="whitespace-pre-wrap leading-7">
                            {message.content ||
                              (message.status === 'streaming' ? 'Erumi đang suy nghĩ…' : '')}
                          </p>

                          {message.status === 'streaming' && (
                            <span className="mt-2 inline-flex items-center gap-2 text-xs text-white/80">
                              <Loader2 className="animate-spin" size={12} />
                              Đang trả lời
                            </span>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white/95 to-transparent px-4 pb-5 pt-12 sm:px-8 lg:px-12">
              <form onSubmit={handleSubmit} className="mx-auto max-w-5xl">
                <div className="chat-composer">
                  <button
                    type="button"
                    className="composer-icon-button"
                    title="Thêm tệp"
                  >
                    <Plus size={30} strokeWidth={2.1} />
                  </button>

                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        event.currentTarget.form?.requestSubmit()
                      }
                    }}
                    rows={1}
                    disabled={loading || !activeConversationId}
                    placeholder="Hỏi Erumi"
                    className="composer-input"
                  />

                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={stopStreaming}
                      className="composer-send-button"
                      title="Dừng"
                    >
                      <Square size={20} fill="currentColor" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className="composer-send-button disabled:cursor-not-allowed disabled:opacity-55"
                      title="Gửi"
                    >
                      <Send size={26} strokeWidth={1.7} />
                    </button>
                  )}
                </div>

                <p className="mt-2 text-center text-[11px] text-slate-400">
                  Enter để gửi · Shift + Enter để xuống dòng
                </p>
              </form>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

export default App
