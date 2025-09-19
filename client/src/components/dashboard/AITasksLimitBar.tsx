import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Zap } from "lucide-react";
import { useCurrentUser } from "@/hooks/useAuth";

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

  if (isLoading || !limitData) {
    return (
      <div className="w-48 h-6 bg-muted rounded animate-pulse" />
    );
  }

  const percentage = (limitData.currentCount / limitData.limit) * 100;
  const isNearLimit = percentage >= 80;
  const isAtLimit = !limitData.withinLimit;

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