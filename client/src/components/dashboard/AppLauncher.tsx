import { ExternalLink, Plus, Rocket, Trash2 } from "lucide-react";
import { useUserAppLinks } from "@/hooks/useMetrics";
import { useLocation } from "wouter";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

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

export function AppLauncher() {
  const { data: userAppLinks, isLoading } = useUserAppLinks();
  const [, setLocation] = useLocation();
  const [newUrl, setNewUrl] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  // Ensure userAppLinks is always an array
  const safeUserAppLinks = Array.isArray(userAppLinks) ? userAppLinks : [];

  const launchingApps = new Set(); // Placeholder, assuming it's a Set
  const apps = safeUserAppLinks; // Assuming 'apps' in changes refers to 'safeUserAppLinks'

  const createAppLinkMutation = useMutation({
    mutationFn: async (linkData: { userId: string; name: string; url: string; logo: string }) => {
      return await apiRequest("POST", "/api/user-app-links", linkData);
    },
    onSuccess: async () => {
      // Invalidate and refetch with proper user ID
      await queryClient.invalidateQueries({ queryKey: ["/api/user-app-links"] });
      await queryClient.refetchQueries({ queryKey: ["/api/user-app-links"] });
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
    onSuccess: async () => {
      // Invalidate and refetch with proper query key
      await queryClient.invalidateQueries({ queryKey: ["/api/user-app-links"] });
      await queryClient.refetchQueries({ queryKey: ["/api/user-app-links"] });
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

  const handleAppLaunch = (app: any) => {
    // Launch app in new tab
    window.open(app.url, '_blank');
  };

  const handleAddApp = () => {
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
        userId: "demo-user", // This will be handled by the server auth
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

  const handleRemoveApp = (id: string) => {
    deleteAppLinkMutation.mutate(id);
  };

  if (isLoading) {
    return (
      <div className="glass-card rounded-lg p-2 w-20 h-full animate-in slide-in-from-left-5 duration-700" data-testid="card-app-launcher">
        <div className="animate-pulse space-y-4 px-1">
          <div className="h-4 bg-muted/30 rounded"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-muted/20 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!safeUserAppLinks || safeUserAppLinks.length === 0) {
    return (
      <div className="glass-card rounded-lg p-2 w-20 h-full animate-in slide-in-from-left-5 duration-700 flex flex-col" data-testid="card-app-launcher">
        {/* Fixed Title Section */}
        <div className="mb-3 flex-shrink-0 px-1">
          <h2 className="text-xs font-semibold text-center font-display animate-in fade-in-50 duration-500 delay-200" data-testid="text-section-title">
            <Rocket className="w-4 h-4 mx-auto mb-1 text-primary animate-pulse" />
            Apps
          </h2>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex flex-col space-y-3 flex-1 overflow-y-auto overflow-x-hidden min-h-0 px-1">
          <div className="flex justify-center items-center w-full">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <button
                  className="w-12 h-12 rounded-lg bg-muted/20 hover:bg-primary/10 border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-all duration-300 flex items-center justify-center hover:scale-110 flex-shrink-0"
                  data-testid="button-add-new-app"
                >
                  <Plus className="w-6 h-6 text-muted-foreground hover:text-primary transition-colors" />
                </button>
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
                    onKeyPress={(e) => e.key === 'Enter' && handleAddApp()}
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
                      onClick={handleAddApp}
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

          {/* Bottom text */}
          <div className="text-center text-muted-foreground mt-auto">
            <p className="text-xs">Add apps here</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-lg p-2 w-20 h-full animate-in slide-in-from-left-5 duration-700 flex flex-col" data-testid="card-app-launcher">
      {/* Fixed Title Section */}
      <div className="mb-3 flex-shrink-0 px-1">
        <h2 className="text-xs font-semibold text-center font-display animate-in fade-in-50 duration-500 delay-200" data-testid="text-section-title">
          <Rocket className="w-4 h-4 mx-auto mb-1 text-primary animate-pulse" />
          Apps
        </h2>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex flex-col space-y-3 flex-1 overflow-y-auto overflow-x-hidden min-h-0 px-1">
        {safeUserAppLinks.map((app: any, index: number) => (
          <div
            key={app.id}
            className="relative group animate-in slide-in-from-left-3 duration-500 flex justify-center items-center w-full"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="relative flex justify-center items-center">
              <button
                onClick={() => handleRemoveApp(app.id)}
                className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-destructive/90 hover:bg-destructive rounded-full z-10"
                data-testid={`button-remove-${app.id}`}
              >
                <Trash2 className="w-2 h-2 text-white" />
              </button>

              <button
                onClick={() => handleAppLaunch(app)}
                className="w-12 h-12 rounded-lg border-2 bg-muted/30 hover:bg-muted/50 hover:scale-110 transition-all duration-300 flex items-center justify-center hover:shadow-xl hover:shadow-primary/20 hover:border-primary/50 flex-shrink-0"
                data-testid={`button-app-${app.name.toLowerCase().replace(/\s+/g, '-')}`}
                title={app.name}
              >
                {app.logo ? (
                  <img
                    src={app.logo}
                    alt={app.name}
                    className="w-6 h-6 transition-all duration-300 app-icon object-contain"
                  />
                ) : (
                  <ExternalLink className="text-blue-500 w-6 h-6 transition-all duration-300 flex-shrink-0" />
                )}
              </button>
            </div>
          </div>
        ))}

        {/* Add button at bottom of scrollable area */}
        <div className="flex justify-center items-center w-full">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <button
                className="w-12 h-12 rounded-lg bg-muted/20 hover:bg-primary/10 border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-all duration-300 flex items-center justify-center hover:scale-110 flex-shrink-0"
                data-testid="button-add-new-app"
              >
                <Plus className="w-6 h-6 text-muted-foreground hover:text-primary transition-colors" />
              </button>
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
                  onKeyPress={(e) => e.key === 'Enter' && handleAddApp()}
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
                    onClick={handleAddApp}
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
      </div>
    </div>
  );
}
