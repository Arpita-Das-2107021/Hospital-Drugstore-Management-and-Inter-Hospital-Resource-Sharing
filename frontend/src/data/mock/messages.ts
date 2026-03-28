import { Conversation, Message } from '@/types/healthcare';
import { mockUsers } from './users';

export const mockConversations: Conversation[] = [
  { id: '1', participants: [mockUsers[0], mockUsers[2]], caseTag: 'CASE-2024-0892', lastMessage: 'The patient transfer is confirmed for tomorrow morning', lastMessageAt: '2024-12-28T10:15:00', unreadCount: 2 },
  { id: '2', participants: [mockUsers[1], mockUsers[3]], caseTag: 'SUPPLY-2024-1204', lastMessage: 'Shipment tracking number has been updated', lastMessageAt: '2024-12-28T09:30:00', unreadCount: 0 },
  { id: '3', participants: [mockUsers[0], mockUsers[4]], lastMessage: 'Compliance report submitted successfully', lastMessageAt: '2024-12-27T16:45:00', unreadCount: 1 },
];

export const mockMessages: Message[] = [
  { id: '1', conversationId: '1', sender: mockUsers[2], content: 'Dr. Chen, we need to discuss the kidney transplant case urgently.', createdAt: '2024-12-28T09:00:00' },
  { id: '2', conversationId: '1', sender: mockUsers[0], content: 'Yes, I\'ve reviewed the compatibility results. The patient is a strong match.', createdAt: '2024-12-28T09:15:00' },
  { id: '3', conversationId: '1', sender: mockUsers[2], content: 'Excellent. Can we coordinate the transfer for tomorrow?', createdAt: '2024-12-28T09:45:00' },
  { id: '4', conversationId: '1', sender: mockUsers[0], content: 'The patient transfer is confirmed for tomorrow morning', createdAt: '2024-12-28T10:15:00' },
];