import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIChatPanel } from './ai-chat-panel';
import type { ChatMessage } from '@/lib/ai-chat-helpers';

const mocks = vi.hoisted(() => ({
  useChat: vi.fn(),
  useAISettings: vi.fn(),
  useConnections: vi.fn(),
  respondToPermission: vi.fn(),
  sendMessage: vi.fn(),
  stop: vi.fn(),
  navigateTo: vi.fn(),
  openQueryTabWithSql: vi.fn(),
  clearPendingAiPrompt: vi.fn(),
}));

vi.mock('@/hooks/use-chat', () => ({ useChat: mocks.useChat }));
vi.mock('@/hooks/use-ai-chat', () => ({ useAISettings: mocks.useAISettings }));
vi.mock('@/hooks/use-connections', () => ({ useConnections: mocks.useConnections }));
vi.mock('@/store', () => ({
  appStore: { state: { activeMongoDatabase: null, pendingAiPrompt: null } },
  navigateTo: mocks.navigateTo,
  openQueryTabWithSql: mocks.openQueryTabWithSql,
  clearPendingAiPrompt: mocks.clearPendingAiPrompt,
}));
vi.mock('@tanstack/react-store', () => ({ useStore: () => null }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined }),
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/lib/api', () => ({
  api: { clearChatHistory: vi.fn(), clearSchemaCache: vi.fn(), getChatHistory: vi.fn() },
}));

function chatState(messages: ChatMessage[], isLoading: boolean) {
  return {
    messages,
    isLoading,
    sendMessage: mocks.sendMessage,
    stop: mocks.stop,
    setMessages: vi.fn(),
    reset: vi.fn(),
    resendFrom: vi.fn(),
    respondToPermission: mocks.respondToPermission,
  };
}

beforeEach(() => {
  mocks.useChat.mockReset();
  mocks.useAISettings.mockReturnValue({ data: { activeChatAgent: 'codex', activeProvider: 'openai' } });
  mocks.useConnections.mockReturnValue({ data: [] });
});

describe('AIChatPanel ACP rendering', () => {
  it('renders the selected ACP agent as the header badge', () => {
    mocks.useChat.mockReturnValue(chatState([], false));
    const html = renderToStaticMarkup(<AIChatPanel connectionId={null} />);
    expect(html).toContain('Codex');
  });

  it('renders tool activity, notices, and a permission prompt while streaming', () => {
    const assistant: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      parts: [{ type: 'text', content: '' }],
      createdAt: new Date(),
      tools: [{ id: 't1', title: 'Run query', status: 'in_progress' }],
      notices: ['Working from schema text only.'],
      permission: {
        id: 'p1',
        title: 'Allow tool run?',
        options: [
          { id: 'allow', name: 'Allow' },
          { id: 'deny', name: 'Deny' },
        ],
      },
    };
    mocks.useChat.mockReturnValue(chatState([assistant], true));

    const html = renderToStaticMarkup(<AIChatPanel connectionId={null} />);
    expect(html).toContain('Run query');
    expect(html).toContain('Working from schema text only.');
    expect(html).toContain('Allow tool run?');
    expect(html).toContain('Allow');
    expect(html).toContain('Deny');
    expect(html).toContain('Waiting for approval...');
  });

  it('shows the resolved permission choice and hides pending buttons', () => {
    const assistant: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      parts: [{ type: 'text', content: 'done' }],
      createdAt: new Date(),
      permission: {
        id: 'p1',
        title: 'Allow tool run?',
        options: [
          { id: 'allow', name: 'Allow' },
          { id: 'deny', name: 'Deny' },
        ],
        resolvedOptionId: 'allow',
      },
    };
    mocks.useChat.mockReturnValue(chatState([assistant], false));

    const html = renderToStaticMarkup(<AIChatPanel connectionId={null} />);
    expect(html).toContain('Choice sent to the agent.');
    expect(html).not.toContain('Waiting for approval...');
  });

  it('shows the thinking state before any ACP annotation arrives', () => {
    const assistant: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      parts: [{ type: 'text', content: '' }],
      createdAt: new Date(),
    };
    mocks.useChat.mockReturnValue(chatState([assistant], true));
    const html = renderToStaticMarkup(<AIChatPanel connectionId={null} />);
    expect(html).toContain('Thinking...');
  });
});
