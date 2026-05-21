import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import type { AdminNotification } from '@prisma/client';
import { authenticateAdminSocket } from './socket-auth';

let io: Server | null = null;

export function initSocketServer(httpServer: HttpServer): Server {
  if (io) return io;

  const corsOrigin = process.env.CORS_ORIGIN || '*';
  io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      credentials: true,
    },
    path: '/socket.io',
  });

  io.use(authenticateAdminSocket);

  io.on('connection', (socket) => {
    const empresaId = socket.data.empresaId as number | undefined;
    if (empresaId != null) {
      socket.join(roomForEmpresa(empresaId));
    }
  });

  return io;
}

export function getSocketServer(): Server | null {
  return io;
}

export function roomForEmpresa(empresaId: number): string {
  return `empresa:${empresaId}`;
}

export function emitAdminNotification(notification: AdminNotification): void {
  const server = getSocketServer();
  if (!server) return;
  server
    .to(roomForEmpresa(notification.empresaId))
    .emit('admin.notification.created', notification);
}
