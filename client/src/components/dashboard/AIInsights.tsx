import { Brain, AlertTriangle, Lightbulb } from "lucide-react";
import { useAIInsights, useApplyAIInsight, useDismissAIInsight } from "@/hooks/useMetrics";
import { Button } from "@/components/ui/button";

const insightTypeConfig = {
  deadline_alert: {
    icon: AlertTriangle,
    color: "text-accent",
    bgColor: "bg-accent/10",
    borderColor: "border-accent/30",
  },
  workflow_optimization: {
    icon: Lightbulb,
    color: "text-primary",
    bgColor: "bg-primary/10",
    borderColor: "border-primary/30",
  },
  wellness_suggestion: {
    icon: Brain,
    color: "text-secondary",
    bgColor: "bg-secondary/10",
    borderColor: "border-secondary/30",
  },
};

export function AIInsights() {
  const { data: insights, isLoading } = useAIInsights();
  const applyInsightMutation = useApplyAIInsight();
  const dismissInsightMutation = useDismissAIInsight();

  const handleApplyInsight = (insightId: string) => {
    applyInsightMutation.mutate(insightId);
  };

  const handleDismissInsight = (insightId: string) => {
    dismissInsightMutation.mutate(insightId);
  };

  if (isLoading) {
    return (
      <div className="glass-card rounded-lg p-6" data-testid="card-ai-insights">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted/30 rounded w-2/3"></div>
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="h-20 bg-muted/20 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const activeInsights = (Array.isArray(insights) ? insights : []).filter((insight: any) => !insight.isDismissed);

  return (
    <div className="glass-card rounded-lg p-6" data-testid="card-ai-insights">
      <h2 className="text-lg font-semibold mb-4 flex items-center" data-testid="text-ai-insights-title">
        <Brain className="w-5 h-5 mr-2 text-secondary" />
        AI Command Intelligence
      </h2>
      
      <div className="space-y-4">
        {activeInsights.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground" data-testid="text-no-insights">
            <Brain className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No active AI insights at the moment.</p>
            <p className="text-sm mt-2">Your workflow is running smoothly!</p>
          </div>
        ) : (
          activeInsights.map((insight: any) => {
            const config = insightTypeConfig[insight.type as keyof typeof insightTypeConfig] || insightTypeConfig.workflow_optimization;
            const Icon = config.icon;
            
            return (
              <div
                key={insight.id}
                className={`${config.bgColor} border ${config.borderColor} rounded-lg p-4`}
                data-testid={`insight-item-${insight.id}`}
              >
                <div className="flex items-start space-x-3">
                  <Icon className={`${config.color} mt-1 w-5 h-5`} />
                  <div className="flex-1">
                    <h3 className={`font-medium ${config.color}`} data-testid={`insight-title-${insight.id}`}>
                      {insight.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1" data-testid={`insight-description-${insight.id}`}>
                      {insight.description}
                    </p>
                    {insight.actionable && (
                      <div className="flex space-x-2 mt-3">
                        <Button
                          onClick={() => handleApplyInsight(insight.id)}
                          disabled={applyInsightMutation.isPending}
                          className={`${config.bgColor} hover:${config.bgColor}/80 px-3 py-1 rounded text-sm transition-colors`}
                          variant="ghost"
                          data-testid={`button-apply-insight-${insight.id}`}
                        >
                          {applyInsightMutation.isPending ? "Applying..." : "Apply Suggestion"}
                        </Button>
                        <Button
                          onClick={() => handleDismissInsight(insight.id)}
                          disabled={dismissInsightMutation.isPending}
                          className="bg-muted/20 hover:bg-muted/30 px-3 py-1 rounded text-sm transition-colors"
                          variant="ghost"
                          data-testid={`button-dismiss-insight-${insight.id}`}
                        >
                          {dismissInsightMutation.isPending ? "Dismissing..." : "Dismiss"}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
