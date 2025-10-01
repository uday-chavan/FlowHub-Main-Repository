import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Header } from "@/components/dashboard/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, User, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";

interface PriorityEmail {
  id: string;
  email: string;
  addedAt: string;
}

export default function PriorityEmails() {
  const [newEmail, setNewEmail] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch priority emails
  const { data: priorityEmails = [], isLoading } = useQuery({
    queryKey: ['priorityEmails'],
    queryFn: async () => {
      const response = await fetch('/api/priority-emails', {
        credentials: 'include',
      });
      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/';
          throw new Error('Authentication failed');
        }
        throw new Error('Failed to fetch priority emails');
      }
      return response.json();
    }
  });

  // Add priority email mutation
  const addEmailMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await fetch('/api/priority-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email })
      });
      if (!response.ok) throw new Error('Failed to add priority email');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['priorityEmails'] });
      setNewEmail('');
      toast({
        title: "Success",
        description: "Priority email added successfully"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add priority email",
        variant: "destructive"
      });
    }
  });

  // Delete priority email mutation
  const deleteEmailMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/priority-emails/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete priority email');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['priorityEmails'] });
      toast({
        title: "Success",
        description: "Priority email removed successfully"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove priority email",
        variant: "destructive"
      });
    }
  });

  const handleAddEmail = () => {
    if (!newEmail.trim()) return;

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
        variant: "destructive"
      });
      return;
    }

    // Check if email already exists
    if (priorityEmails.some((pe: PriorityEmail) => pe.email.toLowerCase() === newEmail.toLowerCase())) {
      toast({
        title: "Email Already Exists",
        description: "This email is already in your priority list",
        variant: "destructive"
      });
      return;
    }

    addEmailMutation.mutate(newEmail);
  };

  const handleDeleteEmail = (id: string) => {
    deleteEmailMutation.mutate(id);
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
                <h1 className="text-2xl md:text-3xl font-bold">Priority Email Contacts</h1>
                <p className="text-muted-foreground mt-2 text-sm md:text-base">
                  Add email addresses that should always be marked as urgent priority
                </p>
              </div>
              <Badge variant="secondary" className="text-sm md:text-lg px-3 md:px-4 py-1 md:py-2 self-start sm:self-auto">
                {priorityEmails.length} Priority Contacts
              </Badge>
            </div>

            {/* Add New Email Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="w-5 h-5" />
                  Add Priority Email
                </CardTitle>
                <CardDescription>
                  Emails from these addresses will automatically be marked as urgent
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Input
                    type="email"
                    placeholder="Enter email address (e.g., boss@company.com)"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddEmail()}
                    className="flex-1"
                  />
                  <Button 
                    onClick={handleAddEmail}
                    disabled={addEmailMutation.isPending || !newEmail.trim()}
                    className="sm:w-auto"
                  >
                    {addEmailMutation.isPending ? 'Adding...' : 'Add Email'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Priority Emails List */}
            <div className="space-y-3">
              {priorityEmails.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <div className="space-y-2 text-center">
                      <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                      </div>
                      <h3 className="text-xl font-semibold">No Priority Emails Yet</h3>
                      <p className="text-muted-foreground">
                        Add email addresses above to automatically mark their emails as urgent priority.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                priorityEmails.map((priorityEmail: PriorityEmail) => (
                  <Card key={priorityEmail.id} className="transition-all hover:shadow-md">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                          <div className="relative">
                            <User className="w-8 h-8 text-blue-500" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm md:text-base truncate">
                              {priorityEmail.email}
                            </p>
                            {/* Date display removed */}
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 flex-shrink-0">
                          <Badge className="text-xs bg-red-500 text-white border-red-500 hover:bg-red-600">
                            Priority Person
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteEmail(priorityEmail.id)}
                            disabled={deleteEmailMutation.isPending}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {/* Info Card */}
            <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
              <CardContent className="p-4">
                <div className="flex items-start space-x-3">
                  <div className="text-blue-500 mt-0.5">ℹ️</div>
                  <div className="space-y-2 w-full">
                    <Collapsible>
                      <CollapsibleTrigger className="flex items-center justify-between w-full text-left">
                        <h4 className="font-medium text-blue-900 dark:text-blue-100 text-lg">
                          How Priority Emails Work?
                        </h4>
                        <ChevronDown className="h-5 w-5 text-blue-900 dark:text-blue-100 transition-transform duration-200" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-4">
                        <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                          <p>• Emails from these addresses will automatically be marked as <strong>urgent priority</strong></p>
                          <p>• They will appear with a <strong>"Priority Person"</strong> corner sticker</p>
                          <p>• These emails will be sorted to the top of your urgent notifications</p>
                          <p>• You can remove contacts anytime by clicking the trash icon</p>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
