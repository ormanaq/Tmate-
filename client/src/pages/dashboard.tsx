import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { 
  Play, 
  Square, 
  RotateCcw, 
  Copy, 
  ExternalLink, 
  Trash2, 
  Plus,
  Terminal,
  Server,
  Clock,
  Users,
  Activity,
  Home,
  History,
  Settings,
  List,
  Menu
} from "lucide-react";
import { copyToClipboard, formatTimestamp, formatDuration, cn } from "@/lib/utils";
import type { Session, Log } from "@shared/schema";

interface WebSocketMessage {
  type: 'log';
  data: Log;
}

export default function Dashboard() {
  const [selectedTab, setSelectedTab] = useState<'dashboard' | 'sessions' | 'history' | 'settings'>('dashboard');
  const [isNewSessionDialogOpen, setIsNewSessionDialogOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [logs, setLogs] = useState<Log[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch active sessions
  const { data: activeSessions = [], isLoading: loadingSessions } = useQuery<Session[]>({
    queryKey: ['/api/sessions/active'],
    refetchInterval: 5000,
  });

  // Fetch all sessions for history
  const { data: allSessions = [] } = useQuery<Session[]>({
    queryKey: ['/api/sessions'],
    refetchInterval: selectedTab === 'sessions' ? 5000 : false,
  });

  // Fetch recent logs
  const { data: recentLogs = [] } = useQuery<Log[]>({
    queryKey: ['/api/logs'],
    refetchInterval: 10000,
  });

  // Initialize logs with recent logs and merge with WebSocket updates
  useEffect(() => {
    if (recentLogs.length > 0) {
      setLogs(prev => {
        const existingIds = new Set(prev.map(log => log.id));
        const newLogs = recentLogs.filter((log) => !existingIds.has(log.id));
        return [...prev, ...newLogs].slice(-100); // Keep last 100 logs
      });
    }
  }, [recentLogs]);

  // WebSocket connection for real-time logs
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        if (message.type === 'log') {
          setLogs(prev => [...prev, message.data].slice(-100)); // Keep last 100 logs
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setWsConnected(false);
      // Attempt to reconnect after 3 seconds
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.CLOSED) {
          // Reconnect logic would go here
        }
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setWsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: async (data: { name?: string; region?: string }) => {
      const response = await apiRequest('POST', '/api/sessions', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions/active'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      setIsNewSessionDialogOpen(false);
      toast({
        title: "Session Created",
        description: "New tmate session is starting up...",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create session",
        variant: "destructive",
      });
    },
  });

  // Stop session mutation
  const stopSessionMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      const response = await apiRequest('POST', `/api/sessions/${sessionId}/stop`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions/active'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      toast({
        title: "Session Stopped",
        description: "Session has been terminated",
        variant: "success",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to stop session",
        variant: "destructive",
      });
    },
  });

  // Restart session mutation
  const restartSessionMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      const response = await apiRequest('POST', `/api/sessions/${sessionId}/restart`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions/active'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      toast({
        title: "Session Restarted",
        description: "Session is restarting...",
        variant: "success",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to restart session",
        variant: "destructive",
      });
    },
  });

  // Clear logs mutation
  const clearLogsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', '/api/logs');
      return response.json();
    },
    onSuccess: () => {
      setLogs([]);
      toast({
        title: "Logs Cleared",
        description: "All logs have been cleared",
        variant: "success",
      });
    },
  });

  const handleCopy = async (text: string, label: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      toast({
        title: "Copied!",
        description: `${label} copied to clipboard`,
        variant: "success",
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const handleCreateSession = (data: { name: string; region: string }) => {
    createSessionMutation.mutate({
      name: data.name || undefined,
      region: data.region,
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-green-500';
      case 'stopped': return 'bg-red-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-yellow-500';
    }
  };

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'success': return 'text-green-400';
      case 'error': return 'text-red-400';
      case 'warning': return 'text-yellow-400';
      case 'info': return 'text-blue-400';
      case 'debug': return 'text-gray-400';
      default: return 'text-gray-300';
    }
  };

  const handleCopyLog = async (logMessage: string) => {
    const success = await copyToClipboard(logMessage);
    if (success) {
      toast({
        title: "Copied!",
        description: "Log message copied to clipboard",
        variant: "success",
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const SidebarContent = () => (
    <>
      <div className="p-6 border-b border-github-border">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Terminal className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Tmate Manager</h1>
            <p className="text-xs text-github-text-secondary">Session Controller</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4">
        <div className="space-y-2">
          <button
            onClick={() => {
              setSelectedTab('dashboard');
              setIsMobileSidebarOpen(false);
            }}
            className={cn(
              "flex items-center space-x-3 px-3 py-2 rounded-lg w-full text-left transition-colors",
              selectedTab === 'dashboard' 
                ? "bg-github-bg-tertiary text-github-text" 
                : "text-github-text-secondary hover:bg-github-bg-tertiary hover:text-github-text"
            )}
          >
            <Home className="h-4 w-4" />
            <span className="text-sm font-medium">Dashboard</span>
          </button>
          <button
            onClick={() => {
              setSelectedTab('sessions');
              setIsMobileSidebarOpen(false);
            }}
            className={cn(
              "flex items-center space-x-3 px-3 py-2 rounded-lg w-full text-left transition-colors",
              selectedTab === 'sessions' 
                ? "bg-github-bg-tertiary text-github-text" 
                : "text-github-text-secondary hover:bg-github-bg-tertiary hover:text-github-text"
            )}
          >
            <List className="h-4 w-4" />
            <span className="text-sm font-medium">Active Sessions</span>
            {activeSessions.length > 0 && (
              <span className="ml-auto bg-green-600 text-xs px-2 py-0.5 rounded-full">
                {activeSessions.length}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setSelectedTab('history');
              setIsMobileSidebarOpen(false);
            }}
            className={cn(
              "flex items-center space-x-3 px-3 py-2 rounded-lg w-full text-left transition-colors",
              selectedTab === 'history' 
                ? "bg-github-bg-tertiary text-github-text" 
                : "text-github-text-secondary hover:bg-github-bg-tertiary hover:text-github-text"
            )}
          >
            <History className="h-4 w-4" />
            <span className="text-sm font-medium">Session History</span>
          </button>
          <button
            onClick={() => {
              setSelectedTab('settings');
              setIsMobileSidebarOpen(false);
            }}
            className={cn(
              "flex items-center space-x-3 px-3 py-2 rounded-lg w-full text-left transition-colors",
              selectedTab === 'settings' 
                ? "bg-github-bg-tertiary text-github-text" 
                : "text-github-text-secondary hover:bg-github-bg-tertiary hover:text-github-text"
            )}
          >
            <Settings className="h-4 w-4" />
            <span className="text-sm font-medium">Settings</span>
          </button>
        </div>
      </nav>

      <div className="p-4 border-t border-github-border">
        <div className="flex items-center space-x-2 text-xs text-github-text-secondary">
          <div className={cn("w-2 h-2 rounded-full", wsConnected ? "bg-green-500 animate-pulse" : "bg-red-500")} />
          <span>{wsConnected ? "WebSocket Connected" : "WebSocket Disconnected"}</span>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-github-bg text-github-text">
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex w-64 bg-github-bg-secondary border-r border-github-border flex-col">
        <SidebarContent />
      </div>

      {/* Mobile Sidebar */}
      <Sheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
        <SheetContent side="left" className="w-64 p-0 bg-github-bg-secondary border-github-border">
          <SidebarContent />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-github-bg-secondary border-b border-github-border px-3 lg:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {/* Mobile Menu Button */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="lg:hidden border-github-border bg-github-bg hover:bg-github-bg-tertiary"
                    onClick={() => setIsMobileSidebarOpen(true)}
                  >
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
              </Sheet>
              
              <div>
                <h2 className="text-lg lg:text-xl font-semibold">
                  {selectedTab === 'dashboard' && 'Session Dashboard'}
                  {selectedTab === 'sessions' && 'Active Sessions'}
                  {selectedTab === 'history' && 'Session History'}
                  {selectedTab === 'settings' && 'Settings'}
                </h2>
                <p className="text-xs lg:text-sm text-github-text-secondary hidden sm:block">
                  {selectedTab === 'dashboard' && 'Manage and monitor your tmate sessions'}
                  {selectedTab === 'sessions' && 'View and control active tmate sessions'}
                  {selectedTab === 'history' && 'Browse past session activity'}
                  {selectedTab === 'settings' && 'Configure application settings'}
                </p>
              </div>
            </div>
            <Dialog open={isNewSessionDialogOpen} onOpenChange={setIsNewSessionDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-green-600 hover:bg-green-700 text-white text-sm lg:text-base">
                  <Plus className="h-4 w-4 mr-1 lg:mr-2" />
                  <span className="hidden sm:inline">New Session</span>
                  <span className="sm:hidden">New</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-github-bg-secondary border-github-border">
                <DialogHeader>
                  <DialogTitle>Create New Tmate Session</DialogTitle>
                </DialogHeader>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  handleCreateSession({
                    name: formData.get('name') as string,
                    region: formData.get('region') as string,
                  });
                }} className="space-y-4">
                  <div>
                    <Label htmlFor="name">Session Name (Optional)</Label>
                    <Input
                      id="name"
                      name="name"
                      placeholder="my-session"
                      className="bg-github-bg border-github-border"
                    />
                  </div>
                  <div>
                    <Label htmlFor="region">Server Region</Label>
                    <Select name="region" defaultValue="auto">
                      <SelectTrigger className="bg-github-bg border-github-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-github-bg-secondary border-github-border">
                        <SelectItem value="auto">Auto (Recommended)</SelectItem>
                        <SelectItem value="nyc1">New York (nyc1)</SelectItem>
                        <SelectItem value="lon1">London (lon1)</SelectItem>
                        <SelectItem value="sfo1">San Francisco (sfo1)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end space-x-3">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsNewSessionDialogOpen(false)}
                      className="border-github-border"
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createSessionMutation.isPending}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {createSessionMutation.isPending ? 'Creating...' : 'Create Session'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-3 lg:p-6">
          {selectedTab === 'dashboard' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
              {/* Left Column - Session Controls */}
              <div className="space-y-6">
                {/* Active Sessions */}
                <Card className="bg-github-bg-secondary border-github-border">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Play className="h-5 w-5 text-green-500" />
                      <span>Active Sessions</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {loadingSessions ? (
                      <div className="text-github-text-secondary">Loading sessions...</div>
                    ) : activeSessions.length === 0 ? (
                      <div className="text-github-text-secondary text-center py-8">
                        No active sessions
                      </div>
                    ) : (
                      activeSessions.map((session: Session) => (
                        <div key={session.id} className="bg-github-bg-tertiary border border-github-border rounded-lg p-3 lg:p-4">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 space-y-2 sm:space-y-0">
                            <div className="flex items-center space-x-3">
                              <div className={cn("w-3 h-3 rounded-full animate-pulse", getStatusColor(session.status))} />
                              <span className="font-mono text-sm break-all">
                                {session.name || session.sessionId}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2 self-end sm:self-auto">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => restartSessionMutation.mutate(session.id)}
                                disabled={restartSessionMutation.isPending}
                                className="p-1 h-auto border-github-border"
                                title="Restart session"
                              >
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => stopSessionMutation.mutate(session.id)}
                                disabled={stopSessionMutation.isPending}
                                className="p-1 h-auto"
                                title="Stop session"
                              >
                                <Square className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-github-text-secondary">SSH Command:</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleCopy(session.sshCommand, 'SSH command')}
                                className="p-1 h-auto"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="bg-github-bg p-2 lg:p-3 rounded border border-github-border">
                              <code className="font-mono text-xs text-github-text select-all break-all">
                                {session.sshCommand}
                              </code>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4 text-xs text-github-text-secondary">
                            <div>
                              <span className="block">Started:</span>
                              <span className="text-github-text">
                                {formatDuration(session.startTime)}
                              </span>
                            </div>
                            <div>
                              <span className="block">Web URL:</span>
                              <div className="flex items-center space-x-2 mt-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleCopy(session.webUrl, 'Web URL')}
                                  className="text-xs h-6 px-2 border-github-border"
                                >
                                  <Copy className="h-3 w-3 mr-1" />
                                  Copy
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => window.open(session.webUrl, '_blank')}
                                  className="text-xs h-6 px-2 border-github-border"
                                >
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  Open
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                {/* System Status */}
                <Card className="bg-github-bg-secondary border-github-border">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Server className="h-5 w-5 text-blue-500" />
                      <span>System Status</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-github-bg-tertiary p-3 rounded border border-github-border">
                        <div className="text-sm text-github-text-secondary">Active Sessions</div>
                        <div className="text-2xl font-semibold text-green-500">
                          {activeSessions.length}
                        </div>
                      </div>
                      <div className="bg-github-bg-tertiary p-3 rounded border border-github-border">
                        <div className="text-sm text-github-text-secondary">Total Sessions</div>
                        <div className="text-2xl font-semibold text-github-text">
                          {allSessions.length}
                        </div>
                      </div>
                      <div className="bg-github-bg-tertiary p-3 rounded border border-github-border">
                        <div className="text-sm text-github-text-secondary">Connection</div>
                        <div className={cn("text-lg font-semibold", wsConnected ? "text-green-500" : "text-red-500")}>
                          {wsConnected ? "Online" : "Offline"}
                        </div>
                      </div>
                      <div className="bg-github-bg-tertiary p-3 rounded border border-github-border">
                        <div className="text-sm text-github-text-secondary">Log Entries</div>
                        <div className="text-lg font-semibold text-github-text">
                          {logs.length}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right Column - Logs and Web Interface */}
              <div className="space-y-6">
                {/* Real-time Logs */}
                <Card className="bg-github-bg-secondary border-github-border h-80">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center space-x-2">
                        <Activity className="h-5 w-5 text-yellow-500" />
                        <span>Real-time Logs</span>
                      </CardTitle>
                      <div className="flex items-center space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => clearLogsMutation.mutate()}
                          disabled={clearLogsMutation.isPending}
                          className="border-github-border"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                        <div className="flex items-center space-x-2 text-xs">
                          <div className={cn("w-2 h-2 rounded-full", wsConnected ? "bg-green-500 animate-pulse" : "bg-red-500")} />
                          <span className="text-github-text-secondary">
                            {wsConnected ? "Live" : "Offline"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <ScrollArea className="h-64 bg-github-bg rounded border border-github-border p-4">
                      <div className="font-mono text-xs space-y-1">
                        {logs.length === 0 ? (
                          <div className="text-github-text-secondary">No logs yet...</div>
                        ) : (
                          logs.map((log) => (
                            <div 
                              key={log.id} 
                              className="flex items-start space-x-2 group hover:bg-github-bg-tertiary rounded px-2 py-1 cursor-pointer transition-colors"
                              onClick={() => handleCopyLog(log.message)}
                              title="Click to copy log message"
                            >
                              <span className="text-github-text-secondary text-xs flex-shrink-0 w-16 sm:w-20">
                                {formatTimestamp(log.timestamp).split(' ')[1]}
                              </span>
                              <span className={cn("text-xs flex-shrink-0", getLogLevelColor(log.level))}>
                                [{log.level.toUpperCase()}]
                              </span>
                              <span className="text-github-text text-xs flex-1 break-words">{log.message}</span>
                              <Copy className="h-3 w-3 text-github-text-secondary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                            </div>
                          ))
                        )}
                        <div ref={logsEndRef} />
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Tmate Web Interface */}
                <Card className="bg-github-bg-secondary border-github-border flex-1">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center space-x-2">
                        <Terminal className="h-5 w-5 text-blue-500" />
                        <span>Tmate Web Interface</span>
                      </CardTitle>
                      {activeSessions.length > 0 && (
                        <Select defaultValue={activeSessions[0]?.sessionId}>
                          <SelectTrigger className="w-48 bg-github-bg-tertiary border-github-border">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-github-bg-secondary border-github-border">
                            {activeSessions.map((session: Session) => (
                              <SelectItem key={session.id} value={session.sessionId}>
                                {session.name || session.sessionId}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-black rounded border border-github-border h-96 flex items-center justify-center relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-black"></div>
                      <div className="relative z-10 text-center">
                        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Terminal className="h-8 w-8 text-green-500" />
                        </div>
                        <h4 className="text-xl font-semibold mb-2">Terminal Session</h4>
                        <p className="text-github-text-secondary mb-4">Tmate web interface will be embedded here</p>
                        {activeSessions.length > 0 && (
                          <div className="font-mono text-sm bg-github-bg-tertiary px-4 py-2 rounded border border-github-border inline-block">
                            <span className="text-green-400">user@container:</span>
                            <span className="text-blue-400">~$</span>
                            <span className="animate-pulse">_</span>
                          </div>
                        )}
                      </div>
                      {/* Simulated terminal window controls */}
                      <div className="absolute top-4 left-4 flex space-x-2">
                        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                        <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      </div>
                    </div>
                    {activeSessions.length > 0 && (
                      <div className="mt-4 text-sm text-github-text-secondary bg-github-bg-tertiary p-3 rounded border border-github-border">
                        <strong>Implementation Note:</strong> This area should contain an iframe pointing to the tmate web interface URL 
                        (e.g., {activeSessions[0]?.webUrl}) for the selected session.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {selectedTab === 'sessions' && (
            <div className="space-y-4">
              {activeSessions.map((session: Session) => (
                <Card key={session.id} className="bg-github-bg-secondary border-github-border">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className={cn("w-3 h-3 rounded-full", getStatusColor(session.status))} />
                        <div>
                          <h3 className="font-semibold">{session.name || session.sessionId}</h3>
                          <p className="text-sm text-github-text-secondary">
                            Started {formatTimestamp(session.startTime)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant={session.status === 'running' ? 'default' : 'destructive'}>
                          {session.status}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => restartSessionMutation.mutate(session.id)}
                          disabled={restartSessionMutation.isPending}
                          className="border-github-border"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => stopSessionMutation.mutate(session.id)}
                          disabled={stopSessionMutation.isPending}
                        >
                          <Square className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-github-text-secondary">SSH Command</Label>
                        <div className="flex items-center space-x-2 mt-1">
                          <div className="flex-1 bg-github-bg p-2 rounded border border-github-border">
                            <code className="font-mono text-xs">{session.sshCommand}</code>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCopy(session.sshCommand, 'SSH command')}
                            className="border-github-border"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      
                      <div>
                        <Label className="text-xs text-github-text-secondary">Web URL</Label>
                        <div className="flex items-center space-x-2 mt-1">
                          <div className="flex-1 bg-github-bg p-2 rounded border border-github-border">
                            <code className="font-mono text-xs">{session.webUrl}</code>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCopy(session.webUrl, 'Web URL')}
                            className="border-github-border"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(session.webUrl, '_blank')}
                            className="border-github-border"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {activeSessions.length === 0 && (
                <div className="text-center py-12">
                  <Terminal className="h-12 w-12 text-github-text-secondary mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Active Sessions</h3>
                  <p className="text-github-text-secondary mb-4">Create a new tmate session to get started</p>
                  <Button onClick={() => setIsNewSessionDialogOpen(true)} className="bg-green-600 hover:bg-green-700">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Session
                  </Button>
                </div>
              )}
            </div>
          )}

          {selectedTab === 'history' && (
            <div className="space-y-4">
              {allSessions.map((session: Session) => (
                <Card key={session.id} className="bg-github-bg-secondary border-github-border">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={cn("w-3 h-3 rounded-full", getStatusColor(session.status))} />
                        <div>
                          <h3 className="font-semibold">{session.name || session.sessionId}</h3>
                          <p className="text-sm text-github-text-secondary">
                            {formatTimestamp(session.startTime)} - {session.endTime ? formatTimestamp(session.endTime) : 'Running'}
                          </p>
                        </div>
                      </div>
                      <Badge variant={session.status === 'running' ? 'default' : 'secondary'}>
                        {session.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {allSessions.length === 0 && (
                <div className="text-center py-12">
                  <History className="h-12 w-12 text-github-text-secondary mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Session History</h3>
                  <p className="text-github-text-secondary">Session history will appear here</p>
                </div>
              )}
            </div>
          )}

          {selectedTab === 'settings' && (
            <Card className="bg-github-bg-secondary border-github-border">
              <CardHeader>
                <CardTitle>Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">WebSocket Connection</h3>
                    <div className="flex items-center space-x-2">
                      <div className={cn("w-2 h-2 rounded-full", wsConnected ? "bg-green-500" : "bg-red-500")} />
                      <span className="text-sm">
                        Status: {wsConnected ? "Connected" : "Disconnected"}
                      </span>
                    </div>
                  </div>
                  
                  <Separator className="bg-github-border" />
                  
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Log Management</h3>
                    <Button
                      onClick={() => clearLogsMutation.mutate()}
                      disabled={clearLogsMutation.isPending}
                      variant="destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Clear All Logs
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
