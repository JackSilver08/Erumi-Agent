import {
  Activity,
  Archive,
  Bot,
  CheckCircle2,
  Database,
  FileText,
  Globe2,
  History,
  KeyRound,
  Loader2,
  MessageSquarePlus,
  PauseCircle,
  Play,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Upload,
  Workflow,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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

const tools = [
  { icon: Globe2, name: 'Web research', state: 'read-only' },
  { icon: Database, name: 'Knowledge base', state: 'indexed' },
  { icon: FileText, name: 'Files', state: 'workspace' },
  { icon: Workflow, name: 'Agent runs', state: 'approval' },
]

function titleForMessage(content: string) {
  const normalized = content.trim().replace(/\s+/g, ' ')
  return normalized.length > 42 ? `${normalized.slice(0, 42)}…` : normalized
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

  const abortRef = useRef<AbortController | null>(null)
  const initializedRef = useRef(false)

  const canSubmit = input.trim().length > 0 && !isStreaming && !loading

  const stats = useMemo(
    () => [
      { label: 'TTFT target', value: '< 1.5s' },
      { label: 'API p95', value: '< 300ms' },
      { label: 'Tool budget', value: '10-60s' },
      { label: 'Mode', value: isStreaming ? 'Streaming' : 'Ready' },
    ],
    [isStreaming],
  )

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
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load conversation.',
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
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to create a conversation.',
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
        throw new Error('Chat API is unavailable.')
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
            throw new Error(payload.message ?? 'Model generation failed.')
          }

          if (payload.type === 'done') {
            updateMessage(assistantId, answer, 'completed')
          }
        }
      }

      await refreshConversations()
    } catch (requestError) {
      if ((requestError as Error).name !== 'AbortError') {
        updateMessage(
          assistantId,
          requestError instanceof Error
            ? requestError.message
            : 'The model did not respond.',
          'failed',
        )
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'The model did not respond.',
        )
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
    <main className="min-h-screen bg-[#f7f8f4] text-[#18211f]">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-[#d8ddd0] bg-[#eef2e8] xl:block">
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-3 border-b border-[#d8ddd0] px-5 py-4">
              <img
                src="/erumi-chatbot.png"
                alt="Erumi"
                className="h-11 w-11 rounded-md object-cover"
              />
              <div>
                <p className="text-sm font-semibold">Erumi Agent</p>
                <p className="text-xs text-[#65706b]">Erudite Mind</p>
              </div>
            </div>

            <div className="px-4 py-4">
              <button
                type="button"
                onClick={() => void handleNewChat()}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#1f6f64] px-3 text-sm font-semibold text-white shadow-sm hover:bg-[#18574f]"
              >
                <MessageSquarePlus size={17} />
                New chat
              </button>
            </div>

            <div className="px-4">
              <div className="flex h-10 items-center gap-2 rounded-md border border-[#d8ddd0] bg-white px-3 text-sm text-[#65706b]">
                <Search size={16} />
                <span>Search history</span>
              </div>
            </div>

            <nav className="mt-4 flex-1 space-y-1 overflow-y-auto px-3">
              {conversations.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void selectConversation(item.id)}
                  className={`w-full rounded-md px-3 py-2 text-left ${
                    item.id === activeConversationId
                      ? 'bg-white ring-1 ring-[#cfd7ca]'
                      : 'hover:bg-white'
                  }`}
                >
                  <span className="block truncate text-sm font-medium">
                    {item.title}
                  </span>
                  <span className="text-xs text-[#65706b]">
                    {new Date(item.updated_at ?? item.created_at).toLocaleString()}
                  </span>
                </button>
              ))}
            </nav>

            <div className="border-t border-[#d8ddd0] p-3">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-[#65706b] hover:bg-white"
              >
                <Archive size={16} />
                Archived chats
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-[#65706b] hover:bg-white"
              >
                <Settings size={16} />
                Settings
              </button>
            </div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center justify-between border-b border-[#d8ddd0] bg-white px-4 md:px-6">
            <div className="flex items-center gap-3">
              <Bot className="text-[#1f6f64]" size={24} />
              <div>
                <h1 className="text-base font-semibold">Agent Console</h1>
                <p className="text-xs text-[#65706b]">
                  Fast chat, persistent conversations, approval-ready workflow
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="hidden h-9 items-center gap-2 rounded-md border border-[#d8ddd0] bg-white px-3 text-sm hover:bg-[#f7f8f4] md:flex"
                title="Upload file"
              >
                <Upload size={16} />
                Upload
              </button>
              <button
                type="button"
                className="h-9 w-9 rounded-md border border-[#d8ddd0] bg-white text-[#65706b] hover:bg-[#f7f8f4]"
                title="Security"
              >
                <ShieldCheck className="mx-auto" size={17} />
              </button>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex min-h-0 flex-col">
              <div className="grid grid-cols-2 gap-2 border-b border-[#d8ddd0] bg-[#fbfcf9] p-3 md:grid-cols-4">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-md border border-[#d8ddd0] bg-white px-3 py-2"
                  >
                    <p className="text-[11px] uppercase text-[#65706b]">
                      {stat.label}
                    </p>
                    <p className="text-sm font-semibold">{stat.value}</p>
                  </div>
                ))}
              </div>

              {error && (
                <div className="border-b border-[#e5c2c2] bg-[#fff5f5] px-4 py-3 text-sm text-[#7c2d2d] md:px-8">
                  {error}
                </div>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8">
                <div className="mx-auto max-w-4xl space-y-4">
                  {loading ? (
                    <div className="flex items-center justify-center py-16 text-sm text-[#65706b]">
                      <Loader2 className="mr-2 animate-spin" size={16} />
                      Starting Erumi…
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="rounded-md border border-dashed border-[#cfd7ca] bg-white p-8 text-center">
                      <Sparkles
                        className="mx-auto mb-3 text-[#1f6f64]"
                        size={28}
                      />
                      <p className="font-semibold">Start a conversation</p>
                      <p className="mt-1 text-sm text-[#65706b]">
                        Ask Erumi a question and the answer will be saved to this chat.
                      </p>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <article
                        key={message.id}
                        className={`flex gap-3 ${
                          message.role === 'user' ? 'justify-end' : ''
                        }`}
                      >
                        {message.role !== 'user' && (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#dfe9e4] text-[#1f6f64]">
                            {message.role === 'system' ? (
                              <Sparkles size={18} />
                            ) : (
                              <Bot size={18} />
                            )}
                          </div>
                        )}

                        <div
                          className={`max-w-[78ch] rounded-md border px-4 py-3 text-sm leading-6 ${
                            message.role === 'user'
                              ? 'border-[#1f6f64] bg-[#1f6f64] text-white'
                              : message.status === 'failed'
                                ? 'border-[#e5c2c2] bg-[#fff5f5] text-[#7c2d2d]'
                                : 'border-[#d8ddd0] bg-white'
                          }`}
                        >
                          <p className="whitespace-pre-wrap">
                            {message.content ||
                              (message.status === 'streaming'
                                ? 'Thinking…'
                                : '')}
                          </p>

                          {message.status === 'streaming' && (
                            <span className="mt-2 inline-flex items-center gap-2 text-xs text-[#65706b]">
                              <Loader2 className="animate-spin" size={13} />
                              streaming
                            </span>
                          )}
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>

              <form
                onSubmit={handleSubmit}
                className="border-t border-[#d8ddd0] bg-white p-3 md:p-4"
              >
                <div className="mx-auto flex max-w-4xl items-end gap-2 rounded-md border border-[#cfd7ca] bg-[#fbfcf9] p-2">
                  <textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    rows={2}
                    disabled={loading || !activeConversationId}
                    placeholder="Ask Erumi to answer, research, summarize, or prepare an action…"
                    className="min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-[#7b8580]"
                  />

                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={stopStreaming}
                      className="flex h-10 w-10 items-center justify-center rounded-md bg-[#7c2d2d] text-white hover:bg-[#642424]"
                      title="Stop generation"
                    >
                      <Square size={16} />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className="flex h-10 w-10 items-center justify-center rounded-md bg-[#1f6f64] text-white hover:bg-[#18574f] disabled:cursor-not-allowed disabled:bg-[#9aa6a0]"
                      title="Send"
                    >
                      <Send size={16} />
                    </button>
                  )}
                </div>
              </form>
            </div>

            <aside className="hidden border-l border-[#d8ddd0] bg-[#fbfcf9] lg:block">
              <div className="space-y-5 p-4">
                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold">Tool Layer</h2>
                    <span className="rounded-md bg-[#f0d78c] px-2 py-1 text-xs font-medium">
                      foundation
                    </span>
                  </div>
                  <div className="space-y-2">
                    {tools.map((tool) => (
                      <div
                        key={tool.name}
                        className="flex items-center gap-3 rounded-md border border-[#d8ddd0] bg-white px-3 py-3"
                      >
                        <tool.icon className="text-[#1f6f64]" size={18} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {tool.name}
                          </p>
                          <p className="text-xs text-[#65706b]">{tool.state}</p>
                        </div>
                        <CheckCircle2 className="text-[#4f7f38]" size={16} />
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <Activity className="text-[#8a5c13]" size={17} />
                    <h2 className="text-sm font-semibold">Run Events</h2>
                  </div>
                  <ol className="space-y-2">
                    <li className="flex gap-3 rounded-md border border-[#d8ddd0] bg-white px-3 py-3 text-sm">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#eef2e8] text-xs font-semibold text-[#65706b]">
                        1
                      </span>
                      <span>Conversation loaded from PostgreSQL</span>
                    </li>
                    <li className="flex gap-3 rounded-md border border-[#d8ddd0] bg-white px-3 py-3 text-sm">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#eef2e8] text-xs font-semibold text-[#65706b]">
                        2
                      </span>
                      <span>SSE stream opens when generation starts</span>
                    </li>
                    <li className="flex gap-3 rounded-md border border-[#d8ddd0] bg-white px-3 py-3 text-sm">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#eef2e8] text-xs font-semibold text-[#65706b]">
                        3
                      </span>
                      <span>Assistant response is persisted on completion</span>
                    </li>
                  </ol>
                </section>

                <section className="rounded-md border border-[#d8ddd0] bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <KeyRound className="text-[#1f6f64]" size={17} />
                    <h2 className="text-sm font-semibold">Approval Gate</h2>
                  </div>
                  <p className="text-sm leading-6 text-[#65706b]">
                    Side-effect tools will pause in waiting_approval before execution.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled
                      className="flex h-9 flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-md bg-[#cfd7ca] text-sm font-medium text-[#65706b]"
                    >
                      <Play size={15} />
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled
                      className="flex h-9 flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-md border border-[#d8ddd0] bg-white text-sm font-medium text-[#65706b]"
                    >
                      <PauseCircle size={15} />
                      Hold
                    </button>
                  </div>
                </section>

                <section className="rounded-md border border-[#d8ddd0] bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <History className="text-[#1f6f64]" size={17} />
                    <h2 className="text-sm font-semibold">Audit Trail</h2>
                  </div>
                  <p className="text-sm leading-6 text-[#65706b]">
                    Conversation and message records now have a persistent PostgreSQL home.
                  </p>
                </section>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  )
}

export default App
