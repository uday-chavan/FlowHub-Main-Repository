import { Gauge, Target, Clock, TrendingUp } from "lucide-react";
import { useMetrics } from "@/hooks/useMetrics";

export function RealTimeMetrics() {
  const { data: metrics, isLoading } = useMetrics();

  if (isLoading) {
    return (
      <div className="glass-card rounded-lg p-6" data-testid="card-metrics">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted/30 rounded w-2/3"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-8 bg-muted/20 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const workloadCapacity = metrics?.workloadCapacity || 0;
  const stressLevel = metrics?.stressLevel || "low";
  const todayProgress = metrics?.todayProgress || 0;
  const tasksCompleted = metrics?.tasksCompleted || 0;
  const activeHours = metrics?.activeHours || 0;

  const getStressColor = (level: string) => {
    switch (level) {
      case "high":
        return "text-destructive";
      case "medium":
        return "text-accent";
      default:
        return "text-green-400";
    }
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 80) return "from-green-400 to-emerald-500";
    if (percentage >= 60) return "from-primary to-secondary";
    return "from-accent to-yellow-400";
  };

  return (
    <div className="glass-card rounded-lg p-6" data-testid="card-metrics">
      <h2 className="text-lg font-semibold mb-4 flex items-center font-display" data-testid="text-metrics-title">
        <Gauge className="w-5 h-5 mr-2 text-green-400" />
        Metrics
      </h2>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Workload Capacity</span>
          <div className="flex items-center space-x-2">
            <div className="w-16 bg-muted/30 rounded-full h-2">
              <div 
                className="bg-gradient-to-r from-green-400 to-accent h-2 rounded-full transition-all duration-500"
                style={{ width: `${workloadCapacity}%` }}
                data-testid="progress-workload-capacity"
              />
            </div>
            <span className="text-sm font-medium" data-testid="text-workload-capacity">
              {workloadCapacity}%
            </span>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Stress Level</span>
          <div className="flex items-center space-x-2">
            <div className="w-16 bg-muted/30 rounded-full h-2">
              <div 
                className={`bg-gradient-to-r ${stressLevel === "high" ? "from-destructive to-red-400" : stressLevel === "medium" ? "from-accent to-yellow-400" : "from-green-400 to-emerald-500"} h-2 rounded-full transition-all duration-500`}
                style={{ width: `${stressLevel === "high" ? 80 : stressLevel === "medium" ? 50 : 30}%` }}
                data-testid="progress-stress-level"
              />
            </div>
            <span className={`text-sm font-medium capitalize ${getStressColor(stressLevel)}`} data-testid="text-stress-level">
              {stressLevel}
            </span>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Today's Progress</span>
          <div className="flex items-center space-x-2">
            <div className="w-16 bg-muted/30 rounded-full h-2">
              <div 
                className={`bg-gradient-to-r ${getProgressColor(todayProgress)} h-2 rounded-full transition-all duration-500`}
                style={{ width: `${todayProgress}%` }}
                data-testid="progress-today-progress"
              />
            </div>
            <span className="text-sm font-medium" data-testid="text-today-progress">
              {todayProgress}%
            </span>
          </div>
        </div>

        <div className="border-t border-border/50 pt-4">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-primary" data-testid="text-tasks-completed">
                {tasksCompleted}
              </div>
              <div className="text-xs text-muted-foreground">Tasks Done</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-secondary" data-testid="text-active-hours">
                {activeHours.toFixed(1)}h
              </div>
              <div className="text-xs text-muted-foreground">Active Time</div>
            </div>
          </div>
        </div>

        <div className="pt-2">
          <div className="grid grid-cols-1 gap-2 text-sm">
            <div className="flex items-center justify-between p-2 rounded bg-muted/10">
              <div className="flex items-center space-x-2">
                <Target className="w-4 h-4 text-primary" />
                <span>Productivity Score</span>
              </div>
              <span className="font-medium text-primary" data-testid="text-productivity-score">
                {Math.round((todayProgress + (100 - (stressLevel === "high" ? 70 : stressLevel === "medium" ? 30 : 10))) / 2)}
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-muted/10">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-accent" />
                <span>Avg. Task Time</span>
              </div>
              <span className="font-medium text-accent" data-testid="text-avg-task-time">
                {tasksCompleted > 0 ? Math.round((activeHours * 60) / tasksCompleted) : 0}m
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}