import { Bell, Eye, X, Mail, MessageSquare, Calendar, Satellite, CheckSquare } from "lucide-react";
import { useNotifications, useMarkNotificationRead, useDismissNotification } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatDistanceToNow } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

const notificationTypeConfig = {
  urgent: {
    color: "border-destructive",
    bgColor: "bg-destructive/10",
    textColor: "text-destructive",
    label: "URGENT",
  },
  important: {
    color: "border-orange-500",
    bgColor: "bg-orange-50/20",
    textColor: "text-orange-600",
    label: "IMPORTANT",
  },
  informational: {
    color: "border-blue-500",
    bgColor: "bg-blue-50/20",
    textColor: "text-blue-600",
    label: "INFORMATIONAL",
  },
  normal: {
    color: "border-blue-500",
    bgColor: "bg-blue-50/20",
    textColor: "text-blue-600",
    label: "NORMAL",
  },
};

const getSourceIcon = (sourceApp: string) => {
    switch (sourceApp) {
      case "gmail":
        return <Mail className="w-4 h-4 text-red-500" />;
      case "slack":
        return <MessageSquare className="w-4 h-4 text-purple-500" />;
      case "calendar":
        return <Calendar className="w-4 h-4 text-blue-500" />;
      default:
        return <Bell className="w-4 h-4" />;
    }
  };

