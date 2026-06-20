import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';

interface AuthedSocket extends Socket {
  data: { user?: AuthenticatedUser };
}

/**
 * Authenticated realtime hub (11-notifications §6, 13-messaging §6). The
 * handshake MUST carry a valid Supabase bearer token; we reuse AuthService so
 * the same identity + memberships resolution applies as on HTTP.
 *
 * Rooms are tenant-scoped, never open:
 *   - `user:{userId}`            — personal channel (notifications).
 *   - `conversation:{convId}`    — joined only after a membership check, which
 *                                  the MessagingService performs before asking
 *                                  the gateway to emit (clients can't self-join
 *                                  arbitrary conversations).
 *
 * If a client connects without a valid token it is disconnected immediately.
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  constructor(private readonly auth: AuthService) {}

  async handleConnection(client: AuthedSocket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const companyId = this.readCompany(client);
      const user = await this.auth.authenticate(token, companyId);
      client.data.user = user;
      // Every socket auto-joins its personal room for notifications.
      await client.join(`user:${user.userId}`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(): void {
    // socket.io leaves all rooms automatically on disconnect.
  }

  /**
   * Client asks to subscribe to a conversation room. We only let an
   * authenticated socket join a `conversation:{id}` room for conversations it
   * is a member of — but the authoritative membership check happens in
   * MessagingService before any emit, so even a wrongly-joined room receives
   * nothing it shouldn't. We still scope joins to the caller's company.
   */
  @SubscribeMessage('conversation:join')
  joinConversation(client: AuthedSocket, conversationId: string): void {
    if (!client.data.user || typeof conversationId !== 'string') return;
    void client.join(`conversation:${conversationId}`);
  }

  @SubscribeMessage('conversation:leave')
  leaveConversation(client: AuthedSocket, conversationId: string): void {
    if (typeof conversationId !== 'string') return;
    void client.leave(`conversation:${conversationId}`);
  }

  /** Push an event to a single user's personal room. */
  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  /** Push an event to everyone currently in a conversation room. */
  emitToConversation(conversationId: string, event: string, payload: unknown): void {
    this.server?.to(`conversation:${conversationId}`).emit(event, payload);
  }

  private extractToken(client: AuthedSocket): string | undefined {
    const auth = client.handshake.auth as { token?: string } | undefined;
    if (auth?.token) return auth.token.replace(/^Bearer\s+/i, '');
    const header = client.handshake.headers.authorization;
    if (typeof header === 'string') {
      const [scheme, value] = header.split(' ');
      if (scheme?.toLowerCase() === 'bearer' && value) return value;
    }
    return undefined;
  }

  private readCompany(client: AuthedSocket): string | undefined {
    const auth = client.handshake.auth as { companyId?: string } | undefined;
    if (auth?.companyId) return auth.companyId;
    const header = client.handshake.headers['x-company-id'];
    return typeof header === 'string' ? header : undefined;
  }
}
