export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export type ApiMessage = {
  id: string
  role: ChatRole
  content: string
  status: string
  model_id?: string | null
  created_at: string
  completed_at?: string | null
}

export type Conversation = {
  id: string
  title: string
  status: string
  created_at: string
  updated_at?: string | null
}

export type ConversationDetail = Conversation & {
  messages: ApiMessage[]
}

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || `Request failed with ${response.status}`)
  }

  return response.json() as Promise<T>
}

export function listConversations(): Promise<Conversation[]> {
  return request<Conversation[]>('/api/v1/chats')
}

export function getConversation(id: string): Promise<ConversationDetail> {
  return request<ConversationDetail>(`/api/v1/chats/${id}`)
}

export function createConversation(title = 'New chat'): Promise<ConversationDetail> {
  return request<ConversationDetail>('/api/v1/chats', {
    method: 'POST',
    body: JSON.stringify({ title }),
  })
}
