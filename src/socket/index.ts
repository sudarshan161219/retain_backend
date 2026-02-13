import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";

let io: Server | null = null;

export const initSocket = (httpServer: HttpServer) => {
  console.log("🔌 SOCKET.IO INITIALIZING...");

  io = new Server(httpServer, {
    cors: {
      origin: [
        "http://localhost:5173",
        "http://127.0.0.1:5173", // Add this
        process.env.FRONTEND_URL as string,
      ].filter(Boolean),
      credentials: true,
      methods: ["GET", "POST"],
    },
    transports: ["polling", "websocket"],
  });

  io.on("connection", (socket: Socket) => {
    console.log(`✅ User connected: ${socket.id}`);

    socket.onAny((eventName, ...args) => {
      console.log(`🕵️ SERVER RECEIVED: [${eventName}]`, args);
    });

    socket.on("join-room", (data: string) => {
      const roomId = data;

      if (roomId) {
        socket.join(roomId);
        console.log(`✅ User ${socket.id} joined room: ${roomId}`);
      } else {
        console.error(
          "⚠️ Client sent join-project but missing projectId:",
          data
        );
      }
    });
    // 👆 WITHOUT THIS, MESSAGES GO NOWHERE 👆

    socket.on("disconnect", () => {
      console.log(`❌ User disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};
