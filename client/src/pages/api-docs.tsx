import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Copy, Check, ExternalLink, Code, Radio, FileJson, Keyboard } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useState } from "react";

export default function ApiDocs() {
  const [, setLocation] = useLocation();
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);

  const { data: user, isLoading } = useQuery<{ id: string; username: string; isAdmin: boolean }>({
    queryKey: ["/api/auth/me"],
  });

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedEndpoint(id);
    setTimeout(() => setCopiedEndpoint(null), 2000);
  };

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Code className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-4">You need admin privileges to access API documentation.</p>
            <Button onClick={() => setLocation("/console")} data-testid="button-back-sessions">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Sessions
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/console")} data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Code className="w-5 h-5" />
              <h1 className="font-semibold">API Documentation</h1>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">PollMetry.io API</h1>
          <p className="text-muted-foreground">
            Integrate with external systems like broadcast graphics (Xpression), hardware voting devices, and custom applications.
          </p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-primary" />
                <CardTitle>Broadcast Overlay API</CardTitle>
              </div>
              <CardDescription>
                Real-time polling data for broadcast graphics systems like Xpression. 
                Poll this endpoint to get current session state, live questions, and vote tallies.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary">GET</Badge>
                  <code className="text-sm bg-muted px-2 py-1 rounded flex-1">
                    /api/broadcast/:sessionCode
                  </code>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => copyToClipboard(`${baseUrl}/api/broadcast/YOUR_CODE`, 'broadcast')}
                    data-testid="button-copy-broadcast"
                  >
                    {copiedEndpoint === 'broadcast' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Replace <code className="bg-muted px-1 rounded">:sessionCode</code> with your 6-character session code (e.g., ABC123).
                </p>
              </div>

              <div>
                <h4 className="font-medium mb-2">Example Request</h4>
                <div className="bg-muted p-3 rounded-md">
                  <code className="text-sm break-all">{baseUrl}/api/broadcast/ABC123</code>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Response Format</h4>
                <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
{`{
  "sessionCode": "ABC123",
  "sessionTitle": "My Polling Session",
  "mode": "live",
  "isActive": true,
  "timestamp": "2025-01-22T12:00:00.000Z",
  
  "liveQuestion": {
    "id": "q1",
    "questionText": "What is your favorite color?",
    "type": "multiple_choice",
    "state": "LIVE",
    "resultsVisible": true,
    "frozen": false,
    "totalVotes": 150,
    "roomVotes": 80,
    "remoteVotes": 70,
    "votesPerSecond": 2.5,
    "options": [
      { "id": "opt1", "text": "Red", "votes": 45, "percentage": 30 },
      { "id": "opt2", "text": "Blue", "votes": 60, "percentage": 40 },
      { "id": "opt3", "text": "Green", "votes": 45, "percentage": 30 }
    ]
  },
  
  "Question1": { ... },
  "Question2": { ... }
}`}</pre>
              </div>

              <div>
                <h4 className="font-medium mb-2">Key Fields</h4>
                <ul className="text-sm space-y-2 text-muted-foreground">
                  <li><code className="bg-muted px-1 rounded">liveQuestion</code> - The currently active question (null if none)</li>
                  <li><code className="bg-muted px-1 rounded">Question1, Question2...</code> - All questions with their current state and results</li>
                  <li><code className="bg-muted px-1 rounded">roomVotes / remoteVotes</code> - Segment breakdown for hybrid events</li>
                  <li><code className="bg-muted px-1 rounded">votesPerSecond</code> - Real-time voting velocity</li>
                  <li><code className="bg-muted px-1 rounded">resultsVisible</code> - Whether results should be shown to audience</li>
                  <li><code className="bg-muted px-1 rounded">frozen</code> - Whether voting is temporarily paused</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-primary" />
                <CardTitle>Hardware Voting Device API</CardTitle>
              </div>
              <CardDescription>
                Submit votes from external hardware keypads (Turning, iClicker, ResponseCard, etc.).
                Designed for integration with hardware voting systems in live venues.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Get Current Question Status</h4>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary">GET</Badge>
                  <code className="text-sm bg-muted px-2 py-1 rounded flex-1">
                    /api/vote/hardware/status/:sessionCode
                  </code>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => copyToClipboard(`${baseUrl}/api/vote/hardware/status/YOUR_CODE`, 'hw-status')}
                    data-testid="button-copy-hw-status"
                  >
                    {copiedEndpoint === 'hw-status' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  Poll this endpoint to check if a question is live and get available options.
                </p>
                <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
{`{
  "sessionActive": true,
  "hasLiveQuestion": true,
  "question": {
    "id": "q1",
    "text": "What is your favorite color?",
    "type": "multiple_choice",
    "frozen": false,
    "options": [
      { "index": 0, "label": "Red", "key": "A" },
      { "index": 1, "label": "Blue", "key": "B" },
      { "index": 2, "label": "Green", "key": "C" }
    ]
  }
}`}</pre>
              </div>

              <div>
                <h4 className="font-medium mb-2">Submit a Vote</h4>
                <div className="flex items-center gap-2 mb-2">
                  <Badge>POST</Badge>
                  <code className="text-sm bg-muted px-2 py-1 rounded flex-1">
                    /api/vote/hardware
                  </code>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => copyToClipboard(`${baseUrl}/api/vote/hardware`, 'hw-vote')}
                    data-testid="button-copy-hw-vote"
                  >
                    {copiedEndpoint === 'hw-vote' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  Submit a vote from a hardware device. Each device can only vote once per question.
                </p>
                
                <h5 className="text-sm font-medium mb-2">Request Body</h5>
                <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto mb-4">
{`{
  "sessionCode": "ABC123",
  "deviceId": "KEYPAD-001",
  "optionIndex": 0,
  "segment": "room"
}`}</pre>

                <h5 className="text-sm font-medium mb-2">Fields</h5>
                <ul className="text-sm space-y-2 text-muted-foreground mb-4">
                  <li><code className="bg-muted px-1 rounded">sessionCode</code> <span className="text-destructive">*</span> - 6-character session code</li>
                  <li><code className="bg-muted px-1 rounded">deviceId</code> <span className="text-destructive">*</span> - Unique identifier for the hardware device</li>
                  <li><code className="bg-muted px-1 rounded">optionIndex</code> <span className="text-destructive">*</span> - Zero-based index of selected option (0=A, 1=B, 2=C...)</li>
                  <li><code className="bg-muted px-1 rounded">segment</code> - Optional: "room" (default) or "remote"</li>
                </ul>

                <h5 className="text-sm font-medium mb-2">Success Response</h5>
                <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto mb-4">
{`{
  "success": true,
  "message": "Vote recorded",
  "deviceId": "KEYPAD-001",
  "questionId": "q1",
  "optionIndex": 0,
  "optionLabel": "Red"
}`}</pre>

                <h5 className="text-sm font-medium mb-2">Error Responses</h5>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li><code className="bg-muted px-1 rounded">400</code> - Missing fields, no live question, voting frozen, or already voted</li>
                  <li><code className="bg-muted px-1 rounded">404</code> - Session not found</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileJson className="w-5 h-5 text-primary" />
                <CardTitle>Session Data Export</CardTitle>
              </div>
              <CardDescription>
                Export complete session data including all questions and vote tallies.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary">GET</Badge>
                  <code className="text-sm bg-muted px-2 py-1 rounded flex-1">
                    /api/sessions/:sessionId
                  </code>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => copyToClipboard(`${baseUrl}/api/sessions/SESSION_ID`, 'session')}
                    data-testid="button-copy-session"
                  >
                    {copiedEndpoint === 'session' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Requires authentication. Returns full session details.
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary">GET</Badge>
                  <code className="text-sm bg-muted px-2 py-1 rounded flex-1">
                    /api/sessions/:sessionId/questions
                  </code>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => copyToClipboard(`${baseUrl}/api/sessions/SESSION_ID/questions`, 'questions')}
                    data-testid="button-copy-questions"
                  >
                    {copiedEndpoint === 'questions' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Requires authentication. Returns all questions with vote counts.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ExternalLink className="w-5 h-5 text-primary" />
                <CardTitle>WebSocket Events</CardTitle>
              </div>
              <CardDescription>
                Real-time updates via Socket.IO for live vote streaming.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Connection</h4>
                <div className="bg-muted p-3 rounded-md">
                  <code className="text-sm">io("{baseUrl}")</code>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Events to Listen</h4>
                <ul className="text-sm space-y-2">
                  <li className="flex items-start gap-2">
                    <code className="bg-muted px-1 rounded whitespace-nowrap">vote:update</code>
                    <span className="text-muted-foreground">- Real-time vote count updates</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <code className="bg-muted px-1 rounded whitespace-nowrap">question:state</code>
                    <span className="text-muted-foreground">- Question state changes (DRAFT, LIVE, CLOSED)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <code className="bg-muted px-1 rounded whitespace-nowrap">session:update</code>
                    <span className="text-muted-foreground">- Session status changes</span>
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="font-medium mb-2">Join a Session Room</h4>
                <pre className="bg-muted p-3 rounded-md text-sm">
{`socket.emit("join:session", { sessionCode: "ABC123" });`}
                </pre>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rate Limits & Best Practices</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-2 text-muted-foreground">
                <li>• For broadcast graphics, poll the endpoint every 500ms - 1 second</li>
                <li>• Use WebSocket connection for real-time updates when possible</li>
                <li>• Cache responses appropriately based on your graphics refresh rate</li>
                <li>• The <code className="bg-muted px-1 rounded">timestamp</code> field helps detect stale data</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
