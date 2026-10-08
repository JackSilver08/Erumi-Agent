import {
  Archive,
  Bot,
  Loader2,
  Menu,
  MessageCircle,
  MessageSquarePlus,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  Square,
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
  return normalized.length > 42 ? `${normalized.slice(0, 42)}…` : normalized
}

const starterPrompts = [
  'Explain a difficult concept in simple terms',
  'Research something on the web for me',
  'Help me plan and complete a task',
]

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
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const initializedRef = useRef(false)

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
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load this conversation.',
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
            : 'Unable to start Erumi.',
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
      setError(null)
      setMobileSidebarOpen(false)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to create a new chat.',
      )
    }
  }

  function usePrompt(prompt: string) {
    setInput(prompt)
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
        throw new Error('Erumi could not connect to the chat service.')
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
            throw new Error(payload.message ?? 'Erumi could not generate a response.')
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
            : 'The model did not respond.'

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

  return (
    <main className="min-h-screen bg-[#07101f] text-white">
      <div className="flex min-h-screen overflow-hidden">
        <div
          className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity lg:hidden ${
            mobileSidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />

        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-[290px] flex-col border-r border-white/8 bg-[#091426] transition-transform duration-200 lg:static lg:translate-x-0 ${
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex h-16 items-center justify-between border-b border-white/8 px-4">
            <div className="flex min-w-0 items-center gap-3">
              <img
                src="/erumi-chatbot.png"
                alt="Erumi"
                className="h-9 w-9 rounded-xl border border-white/10 object-cover shadow-[0_0_24px_rgba(45,128,255,0.16)]"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-tight">Erumi</p>
                <p className="text-[11px] text-slate-400">Erudite Mind</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-white/6 hover:text-white lg:hidden"
              aria-label="Close sidebar"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-4">
            <button
              type="button"
              onClick={() => void handleNewChat()}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2583ff] px-4 text-sm font-semibold text-white shadow-[0_8px_26px_rgba(37,131,255,0.22)] transition hover:bg-[#3a91ff]"
            >
              <MessageSquarePlus size={17} />
              New chat
            </button>
          </div>

          <div className="px-4">
            <div className="flex h-10 items-center gap-2 rounded-xl border border-white/8 bg-white/[0.035] px-3 text-sm text-slate-400">
              <Search size={16} />
              <span>Search chats</span>
            </div>
          </div>

          <div className="px-4 pb-2 pt-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Recent
            </p>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            <div className="space-y-1">
              {conversations.map((item) => {
                const active = item.id === activeConversationId

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void selectConversation(item.id)}
                    className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                      active
                        ? 'bg-white/[0.08] text-white ring-1 ring-white/8'
                        : 'text-slate-300 hover:bg-white/[0.04] hover:text-white'
                    }`}
                  >
                    <MessageCircle
                      size={16}
                      className={active ? 'text-[#55a2ff]' : 'text-slate-500'}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {item.title}
                    </span>
                  </button>
                )
              })}
            </div>
          </nav>

          <div className="border-t border-white/8 p-3">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
            >
              <Archive size={16} />
              Archived chats
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
            >
              <Settings size={16} />
              Settings
            </button>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-[#07101f]">
          <header className="flex h-16 items-center justify-between border-b border-white/8 px-4 md:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="rounded-lg p-2 text-slate-300 transition hover:bg-white/[0.05] hover:text-white lg:hidden"
                aria-label="Open sidebar"
              >
                <Menu size={19} />
              </button>

              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#45d483] opacity-30" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#45d483]" />
                </span>
                <span className="text-sm font-medium text-slate-200">Erumi</span>
                <span className="hidden text-xs text-slate-500 sm:inline">
                  Your AI workspace
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleNewChat()}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-slate-200 transition hover:bg-white/[0.07]"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">New chat</span>
            </button>
          </header>

          {error && (
            <div className="border-b border-red-400/15 bg-red-500/[0.07] px-4 py-3 text-sm text-red-200 md:px-8">
              {error}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
            <div className="mx-auto flex min-h-full max-w-3xl flex-col">
              {loading ? (
                <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
                  <Loader2 className="mr-2 animate-spin" size={17} />
                  Starting Erumi…
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#2583ff]/20 bg-[#2583ff]/10 shadow-[0_0_48px_rgba(37,131,255,0.12)]">
                    <Sparkles className="text-[#55a2ff]" size={28} />
                  </div>

                  <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
                    What can I help you with?
                  </h1>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400 md:text-base">
                    Ask a question, research a topic, work through a problem, or describe
                    something you want done.
                  </p>

                  <div className="mt-8 grid w-full gap-3 sm:grid-cols-3">
                    {starterPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => usePrompt(prompt)}
                        className="rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-4 text-left text-sm leading-5 text-slate-300 transition hover:-translate-y-0.5 hover:border-[#2583ff]/40 hover:bg-[#2583ff]/[0.07] hover:text-white"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-7 pb-8">
                  {messages.map((message) => (
                    <article
                      key={message.id}
                      className={`flex gap-3 ${
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {message.role !== 'user' && (
                        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#2583ff]/10 text-[#55a2ff]">
                          <Bot size={17} />
                        </div>
                      )}

                      <div
                        className={`max-w-[min(760px,86%)] rounded-2xl px-4 py-3.5 text-sm leading-7 ${
                          message.role === 'user'
                            ? 'bg-[#2583ff] text-white shadow-[0_8px_28px_rgba(37,131,255,0.16)]'
                            : message.status === 'failed'
                              ? 'border border-red-400/15 bg-red-500/[0.07] text-red-100'
                              : 'text-slate-200'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{message.content}</p>

                        {message.status === 'streaming' && (
                          <span className="mt-2 inline-flex items-center gap-2 text-xs text-slate-500">
                            <Loader2 className="animate-spin" size={12} />
                            Thinking
                          </span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="px-4 pb-4 pt-2 md:px-8 md:pb-6">
            <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
              <div className="rounded-2xl border border-white/10 bg-[#0b1628] p-2 shadow-[0_20px_50px_rgba(0,0,0,0.22)] focus-within:border-[#2583ff]/45 focus-within:shadow-[0_0_0_4px_rgba(37,131,255,0.08)]">
                <div className="flex items-end gap-2">
                  <textarea
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
                    placeholder="Message Erumi…"
                    className="max-h-40 min-h-12 flex-1 resize-none bg-transparent px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500"
                  />

                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={stopStreaming}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/15"
                      title="Stop generation"
                    >
                      <Square size={15} />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#2583ff] text-white transition hover:bg-[#3a91ff] disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
                      title="Send"
                    >
                      <Send size={16} />
                    </button>
                  )}
                </div>
              </div>

              <p className="mt-2 text-center text-[11px] text-slate-600">
                Erumi can make mistakes. Check important information.
              </p>
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}

export default App
