import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Plus, ExternalLink, ArrowRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface AppLink {
  id: string;
  name: string;
  url: string;
  logo: string;
}

const APP_LOGOS: Record<string, string> = {
  'linkedin': 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/linkedin.svg',
  'gmail': 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/gmail.svg',
  'slack': 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/slack.svg',
  'trello': 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/trello.svg',
  'notion': 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/notion.svg',
  'jira': 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/jira.svg',
  'zoom': 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/zoom.svg',
  'github': 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/github.svg',
  'google': 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/google.svg',
  'microsoft': 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/microsoft.svg',
  'outlook': 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/microsoftoutlook.svg',
  'calendar': 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/googlecalendar.svg',
  'drive': 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/googledrive.svg',
  'dropbox': 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/dropbox.svg',
  'asana': 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/asana.svg',
  'monday': 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/mondaydotcom.svg',
};

function detectAppFromUrl(url: string): { name: string; logo: string } {
  const domain = url.toLowerCase();

  for (const [key, logo] of Object.entries(APP_LOGOS)) {
    if (domain.includes(key)) {
      return { 
        name: key.charAt(0).toUpperCase() + key.slice(1), 
        logo 
      };
    }
  }

  // Default fallback
  return { 
    name: new URL(url).hostname.replace('www.', ''), 
    logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/link.svg' 
  };
}

export default function AppLinks() {
  const [, setLocation] = useLocation();
  const [newUrl, setNewUrl] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: appLinks = [] } = useQuery({
    queryKey: ["/api/user-app-links", "demo-user"],
    queryFn: () => fetch("/api/user-app-links?userId=demo-user").then(res => res.json()),
  });

  const createAppLinkMutation = useMutation({
    mutationFn: async (linkData: { userId: string; name: string; url: string; logo: string }) => {
      return await apiRequest("POST", "/api/user-app-links", linkData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-app-links", "demo-user"] });
      setIsDialogOpen(false);
      setNewUrl("");
      toast({
        title: "Success",
        description: "App link added successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add app link. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteAppLinkMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/user-app-links/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-app-links", "demo-user"] });
      toast({
        title: "Removed",
        description: "App link removed successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove app link. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAddLink = () => {
    if (!newUrl.trim()) {
      toast({
        title: "Error",
        description: "Please enter a valid URL",
        variant: "destructive",
      });
      return;
    }

    try {
      // Ensure URL has protocol
      let formattedUrl = newUrl.trim();
      if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
        formattedUrl = 'https://' + formattedUrl;
      }

      const { name, logo } = detectAppFromUrl(formattedUrl);

      createAppLinkMutation.mutate({
        userId: "demo-user",
        name,
        url: formattedUrl,
        logo,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Invalid URL format",
        variant: "destructive",
      });
    }
  };

  const handleRemoveLink = (id: string) => {
    deleteAppLinkMutation.mutate(id);
  };

  const handleOpenLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleEnterWorkplace = () => {
    setLocation("/landing");
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">Your Workflow Apps</h1>
          <p className="text-muted-foreground text-lg mb-8">
            Add links to your favorite workplace apps for quick access
          </p>
        </div>

        {/* Add New Link Dialog */}
        <div className="flex justify-center mb-8">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                size="lg" 
                className="bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                data-testid="button-add-app-link"
              >
                <Plus className="w-5 h-5 mr-2" />
                Add App Link
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add New App Link</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <Input
                  placeholder="Enter app URL (e.g., linkedin.com, gmail.com)"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddLink()}
                  data-testid="input-app-url"
                />
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    className="flex-1"
                    data-testid="button-cancel-add"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddLink}
                    className="flex-1"
                    data-testid="button-save-app-link"
                  >
                    Add Link
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* App Links Grid */}
        {appLinks.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 mb-12">
            {appLinks.map((link: AppLink) => (
              <Card key={link.id} className="group hover:shadow-lg transition-all duration-300 cursor-pointer">
                <CardContent className="p-6 text-center relative">
                  <button
                    onClick={() => handleRemoveLink(link.id)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded"
                    data-testid={`button-remove-${link.id}`}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </button>

                  <div 
                    className="w-16 h-16 mx-auto mb-3 bg-muted rounded-xl flex items-center justify-center cursor-pointer hover:bg-primary/10 transition-colors"
                    onClick={() => handleOpenLink(link.url)}
                    data-testid={`app-icon-${link.id}`}
                  >
                    <img 
                      src={link.logo} 
                      alt={link.name}
                      className="w-8 h-8 object-contain app-icon-light"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/link.svg';
                      }}
                    />
                  </div>

                  <h3 className="font-medium text-sm mb-2" data-testid={`app-name-${link.id}`}>
                    {link.name}
                  </h3>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenLink(link.url)}
                    className="text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    data-testid={`button-open-${link.id}`}
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Open
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 mb-12">
            <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
              <Plus className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No apps added yet</h3>
            <p className="text-muted-foreground mb-6">
              Add your first workplace app link to get started
            </p>
          </div>
        )}

        {/* Enter Workplace Button */}
        <div className="text-center">
          <Button
            onClick={handleEnterWorkplace}
            size="lg"
            className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground px-8 py-4 text-lg font-semibold hover:from-primary/90 hover:to-primary/70 transition-all duration-300 group"
            data-testid="button-enter-workplace"
          >
            Enter Your Workplace
            <ArrowRight className="ml-2 w-5 h-5 transition-transform group-hover:translate-x-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}