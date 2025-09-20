import { useState, useEffect } from "react";
import { Mail, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface GmailConnectProps {
  onConnectionChange?: (connected: boolean) => void;
}

export function GmailConnect({ onConnectionChange }: GmailConnectProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const { toast } = useToast();

  // Check Gmail connection status on mount
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const response = await apiRequest("GET", "/api/gmail/status", {});
        const data = await response.json();
        setIsConnected(data.connected || false);
        onConnectionChange?.(data.connected || false);
      } catch (error) {
        // Silently handle error - assume disconnected
        setIsConnected(false);
      }
    };

    checkConnection();
  }, [onConnectionChange]);

  // Listen for messages from OAuth popup
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data.success) {
        setIsConnected(true);
        setIsConnecting(false);
        onConnectionChange?.(true);
        toast({
          title: "Gmail Connected",
          description: `Successfully connected ${event.data.email || 'your Gmail account'}. You'll start receiving real-time notifications!`,
        });

        // If user was authenticated through OAuth, clear old state and refresh
        if (event.data.authenticated) {
          // Clear any previous user's Gmail connection state
          localStorage.removeItem('gmailConnected');
          localStorage.removeItem('userEmail');
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }
      } else if (!event.data.success) {
        setIsConnecting(false);
        toast({
          title: "Connection Failed",
          description: event.data.error || "Failed to connect Gmail. Please try again.",
          variant: "destructive",
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onConnectionChange, toast]);

  const connectGmailMutation = useMutation({
    mutationFn: async () => {
      setIsConnecting(true);

      // Start Gmail OAuth flow
      const response = await apiRequest("POST", "/api/gmail/connect", {});

      const { authUrl } = await response.json();

      // Open Google OAuth in popup window
      const popup = window.open(
        authUrl, 
        'gmail-auth', 
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );

      // Return success immediately - will be handled by message listener
      return { success: true };
    },
    onSuccess: () => {
      // Connection handling is done by message listener
      setIsConnecting(false);
    },
    onError: () => {
      setIsConnecting(false);
      toast({
        title: "Connection Failed",
        description: "Failed to connect Gmail. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleConnect = () => {
    connectGmailMutation.mutate();
  };

  const handleDisconnect = async () => {
    try {
      await apiRequest("POST", "/api/gmail/disconnect", {});

      setIsConnected(false);
      onConnectionChange?.(false);
      toast({
        title: "Gmail Disconnected",
        description: "Gmail notifications have been disabled.",
      });
    } catch (error) {
      toast({
        title: "Disconnect Failed",
        description: "Failed to disconnect Gmail. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="glass-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              isConnected ? 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400' : 'bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400'
            }`}>
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Gmail Notifications</h3>
              <p className="text-xs text-muted-foreground">
                {isConnected ? 'Receiving real-time notifications' : 'Connect to receive notifications'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {isConnected ? (
              <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/50">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium text-green-600 dark:text-green-400">Gmail Connected</span>
                <span className="text-xs text-green-600 dark:text-green-400 font-bold">• LIVE</span>
              </div>
            ) : (
              <>
                {!isConnected && <AlertCircle className="w-4 h-4 text-red-500" />}
                <Button 
                  onClick={handleConnect}
                  disabled={isConnecting}
                  size="sm"
                  data-testid="button-connect-gmail"
                >
                  {isConnecting ? 'Connecting...' : 'Connect'}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
