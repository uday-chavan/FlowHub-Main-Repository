
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Header } from "@/components/dashboard/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronRight, Mail } from "lucide-react";

interface ConvertedEmail {
  id: string;
  title: string;
  description: string;
  sourceApp: string;
  metadata?: {
    emailId?: string;
    from?: string;
    subject?: string;
    convertedAt?: string;
    taskId?: string;
    taskTitle?: string;
    originalContent?: string;
  };
  createdAt: string;
}

export default function EmailsConverted() {
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch converted emails (notifications with email-to-task conversions) with userId for security
  const { data: convertedEmails = [], isLoading } = useQuery({
    queryKey: ['convertedEmails'],
    queryFn: async () => {
      const response = await fetch('/api/notifications', {
        credentials: 'include',
      });
      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/';
          throw new Error('Authentication failed');
        }
        throw new Error('Failed to fetch converted emails');
      }
      const allNotifications = await response.json();
      // Filter for email conversions by metadata flag
      return allNotifications.filter((n: any) => n.metadata?.isEmailConversion === true);
    }
  });

  // Delete selected emails mutation
  const deleteMutation = useMutation({
    mutationFn: async (emailIds: string[]) => {
      const response = await fetch('/api/notifications/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: emailIds })
      });
      if (!response.ok) throw new Error('Failed to delete emails');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['convertedEmails'] });
      setSelectedEmails([]);
    }
  });

  // Retrieve emails back to notification section
  const retrieveMutation = useMutation({
    mutationFn: async (emailIds: string[]) => {
      const response = await fetch('/api/notifications/retrieve-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: emailIds })
      });
      if (!response.ok) throw new Error('Failed to retrieve emails');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['convertedEmails'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setSelectedEmails([]);
    }
  });

  const handleSelectAll = () => {
    if (selectedEmails.length === convertedEmails.length) {
      setSelectedEmails([]);
    } else {
      setSelectedEmails(convertedEmails.map((email: ConvertedEmail) => email.id));
    }
  };

  const handleSelectEmail = (emailId: string) => {
    setSelectedEmails(prev => 
      prev.includes(emailId) 
        ? prev.filter(id => id !== emailId)
        : [...prev, emailId]
    );
  };

  const handleDeleteSelected = () => {
    if (selectedEmails.length > 0) {
      deleteMutation.mutate(selectedEmails);
    }
  };

  const handleRetrieveSelected = () => {
    if (selectedEmails.length > 0) {
      retrieveMutation.mutate(selectedEmails);
    }
  };

  const handleRetrieveIndividual = (emailId: string) => {
    retrieveMutation.mutate([emailId]);
  };

  const handleEmailClick = (emailId: string) => {
    setExpandedEmail(expandedEmail === emailId ? null : emailId);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Header />
        <main className="max-w-7xl mx-auto px-6 pt-8 pb-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 md:px-6 pt-6 md:pt-8 pb-8">
          <div className="space-y-6">
          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">Emails Converted to Tasks</h1>
              <p className="text-muted-foreground mt-2 text-sm md:text-base">
                Track and manage emails that have been successfully converted to actionable tasks
              </p>
            </div>
            <Badge variant="secondary" className="text-sm md:text-lg px-3 md:px-4 py-1 md:py-2 self-start sm:self-auto">
              {convertedEmails.length} Total Conversions
            </Badge>
          </div>

          {/* Bulk Actions */}
          {convertedEmails.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center space-x-4">
                    <Checkbox
                      checked={selectedEmails.length === convertedEmails.length}
                      onCheckedChange={handleSelectAll}
                    />
                    <span className="text-sm">
                      {selectedEmails.length === 0 
                        ? "Select all emails" 
                        : `${selectedEmails.length} of ${convertedEmails.length} selected`
                      }
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRetrieveSelected}
                      disabled={selectedEmails.length === 0 || retrieveMutation.isPending}
                      className="text-xs sm:text-sm"
                    >
                      {retrieveMutation.isPending ? "Retrieving..." : 
                        selectedEmails.length > 0 ? `Retrieve Selected (${selectedEmails.length})` : "Retrieve Selected"
                      }
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDeleteSelected}
                      disabled={selectedEmails.length === 0 || deleteMutation.isPending}
                      className="text-xs sm:text-sm"
                    >
                      {deleteMutation.isPending ? "Deleting..." : 
                        selectedEmails.length > 0 ? `Delete Selected (${selectedEmails.length})` : "Delete Selected"
                      }
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Converted Emails List */}
          <div className="space-y-2">
            {convertedEmails.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <div className="text-6xl mb-4">📬</div>
                  <h3 className="text-xl font-semibold mb-2">No Converted Emails Yet</h3>
                  <p className="text-muted-foreground">
                    Start converting emails to tasks to see them listed here. 
                    They'll be automatically moved from your notification feed once converted.
                  </p>
                </CardContent>
              </Card>
            ) : (
              convertedEmails.map((email: ConvertedEmail) => {
                const isExpanded = expandedEmail === email.id;
                const subject = email.metadata?.subject || email.metadata?.taskTitle || email.title;
                const from = email.metadata?.from || "Unknown Sender";
                const convertedAt = formatDate(email.metadata?.convertedAt || email.createdAt);
                
                return (
                  <Card key={email.id} className="transition-all hover:shadow-md border dark:border-gray-700">
                    {/* Narrow Email Header */}
                    <div 
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => handleEmailClick(email.id)}
                    >
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <Checkbox
                          checked={selectedEmails.includes(email.id)}
                          onCheckedChange={() => handleSelectEmail(email.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        
                        <Mail className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm truncate">
                            {subject}
                          </h3>
                          <p className="text-xs text-muted-foreground truncate">
                            From: {from} → Converted to: {email.metadata?.taskTitle || "Task"}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2 flex-shrink-0">
                        <Badge variant="outline" className="text-xs">
                          system
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {convertedAt}
                        </span>
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="border-t dark:border-gray-700 bg-muted/20">
                        <div className="p-4 space-y-4">
                          {/* Email Content Section */}
                          <div>
                            <h4 className="text-sm font-medium text-muted-foreground mb-2">Email Content:</h4>
                            <div className="bg-background/50 p-3 rounded border">
                              <p className="text-sm whitespace-pre-wrap">
                                {email.metadata?.originalContent || email.description}
                              </p>
                            </div>
                          </div>

                          {/* Task Details Section */}
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium text-muted-foreground">Task Details:</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="text-xs font-medium text-muted-foreground">Title:</label>
                                <p className="text-sm">{email.metadata?.taskTitle || "N/A"}</p>
                              </div>
                              <div>
                                <label className="text-xs font-medium text-muted-foreground">Status:</label>
                                <p className="text-sm">pending</p>
                              </div>
                            </div>
                          </div>

                          {/* Task Status Badge */}
                          {email.metadata?.taskId && (
                            <div className="pt-2 border-t">
                              <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">
                                ✅ Converted to Task #{email.metadata.taskId.slice(-8)}
                              </Badge>
                            </div>
                          )}

                          {/* Individual Actions */}
                          <div className="pt-3 border-t flex space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRetrieveIndividual(email.id)}
                              disabled={retrieveMutation.isPending}
                              className="text-xs"
                            >
                              Retrieve to Notifications
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => deleteMutation.mutate([email.id])}
                              disabled={deleteMutation.isPending}
                              className="text-xs"
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        </div>
      </div>
      </main>
    </div>
  );
}
