import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_API_URL!, {
      auth: { token: getAccessToken() },
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });
  }
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  // Refresh auth token before (re)connecting
  s.auth = { token: getAccessToken() };
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket(): void {
  if (socket?.connected) socket.disconnect();
}
