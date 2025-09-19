import { TrendingUp, Coffee, Focus } from "lucide-react";
import { useMetrics, useWellnessInsights } from "@/hooks/useMetrics";
import { Button } from "@/components/ui/button";

export function WellnessPanel() {
  const { data: metrics } = useMetrics();
  const wellnessInsights = useWellnessInsights();

  const handleStartBreak = () => {
    // Implementation for starting a micro-break
    // Start micro-break implementation
  };

  const handleEnterFlowMode = () => {
    // Implementation for entering deep focus mode
    // Enter flow mode implementation
  };

  const handleGenerateInsights = () => {
    wellnessInsights.mutate();
  };

  const focusScore = metrics?.focusScore || 0;
  const nextBreakIn = metrics?.nextBreakIn || 25;

  return (
    <div className="glass-card rounded-lg p-6" data-testid="card-wellness-panel">
      <h2 className="text-lg font-semibold mb-4 flex items-center" data-testid="text-wellness-title">
        <TrendingUp className="w-5 h-5 mr-2 text-accent" />
        Performance Optimization
      </h2>
      <div className="space-y-4">
        <div className="floating-metric rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Focus Score</span>
            <span className="text-lg font-bold text-green-400" data-testid="text-focus-score">
              {focusScore}%
            </span>
          </div>
          <div className="w-full bg-muted/30 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-green-400 to-emerald-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${focusScore}%` }}
              data-testid="progress-focus-score"
            />
          </div>
        </div>
        
        <div className="bg-secondary/10 border border-secondary/30 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Next Break</span>
            <span className="text-sm text-secondary" data-testid="text-next-break">
              in {nextBreakIn} min
            </span>
          </div>
          <Button
            onClick={handleStartBreak}
            className="w-full bg-secondary/20 hover:bg-secondary/30 rounded-lg py-2 text-sm transition-colors"
            variant="ghost"
            data-testid="button-start-break"
          >
            <Coffee className="w-4 h-4 mr-2" />
            Start Micro-Break
          </Button>
        </div>
        
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Flow Mode</span>
            <span className="text-sm text-primary">Available</span>
          </div>
          <Button
            onClick={handleEnterFlowMode}
            className="w-full bg-primary/20 hover:bg-primary/30 rounded-lg py-2 text-sm transition-colors"
            variant="ghost"
            data-testid="button-enter-flow"
          >
            <Focus className="w-4 h-4 mr-2" />
            Enter Deep Focus
          </Button>
        </div>

        <Button
          onClick={handleGenerateInsights}
          disabled={wellnessInsights.isPending}
          className="w-full mt-4"
          variant="outline"
          data-testid="button-generate-insights"
        >
          {wellnessInsights.isPending ? "Analyzing..." : "Generate AI Insights"}
        </Button>
      </div>
    </div>
  );
}
