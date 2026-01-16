import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;
let currentSegment: string = "remote";

export function setSegment(segment: string) {
  currentSegment = segment;
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      autoConnect: false,
      transports: ["websocket", "polling"],
      query: {
        segment: currentSegment,
      },
    });
  }
  return socket;
}

export function connectSocket(segment?: string): Socket {
  if (segment) {
    currentSegment = segment;
  }
  
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  
  socket = io({
    autoConnect: false,
    transports: ["websocket", "polling"],
    query: {
      segment: currentSegment,
    },
  });
  
  socket.connect();
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
