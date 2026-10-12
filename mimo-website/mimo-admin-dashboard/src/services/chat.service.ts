import api from '../api';

export interface ChatMessage {
  id: string;
  channel: string;
  text: string;
  imageUrl: string | null;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  createdAt: string | { _seconds: number };
}

/** One client per portal, each pointed at its own `/<basePath>/chat` endpoint -- the backend
 * resolves the channel from the authenticated identity (department or admin/finance role), so the
 * frontend never passes a channel name itself. */
export const chatServiceFor = (basePath: string) => ({
  messages: () => api.get<{ messages: ChatMessage[] }>(`${basePath}/chat`).then((r) => r.data.messages),
  send: (text: string, image?: File | null) => {
    if (image) {
      const form = new FormData();
      if (text) form.append('text', text);
      form.append('image', image);
      return api.post<{ message: ChatMessage }>(`${basePath}/chat`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data.message);
    }
    return api.post<{ message: ChatMessage }>(`${basePath}/chat`, { text }).then((r) => r.data.message);
  },
});
