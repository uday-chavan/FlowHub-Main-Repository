import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Zap } from "lucide-react";
import { useCurrentUser } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAITasksLimit } from "@/hooks/useMetrics";
import { useState } from "react";
import * as React from "react";

interface AITasksLimitData {
  withinLimit: boolean;
  currentCount: number;
  limit: number;
  planType: string;
}

export function AITasksLimitBar() {
  const { user } = useCurrentUser();

  const { data: limitData, isLoading } = useQuery<AITasksLimitData>({
    queryKey: ["ai-tasks-limit", user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error("User not found");

      const response = await fetch(`/api/users/${user.id}/ai-tasks-limit`);
      if (!response.ok) throw new Error("Failed to fetch AI tasks limit");
      return response.json();
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const [showUsageModal, setShowUsageModal] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Check if mobile on mount
  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);


  if (isLoading || !limitData) {
    return (
      <div className="w-48 h-6 bg-muted rounded animate-pulse" />
    );
  }

  const percentage = (limitData.currentCount / limitData.limit) * 100;
  const isNearLimit = percentage >= 80;
  const isAtLimit = !limitData.withinLimit;

  // Mobile version - just lightning icon button
  if (isMobile) {
    return (
      <>
        <Button
          onClick={() => setShowUsageModal(true)}
          variant="ghost"
          size="sm"
          className="p-2 h-8 w-8"
          title="AI Usage"
        >
          <Zap className={`h-4 w-4 ${isAtLimit ? "text-red-500" : isNearLimit ? "text-yellow-500" : "text-yellow-500"}`} />
        </Button>

        <Dialog open={showUsageModal} onOpenChange={setShowUsageModal}>
          <DialogContent className="max-w-sm mx-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-500" />
                AI Usage
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {limitData.currentCount} / {limitData.limit}
                </div>
                <div className="text-sm text-muted-foreground">AI tasks this month</div>
              </div>

              <Progress 
                value={percentage} 
                className="h-2"
                indicator-className={isAtLimit ? "bg-red-500" : isNearLimit ? "bg-yellow-500" : "bg-green-500"}
              />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Plan:</span>
                  <span className="font-medium">{limitData.planType.charAt(0).toUpperCase() + limitData.planType.slice(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Remaining:</span>
                  <span className="font-medium">{limitData.limit - limitData.currentCount}</span>
                </div>
              </div>

              {isNearLimit && (
                <div className="text-xs text-yellow-600 bg-yellow-50 p-2 rounded">
                  ⚠️ Approaching monthly limit
                </div>
              )}
              {isAtLimit && (
                <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                  ❌ Monthly limit reached
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Desktop version - full bar
  return (
    <div className="flex flex-col gap-1">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 cursor-help px-3 py-2 rounded-lg bg-background/80 border border-border/50">
              <Zap className="h-3 w-3 text-yellow-500" />
              <span className="text-xs font-medium">AI Tasks</span>
              <Badge variant={isAtLimit ? "destructive" : isNearLimit ? "secondary" : "outline"} className="text-xs px-2 py-0">
                {limitData.currentCount}/{limitData.limit}
              </Badge>
              <div className="w-16">
                <Progress 
                  value={percentage} 
                  className="h-1"
                  indicator-className={isAtLimit ? "bg-red-500" : isNearLimit ? "bg-yellow-500" : "bg-green-500"}
                />
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="space-y-1">
              <p className="font-medium">
                {limitData.currentCount} AI tasks created/converted this month
              </p>
              <p className="text-xs text-muted-foreground">
                Plan: {limitData.planType.charAt(0).toUpperCase() + limitData.planType.slice(1)} 
                ({limitData.limit} tasks/month)
              </p>
              {isNearLimit && (
                <p className="text-xs text-yellow-600">
                  ⚠️ Approaching monthly limit
                </p>
              )}
              {isAtLimit && (
                <p className="text-xs text-red-600">
                  ❌ Monthly limit reached
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {isAtLimit && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            <strong>Monthly AI tasks limit reached!</strong><br />
            Upgrade your plan for more AI task conversions and email processing.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
