import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import Home from "@/pages/home";
import Login from "@/pages/login";
import Join from "@/pages/join";
import Survey from "@/pages/survey";
import Console from "@/pages/console";
import SessionManager from "@/pages/session-manager";
import Dashboard from "@/pages/dashboard";
import Overlay from "@/pages/overlay";
import Admin from "@/pages/admin";
import UserManagement from "@/pages/user-management";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/join/:code" component={Join} />
      <Route path="/survey/:code" component={Survey} />
      <Route path="/console" component={Console} />
      <Route path="/console/:id" component={SessionManager} />
      <Route path="/dashboard/:id" component={Dashboard} />
      <Route path="/overlay/:code" component={Overlay} />
      <Route path="/admin" component={Admin} />
      <Route path="/users" component={UserManagement} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
