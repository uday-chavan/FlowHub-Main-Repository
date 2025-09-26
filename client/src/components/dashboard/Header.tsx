import { Bell, Settings, Eye, X, Mail, Clock, BarChart3, Home, Crown, Sparkles, Star, User, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications, useMarkNotificationRead, useDismissNotification } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import { useLocation, Link } from "wouter";
import { GmailConnect } from "./GmailConnect";
import { UserProfile } from "./UserProfile";
import { UpgradeModal } from "./UpgradeModal";
import { AITasksLimitBar } from "./AITasksLimitBar";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { useState } from "react";

import { cn } from "@/lib/utils";

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

export function Header() {
  const { data: notifications } = useNotifications();
  const markReadMutation = useMarkNotificationRead();
  const dismissMutation = useDismissNotification();
  const [location] = useLocation();
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const isDashboard = location === '/dashboard';

  const activeNotifications = notifications?.filter(n => !n.isDismissed && !n.metadata?.browserNotification && n.type !== 'email_converted') || [];
  const unreadCount = activeNotifications.filter(n => !n.isRead).length;

  const handleMarkRead = (notificationId: string) => {
    markReadMutation.mutate(notificationId);
  };

  const handleDismiss = (notificationId: string) => {
    dismissMutation.mutate(notificationId);
  };

  const handleViewNotification = (notification: any) => {
    if (!notification.isRead) {
      handleMarkRead(notification.id);
    }
    // Notification viewed
  };

  return (
    <header className="glass-card border-b border-border/50 sticky top-0 z-50" data-testid="header-main">
      <div className="container mx-auto px-3 py-3">
        <div className="flex items-center justify-between w-full">
          {/* User Profile - Left side */}
          <div className="flex items-center">
            <UserProfile />
          </div>

          {/* Navigation Menu - Center Left */}
          <div className="hidden md:flex items-center space-x-2 flex-1 justify-start ml-6">
            <Link href="/dashboard">
              <Button
                variant={location === '/dashboard' ? 'default' : 'ghost'}
                size="sm"
                className="flex items-center space-x-2"
              >
                <Home className="w-4 h-4" />
                <span>Dashboard</span>
              </Button>
            </Link>

            <Link href="/emails-converted">
              <Button
                variant={location === '/emails-converted' ? 'default' : 'ghost'}
                size="sm"
                className="flex items-center space-x-2"
              >
                <Mail className="w-4 h-4" />
                <span>Converted Emails</span>
              </Button>
            </Link>

            <Link href="/priority-emails">
              <Button
                variant={location === '/priority-emails' ? 'default' : 'ghost'}
                size="sm"
                className="flex items-center space-x-2"
              >
                <Star className="w-4 h-4" />
                <span>Priority Person</span>
              </Button>
            </Link>

            <Link href="/time-saved">
              <Button
                variant={location === '/time-saved' ? 'default' : 'ghost'}
                size="sm"
                className="flex items-center space-x-2"
              >
                <Clock className="w-4 h-4" />
                <span>Time Saved</span>
              </Button>
            </Link>

            <Link href="/feedback">
              <Button
                variant={location === '/feedback' ? 'default' : 'ghost'}
                size="sm"
                className="flex items-center space-x-2"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Feedback</span>
              </Button>
            </Link>
          </div>

          {/* Mobile Navigation */}
          <div className="md:hidden flex items-center space-x-1 flex-1 justify-center">
            <Link href="/dashboard">
              <Button
                variant={location === '/dashboard' ? 'default' : 'ghost'}
                size="sm"
                className="px-2"
              >
                <Home className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/emails-converted">
              <Button
                variant={location === '/emails-converted' ? 'default' : 'ghost'}
                size="sm"
                className="px-2"
              >
                <Mail className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/priority-emails">
              <Button
                variant={location === '/priority-emails' ? 'default' : 'ghost'}
                size="sm"
                className="px-2"
              >
                <Star className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/time-saved">
              <Button
                variant={location === '/time-saved' ? 'default' : 'ghost'}
                size="sm"
                className="px-2"
              >
                <Clock className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/feedback">
              <Button
                variant={location === '/feedback' ? 'default' : 'ghost'}
                size="sm"
                className="px-2"
              >
                <MessageCircle className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          {/* Right side - AI Limit Bar, Upgrade Button, Notifications, Theme Switcher */}
          <div className="flex items-center space-x-1 md:space-x-3">
            {/* AI Tasks Limit Bar - Show on all pages */}
            <AITasksLimitBar />

            <Popover>
              <PopoverTrigger asChild>
                <Button className="relative p-2 rounded-lg glass-card hover:holographic-glow transition-all duration-300" data-testid="button-notifications">
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span
                      className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center pulse-urgent"
                      data-testid="badge-notification-count"
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                <div className="p-4 border-b">
                  <h3 className="font-semibold text-sm">Notifications</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {unreadCount} unread notifications
                  </p>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {activeNotifications.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No notifications yet</p>
                    </div>
                  ) : (
                    activeNotifications.slice(0, 5).map((notification) => {
                      const config = notificationTypeConfig[notification.type as keyof typeof notificationTypeConfig] || notificationTypeConfig.informational;
                      const timeAgo = formatDistanceToNow(new Date(notification.createdAt || new Date()), { addSuffix: true });

                      return (
                        <div
                          key={notification.id}
                          className={`p-3 border-b border-border/50 hover:bg-muted/50 transition-colors ${!notification.isRead ? 'bg-primary/5' : ''}`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <span className={`text-xs font-medium ${config.textColor} uppercase tracking-wide`}>
                              {config.label}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {timeAgo}
                            </span>
                          </div>
                          <h4 className="text-sm font-medium mb-1">
                            {notification.sourceApp}: {notification.title}
                          </h4>
                          <p className="text-xs text-muted-foreground mb-2">
                            {notification.aiSummary || notification.description}
                          </p>
                          <div className="flex space-x-1">
                            <Button
                              onClick={() => handleViewNotification(notification)}
                              className="h-6 px-2 text-xs"
                              variant="ghost"
                              size="sm"
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              View
                            </Button>
                            <Button
                              onClick={() => handleDismiss(notification.id)}
                              disabled={dismissMutation.isPending}
                              className="h-6 px-2 text-xs"
                              variant="ghost"
                              size="sm"
                            >
                              <X className="w-3 h-3 mr-1" />
                              Dismiss
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                {activeNotifications.length > 5 && (
                  <div className="p-2 border-t">
                    <Button variant="ghost" className="w-full text-xs">
                      View all notifications
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            

            {/* Upgrade to Premium Button */}
            <Button
              onClick={() => setIsUpgradeModalOpen(true)}
              className="relative overflow-hidden bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300"
              size="sm"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-orange-400 animate-pulse opacity-20"></div>
              <Crown className="w-4 h-4 md:mr-2" />
              <span className="relative z-10 hidden md:inline">Get More Credits</span>
            </Button>

            {/* Hide theme switcher on mobile */}
            <div className="hidden md:block">
              <ThemeSwitcher />
            </div>
          </div>
        </div>
      </div>

      <UpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
      />
    </header>
  );
}
