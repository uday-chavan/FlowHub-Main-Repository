
import { useState, useEffect } from "react";
import { Calendar, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface CalendarSyncProps {
  isGmailConnected?: boolean;
}

export function CalendarSync({ isGmailConnected = false }: CalendarSyncProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const { toast } = useToast();

  // Check calendar connection status
  useEffect(() => {
    const checkCalendarStatus = async () => {
      try {
        const response = await apiRequest("GET", "/api/calendar/status");
        const data = await response.json();
        setIsConnected(data.connected || false);
      } catch (error) {
        setIsConnected(false);
      }
    };

    if (isGmailConnected) {
      checkCalendarStatus();
    }
  }, [isGmailConnected]);

  const syncCalendarMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/calendar/sync");
      return response.json();
    },
    onSuccess: () => {
      setLastSyncTime(new Date().toLocaleTimeString());
      toast({
        title: "Calendar Synced",
        description: "Your Google Calendar events have been synced successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Sync Failed",
        description: "Failed to sync calendar events. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSync = () => {
    syncCalendarMutation.mutate();
  };

  if (!isGmailConnected) {
    return (
      <Card className="glass-card opacity-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-400">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-gray-500">Calendar Sync</h3>
                <p className="text-xs text-muted-foreground">
                  Connect Gmail first to enable calendar
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              isConnected ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
            }`}>
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Calendar Integration</h3>
              <p className="text-xs text-muted-foreground">
                {isConnected 
                  ? lastSyncTime 
                    ? `Last synced: ${lastSyncTime}`
                    : 'Calendar events sync with tasks'
                  : 'Sync calendar events to create tasks'
                }
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {isConnected ? (
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50">
                  <CheckCircle className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-medium text-blue-600 dark:text-blue-400">Active</span>
                </div>
                <Button 
                  onClick={handleSync}
                  disabled={syncCalendarMutation.isPending}
                  size="sm"
                  variant="outline"
                >
                  {syncCalendarMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  <span className="ml-1">Sync</span>
                </Button>
              </div>
            ) : (
              <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <AlertCircle className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-600 dark:text-gray-400">Connecting...</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
