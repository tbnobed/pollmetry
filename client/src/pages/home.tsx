import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Users, TrendingUp } from "lucide-react";

export default function Home() {
  const [, setLocation] = useLocation();
  const [joinCode, setJoinCode] = useState("");
  const [segment, setSegment] = useState<"room" | "remote">("remote");

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim()) {
      setLocation(`/join/${joinCode.trim().toUpperCase()}?segment=${segment}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="PollMetry.io" className="w-10 h-10 rounded-lg" />
            <span className="text-xl font-semibold">PollMetry.io</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button 
              variant="outline" 
              onClick={() => setLocation("/login")}
              data-testid="button-login"
            >
              Pollster Login
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Real-time Audience Polling
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Engage your audience with live polls, instant results, and powerful analytics.
              Perfect for livestreams and hybrid events.
            </p>
          </div>

          <Card className="max-w-md mx-auto mb-16">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Join a Session</CardTitle>
              <CardDescription>
                Enter the session code to participate
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleJoinSubmit} className="space-y-4">
                <Input
                  type="text"
                  placeholder="Enter code (e.g., ABC123)"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="text-center text-2xl font-mono h-16 tracking-widest"
                  maxLength={6}
                  data-testid="input-join-code"
                />
                <div className="flex items-center justify-center gap-2">
                  <span className="text-sm text-muted-foreground">I am:</span>
                  <Button
                    type="button"
                    variant={segment === "room" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSegment("room")}
                    data-testid="button-segment-room"
                  >
                    <Users className="w-4 h-4 mr-2" />
                    In the Room
                  </Button>
                  <Button
                    type="button"
                    variant={segment === "remote" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSegment("remote")}
                    data-testid="button-segment-remote"
                  >
                    <TrendingUp className="w-4 h-4 mr-2" />
                    Joining Remotely
                  </Button>
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12 text-lg"
                  disabled={!joinCode.trim()}
                  data-testid="button-join-session"
                >
                  Join Session
                </Button>
              </form>
            </CardContent>
          </Card>

          
        </div>
      </main>
    </div>
  );
}
