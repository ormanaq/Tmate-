import { users, sessions, logs, type User, type InsertUser, type Session, type InsertSession, type Log, type InsertLog } from "@shared/schema";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Session management
  createSession(session: InsertSession): Promise<Session>;
  getSession(id: number): Promise<Session | undefined>;
  getSessionBySessionId(sessionId: string): Promise<Session | undefined>;
  getAllSessions(): Promise<Session[]>;
  getActiveSessions(): Promise<Session[]>;
  updateSession(id: number, updates: Partial<Session>): Promise<Session | undefined>;
  deleteSession(id: number): Promise<boolean>;
  
  // Log management
  addLog(log: InsertLog): Promise<Log>;
  getSessionLogs(sessionId: string): Promise<Log[]>;
  getRecentLogs(limit?: number): Promise<Log[]>;
  clearLogs(sessionId?: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private sessions: Map<number, Session>;
  private logs: Map<number, Log>;
  private currentUserId: number;
  private currentSessionId: number;
  private currentLogId: number;

  constructor() {
    this.users = new Map();
    this.sessions = new Map();
    this.logs = new Map();
    this.currentUserId = 1;
    this.currentSessionId = 1;
    this.currentLogId = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createSession(insertSession: InsertSession): Promise<Session> {
    const id = this.currentSessionId++;
    const session: Session = {
      ...insertSession,
      id,
      startTime: new Date(),
      endTime: null,
    };
    this.sessions.set(id, session);
    return session;
  }

  async getSession(id: number): Promise<Session | undefined> {
    return this.sessions.get(id);
  }

  async getSessionBySessionId(sessionId: string): Promise<Session | undefined> {
    return Array.from(this.sessions.values()).find(
      (session) => session.sessionId === sessionId,
    );
  }

  async getAllSessions(): Promise<Session[]> {
    return Array.from(this.sessions.values()).sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
  }

  async getActiveSessions(): Promise<Session[]> {
    return Array.from(this.sessions.values())
      .filter((session) => session.status === "running")
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }

  async updateSession(id: number, updates: Partial<Session>): Promise<Session | undefined> {
    const session = this.sessions.get(id);
    if (!session) return undefined;

    const updatedSession = { ...session, ...updates };
    this.sessions.set(id, updatedSession);
    return updatedSession;
  }

  async deleteSession(id: number): Promise<boolean> {
    return this.sessions.delete(id);
  }

  async addLog(insertLog: InsertLog): Promise<Log> {
    const id = this.currentLogId++;
    const log: Log = {
      ...insertLog,
      id,
      timestamp: new Date(),
    };
    this.logs.set(id, log);
    return log;
  }

  async getSessionLogs(sessionId: string): Promise<Log[]> {
    return Array.from(this.logs.values())
      .filter((log) => log.sessionId === sessionId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  async getRecentLogs(limit: number = 100): Promise<Log[]> {
    return Array.from(this.logs.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  async clearLogs(sessionId?: string): Promise<void> {
    if (sessionId) {
      for (const [id, log] of this.logs.entries()) {
        if (log.sessionId === sessionId) {
          this.logs.delete(id);
        }
      }
    } else {
      this.logs.clear();
    }
  }
}

export const storage = new MemStorage();
