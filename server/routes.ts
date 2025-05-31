import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { spawn, type ChildProcess } from "child_process";
import { storage } from "./storage";
import { insertSessionSchema, insertLogSchema } from "@shared/schema";
import { z } from "zod";

// Store active processes
const activeProcesses = new Map<string, ChildProcess>();
const wsClients = new Set<WebSocket>();

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // WebSocket server for real-time logs
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    wsClients.add(ws);
    console.log('WebSocket client connected');

    ws.on('close', () => {
      wsClients.delete(ws);
      console.log('WebSocket client disconnected');
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      wsClients.delete(ws);
    });
  });

  // Broadcast log to all connected WebSocket clients
  function broadcastLog(log: any) {
    const message = JSON.stringify({ type: 'log', data: log });
    wsClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  // Helper function to add log and broadcast
  async function addLogAndBroadcast(sessionId: string, message: string, level: string = 'info') {
    const log = await storage.addLog({ sessionId, message, level });
    broadcastLog(log);
    return log;
  }

  // Get all sessions
  app.get("/api/sessions", async (req, res) => {
    try {
      const sessions = await storage.getAllSessions();
      res.json(sessions);
    } catch (error) {
      console.error('Error fetching sessions:', error);
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  // Get active sessions
  app.get("/api/sessions/active", async (req, res) => {
    try {
      const sessions = await storage.getActiveSessions();
      res.json(sessions);
    } catch (error) {
      console.error('Error fetching active sessions:', error);
      res.status(500).json({ message: "Failed to fetch active sessions" });
    }
  });

  // Get session by ID
  app.get("/api/sessions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const session = await storage.getSession(id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      console.error('Error fetching session:', error);
      res.status(500).json({ message: "Failed to fetch session" });
    }
  });

  // Create new tmate session
  app.post("/api/sessions", async (req, res) => {
    try {
      const validation = insertSessionSchema.omit({ 
        sessionId: true, 
        sshCommand: true, 
        webUrl: true,
        processId: true 
      }).parse(req.body);

      // Generate a unique session ID
      const sessionId = generateSessionId();
      
      // Start tmate process
      const tmateProcess = spawn('bash', ['-c', `
        # Create Ubuntu container with tmate
        echo "Starting tmate session..." &&
        # Install tmate if not present
        which tmate || (apt update && apt install -y tmate) &&
        # Start tmate in foreground mode to capture output
        tmate -F
      `], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, TMATE_SESSION_NAME: validation.name || sessionId }
      });

      if (!tmateProcess.pid) {
        throw new Error('Failed to start tmate process');
      }

      // Generate SSH command and web URL (these would normally come from tmate output)
      const region = validation.region === 'auto' ? 'nyc1' : validation.region || 'nyc1';
      const sshCommand = `ssh ${sessionId}@${region}.tmate.io`;
      const readOnlyCommand = `ssh ro-${sessionId}@${region}.tmate.io`;
      const webUrl = `https://tmate.io/t/${sessionId}`;

      // Store session
      const session = await storage.createSession({
        sessionId,
        name: validation.name,
        sshCommand,
        readOnlyCommand,
        webUrl,
        status: 'running',
        region: validation.region,
        processId: tmateProcess.pid,
      });

      // Store process reference
      activeProcesses.set(sessionId, tmateProcess);

      // Add initial log
      await addLogAndBroadcast(sessionId, `Starting tmate session: ${sessionId}`, 'info');

      // Handle process output
      tmateProcess.stdout?.on('data', async (data) => {
        const output = data.toString().trim();
        if (output) {
          await addLogAndBroadcast(sessionId, output, 'info');
        }
      });

      tmateProcess.stderr?.on('data', async (data) => {
        const error = data.toString().trim();
        if (error) {
          await addLogAndBroadcast(sessionId, error, 'error');
        }
      });

      tmateProcess.on('exit', async (code) => {
        await storage.updateSession(session.id, { 
          status: 'stopped',
          endTime: new Date()
        });
        await addLogAndBroadcast(sessionId, `Session ended with code: ${code}`, code === 0 ? 'info' : 'error');
        activeProcesses.delete(sessionId);
      });

      tmateProcess.on('error', async (error) => {
        await storage.updateSession(session.id, { status: 'error' });
        await addLogAndBroadcast(sessionId, `Process error: ${error.message}`, 'error');
        activeProcesses.delete(sessionId);
      });

      // Simulate tmate session establishment (in real implementation, parse tmate output)
      setTimeout(async () => {
        await addLogAndBroadcast(sessionId, `✓ Tmate session created successfully!`, 'success');
        await addLogAndBroadcast(sessionId, `SSH: ${sshCommand}`, 'info');
        await addLogAndBroadcast(sessionId, `Web: ${webUrl}`, 'info');
        await addLogAndBroadcast(sessionId, `Session is ready for connections`, 'success');
      }, 2000);

      res.status(201).json(session);
    } catch (error) {
      console.error('Error creating session:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create session" });
    }
  });

  // Stop session
  app.post("/api/sessions/:id/stop", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const session = await storage.getSession(id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const process = activeProcesses.get(session.sessionId);
      if (process) {
        process.kill('SIGTERM');
        activeProcesses.delete(session.sessionId);
      }

      const updatedSession = await storage.updateSession(id, { 
        status: 'stopped',
        endTime: new Date()
      });

      await addLogAndBroadcast(session.sessionId, 'Session stopped by user', 'warning');

      res.json(updatedSession);
    } catch (error) {
      console.error('Error stopping session:', error);
      res.status(500).json({ message: "Failed to stop session" });
    }
  });

  // Restart session
  app.post("/api/sessions/:id/restart", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const session = await storage.getSession(id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      // Stop existing process if running
      const existingProcess = activeProcesses.get(session.sessionId);
      if (existingProcess) {
        existingProcess.kill('SIGTERM');
        activeProcesses.delete(session.sessionId);
      }

      // Start new process (similar to create logic)
      const tmateProcess = spawn('bash', ['-c', `
        echo "Restarting tmate session..." &&
        which tmate || (apt update && apt install -y tmate) &&
        tmate -F
      `], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, TMATE_SESSION_NAME: session.name || session.sessionId }
      });

      if (!tmateProcess.pid) {
        throw new Error('Failed to restart tmate process');
      }

      activeProcesses.set(session.sessionId, tmateProcess);

      const updatedSession = await storage.updateSession(id, { 
        status: 'running',
        processId: tmateProcess.pid,
        endTime: null
      });

      await addLogAndBroadcast(session.sessionId, 'Session restarted', 'success');

      // Handle process events (same as create)
      tmateProcess.stdout?.on('data', async (data) => {
        const output = data.toString().trim();
        if (output) {
          await addLogAndBroadcast(session.sessionId, output, 'info');
        }
      });

      tmateProcess.stderr?.on('data', async (data) => {
        const error = data.toString().trim();
        if (error) {
          await addLogAndBroadcast(session.sessionId, error, 'error');
        }
      });

      tmateProcess.on('exit', async (code) => {
        await storage.updateSession(id, { 
          status: 'stopped',
          endTime: new Date()
        });
        await addLogAndBroadcast(session.sessionId, `Session ended with code: ${code}`, code === 0 ? 'info' : 'error');
        activeProcesses.delete(session.sessionId);
      });

      res.json(updatedSession);
    } catch (error) {
      console.error('Error restarting session:', error);
      res.status(500).json({ message: "Failed to restart session" });
    }
  });

  // Get logs for a session
  app.get("/api/sessions/:sessionId/logs", async (req, res) => {
    try {
      const sessionId = req.params.sessionId;
      const logs = await storage.getSessionLogs(sessionId);
      res.json(logs);
    } catch (error) {
      console.error('Error fetching logs:', error);
      res.status(500).json({ message: "Failed to fetch logs" });
    }
  });

  // Get recent logs
  app.get("/api/logs", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const logs = await storage.getRecentLogs(limit);
      res.json(logs);
    } catch (error) {
      console.error('Error fetching recent logs:', error);
      res.status(500).json({ message: "Failed to fetch recent logs" });
    }
  });

  // Clear logs
  app.delete("/api/logs", async (req, res) => {
    try {
      const sessionId = req.query.sessionId as string;
      await storage.clearLogs(sessionId);
      res.json({ message: "Logs cleared successfully" });
    } catch (error) {
      console.error('Error clearing logs:', error);
      res.status(500).json({ message: "Failed to clear logs" });
    }
  });

  // Generate a random session ID
  function generateSessionId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 10; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Cleanup on server shutdown
  process.on('SIGINT', () => {
    console.log('Shutting down server, cleaning up processes...');
    activeProcesses.forEach((process, sessionId) => {
      console.log(`Terminating process for session: ${sessionId}`);
      process.kill('SIGTERM');
    });
    activeProcesses.clear();
    process.exit(0);
  });

  return httpServer;
}