export function NotificationFeed() {
  const { data: notifications, isLoading } = useNotifications();
  const markReadMutation = useMarkNotificationRead();
  const dismissMutation = useDismissNotification();
  const queryClient = useQueryClient();
  const [convertingTasks, setConvertingTasks] = useState<Set<string>>(new Set());
  const [selectedNotification, setSelectedNotification] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleMarkRead = (notificationId: string) => {
    markReadMutation.mutate(notificationId);
  };

  const handleDismiss = (notificationId: string) => {
    dismissMutation.mutate(notificationId);
  };

  const handleViewNotification = (notification: any) => {
    // Mark as read when viewing
    if (!notification.isRead) {
      handleMarkRead(notification.id);
    }
    // Open the notification details dialog
    setSelectedNotification(notification);
    setIsDialogOpen(true);
    // Notification viewed
  };

  const handleConvertToTask = async (notification: any) => {
    setConvertingTasks(prev => new Set([...Array.from(prev), notification.id]));

    try {
      // Use Gemini AI to convert notification to structured task
      const response = await apiRequest("POST", `/api/notifications/${notification.id}/convert-to-task`);

      console.log("Task conversion successful:", response);

      // Refresh tasks and notifications with proper query key patterns
      await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      await queryClient.invalidateQueries({ queryKey: ['convertedEmails'] });
      
      // Force immediate refetch with a slight delay to ensure database changes are committed
      setTimeout(async () => {
        await queryClient.refetchQueries({ queryKey: ["/api/tasks"] });
        await queryClient.refetchQueries({ queryKey: ["/api/notifications"] });
        await queryClient.refetchQueries({ queryKey: ['convertedEmails'] });
      }, 500);
    } catch (error) {
      console.error("Conversion error:", error);
    } finally {
      setConvertingTasks(prev => {
        const newSet = new Set(prev);
        newSet.delete(notification.id);
        return newSet;
      });
    }
  };

  const handlePushAllToTasks = async () => {
    const notificationIds = activeNotifications.map(n => n.id);
    setConvertingTasks(new Set(notificationIds));

    try {
      // Use batch processing for 8+ notifications to optimize performance
      if (activeNotifications.length >= 8) {
        console.log(`[BatchProcessing] Processing ${activeNotifications.length} notifications in batch mode`);

        await apiRequest("POST", "/api/notifications/batch-convert-to-tasks", {
          userId: "demo-user",
          notifications: activeNotifications.map(n => ({
            id: n.id,
            title: n.title,
            description: n.description || n.aiSummary || "",
            sourceApp: n.sourceApp,
            type: n.type,
            metadata: {
              batchProcessed: true,
              convertedAt: new Date().toISOString()
            }
          }))
        });
      } else {
        // Individual processing for smaller batches (better for AI analysis)
        const promises = activeNotifications.map(async (notification) => {
          await apiRequest("POST", `/api/notifications/${notification.id}/convert-to-task`);
        });

        await Promise.all(promises);
      }

      // Refresh tasks and notifications with proper query key patterns
      await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      
      // Force immediate refetch
      await queryClient.refetchQueries({ queryKey: ["/api/tasks"] });
      await queryClient.refetchQueries({ queryKey: ["/api/notifications"] });
    } catch (error) {
      console.error("Error converting notifications to tasks:", error);
    } finally {
      setConvertingTasks(new Set());
    }
  };



  if (isLoading) {
    return (
      <div className="glass-card rounded-lg p-6 h-full flex flex-col" data-testid="card-notification-feed">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted/30 rounded w-2/3"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-muted/20 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const activeNotifications = notifications?.filter(n => !n.isDismissed && n.type !== 'email_converted' && !n.metadata?.browserNotification) || [];

  return (
    <div className="glass-card rounded-lg p-6 h-full animate-in slide-in-from-right-5 duration-700 flex flex-col" data-testid="card-notification-feed">
      {/* Fixed Header Section */}
      <div className="flex-shrink-0">
        {/* Gmail Status */}
        <div className="mb-6">
          <div className="flex items-center justify-center py-3 px-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200/30 backdrop-blur-sm">
            <div className="flex items-center space-x-2 group">
              <div className="relative">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <div className="absolute inset-0 w-2 h-2 bg-green-400 rounded-full animate-ping opacity-75"></div>
              </div>
              <span className="text-sm font-semibold text-green-600 tracking-wide">
                Gmail Connected
              </span>
              <div className="text-xs text-green-500/80 font-medium animate-pulse">
                • LIVE
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center font-display animate-in fade-in-50 duration-500 delay-200" data-testid="text-notifications-title">
            <Bell className="w-5 h-5 mr-2 text-primary animate-pulse" />
            Notifications
          </h2>
          <div className="flex space-x-2">
            {activeNotifications.length > 0 && (
              <Button
                onClick={handlePushAllToTasks}
                disabled={convertingTasks.size > 0}
                className="bg-primary/20 hover:bg-primary/30 px-3 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105 text-primary"
                variant="ghost"
                size="sm"
                data-testid="button-push-all-to-tasks"
              >
                <CheckSquare className="w-4 h-4 mr-1" />
                {convertingTasks.size > 0 ? "Converting..." : "Push to Tasks"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="space-y-3 flex-1 overflow-y-auto min-h-0">
        {activeNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground" data-testid="text-no-notifications">
            <Bell className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No active notifications.</p>
            <p className="text-sm mt-2">Your command center is clear!</p>
          </div>
        ) : (
          activeNotifications.map((notification) => {
            const config = notificationTypeConfig[notification.type as keyof typeof notificationTypeConfig] || notificationTypeConfig.informational;
            const timeAgo = formatDistanceToNow(new Date(notification.createdAt || new Date()), { addSuffix: true });

            return (
              <div
                key={notification.id}
                className={`border-l-2 ${config.color} ${config.bgColor} rounded-r-lg p-3 ${!notification.isRead ? 'ring-1 ring-primary/20' : ''} animate-in slide-in-from-left-3 duration-500 hover:scale-[1.02] transition-all hover:shadow-lg`}
                data-testid={`notification-item-${notification.id}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-3">
                      <Badge 
                        variant={notification.type === 'urgent' ? 'destructive' : 
                                notification.type === 'important' ? 'default' : 'outline'}
                        className={`text-xs ${
                          notification.type === 'urgent' ? 'bg-red-500 text-white border-red-500 hover:bg-red-600' :
                          notification.type === 'important' ? 'bg-orange-500 text-white border-orange-500 hover:bg-orange-600' :
                          'bg-blue-500 text-white border-blue-500 hover:bg-blue-600'
                        }`}
                      >
                        {config.label}
                      </Badge>
                      {notification.metadata?.isPriorityPerson && (
                        <Badge 
                          className="priority-person-badge text-xs bg-red-500 text-white border-red-500 hover:bg-red-600"
                        >
                          <span className="hidden sm:inline">Priority Person</span>
                          <span className="sm:hidden">Priority</span>
                        </Badge>
                      )}
                    </div>
                  <span className="text-xs text-muted-foreground ml-3" data-testid={`notification-time-${notification.id}`}>
                    {timeAgo}
                  </span>
                </div>
                <h3 className="text-sm font-medium flex items-center" data-testid={`notification-title-${notification.id}`}>
                  {getSourceIcon(notification.sourceApp || "default")}
                  <span className="ml-2">{notification.sourceApp}: {notification.title}</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-1" data-testid={`notification-description-${notification.id}`}>
                  {notification.aiSummary || notification.description}
                </p>
                <div className="flex space-x-2 mt-2">
                  <Button
                    onClick={() => handleViewNotification(notification)}
                    className={`${config.bgColor}/50 hover:${config.bgColor}/80 px-2 py-1 rounded text-xs transition-all hover:scale-105`}
                    variant="ghost"
                    size="sm"
                    data-testid={`button-view-notification-${notification.id}`}
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    View
                  </Button>
                  <Button
                    onClick={() => handleConvertToTask(notification)}
                    disabled={convertingTasks.has(notification.id)}
                    className="bg-primary/20 hover:bg-primary/30 px-2 py-1 rounded text-xs transition-all hover:scale-105 text-primary"
                    variant="ghost"
                    size="sm"
                    data-testid={`button-convert-task-${notification.id}`}
                  >
                    <CheckSquare className="w-3 h-3 mr-1" />
                    {convertingTasks.has(notification.id) ? "Converting..." : "To Task"}
                  </Button>
                  <Button
                    onClick={() => handleDismiss(notification.id)}
                    disabled={dismissMutation.isPending}
                    className="bg-muted/20 hover:bg-muted/30 px-2 py-1 rounded text-xs transition-all hover:scale-105"
                    variant="ghost"
                    size="sm"
                    data-testid={`button-dismiss-notification-${notification.id}`}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Email Details Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              {selectedNotification && getSourceIcon(selectedNotification.sourceApp)}
              <span className="ml-2">{selectedNotification?.title || 'Notification Details'}</span>
            </DialogTitle>
            <DialogDescription>
              {selectedNotification && `From: ${selectedNotification.sourceApp} • ${formatDistanceToNow(new Date(selectedNotification.createdAt), { addSuffix: true })}`}
            </DialogDescription>
          </DialogHeader>

          {selectedNotification && (
            <div className="space-y-4">
              <div className="border rounded-lg p-4 bg-muted/20">
                <h4 className="font-medium mb-2">Subject:</h4>
                <p className="text-sm text-muted-foreground">{selectedNotification.title}</p>
              </div>

              <div className="border rounded-lg p-4 bg-muted/20">
                <h4 className="font-medium mb-2">Email Content:</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {selectedNotification.metadata?.fullEmailContent || selectedNotification.description || selectedNotification.aiSummary || 'No content available'}
                </p>
              </div>

              {selectedNotification.actionableInsights && selectedNotification.actionableInsights.length > 0 && (
                <div className="border rounded-lg p-4 bg-muted/20">
                  <h4 className="font-medium mb-2">AI Insights:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {selectedNotification.actionableInsights.map((insight: string, index: number) => (
                      <li key={index}>• {insight}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex space-x-2 pt-4">
                <Button
                  onClick={() => {
                    handleConvertToTask(selectedNotification);
                    setIsDialogOpen(false);
                  }}
                  className="flex-1"
                >
                  <CheckSquare className="w-4 h-4 mr-2" />
                  Convert to Task
                </Button>
                <Button
                  onClick={() => {
                    handleDismiss(selectedNotification.id);
                    setIsDialogOpen(false);
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
