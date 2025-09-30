import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Header } from "@/components/dashboard/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/hooks/useAuth";

interface TimeSavedStats {
  totalEmailsConverted: number;
  totalTasksCreatedFromNaturalLanguage: number;
  totalTimeSavedMinutes: number;
  conversionBreakdown: {
    emailConversions: number;
    naturalLanguageConversions: number;
    urgentTasksHandled: number;
    completedTasks: number;
  };
}

function AnimatedCounter({ target, duration = 2000, suffix = "" }: { target: number; duration?: number; suffix?: string }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const startValue = 0;
    
    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const value = Math.floor(startValue + (target - startValue) * easeOutQuart);
      
      setCurrent(value);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }, [target, duration]);

  return (
    <span className="font-mono">
      {current.toLocaleString()}{suffix}
    </span>
  );
}

function StatCard({ 
  title, 
  value, 
  description, 
  icon, 
  color = "bg-blue-50",
  animated = false 
}: { 
  title: string; 
  value: number; 
  description: string; 
  icon: string; 
  color?: string;
  animated?: boolean;
}) {
  return (
    <Card className={`${color} border-l-4 border-l-blue-500 transition-all hover:shadow-lg`}>
      <CardHeader className="pb-3 text-center">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-center">
        <div className="text-3xl font-bold mb-2">
          {animated ? (
            <AnimatedCounter target={value} />
          ) : (
            value.toLocaleString()
          )}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardContent>
    </Card>
  );
}

export default function TimeSaved() {
  const { user } = useCurrentUser();
  
  // Fetch time saved statistics
  const { data: stats, isLoading } = useQuery<TimeSavedStats>({
    queryKey: ['timeSavedStats', user?.id],
    queryFn: async () => {
      const userId = user?.id || 'demo-user';
      const response = await fetch(`/api/analytics/time-saved?userId=${userId}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch time saved statistics');
      }
      return response.json();
    },
    enabled: !!user
  });

  const formatTimeDisplay = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours === 0) {
      return `${remainingMinutes} minutes`;
    } else if (remainingMinutes === 0) {
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    } else {
      return `${hours}h ${remainingMinutes}m`;
    }
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
          <div className="space-y-6 md:space-y-8">
            {/* Page Header */}
            <div className="text-center space-y-4">
              <h1 className="text-2xl md:text-4xl font-bold text-foreground">Time Saved</h1>
              <p className="text-base md:text-xl text-muted-foreground max-w-2xl mx-auto px-4">
                Track your productivity gains through intelligent task automation
              </p>
            </div>

          {/* Main Time Saved Display */}
            <Card className="border">
              <CardContent className="text-center py-8 md:py-12">
                <div className="space-y-6">
                  <h2 className="text-lg md:text-2xl font-medium text-muted-foreground">
                    Total Time Saved
                  </h2>
                  <div className="text-4xl md:text-6xl font-bold text-foreground">
                    <AnimatedCounter 
                      target={stats?.totalTimeSavedMinutes || 0} 
                      duration={3000} 
                    />
                    <span className="text-2xl md:text-3xl text-muted-foreground ml-2">minutes</span>
                  </div>
                  <div className="text-sm md:text-base text-muted-foreground">
                    {formatTimeDisplay(stats?.totalTimeSavedMinutes || 0)}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Detailed Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              <StatCard
                title="Email Conversions"
                value={stats?.totalEmailsConverted || 0}
                description="Emails converted to tasks"
                icon=""
                color="bg-blue-50 border-l-blue-500"
                animated={true}
              />
              
              <StatCard
                title="Tasks Created"
                value={stats?.totalTasksCreatedFromNaturalLanguage || 0}
                description="AI-generated tasks from text"
                icon=""
                color="bg-green-50 border-l-green-500"
                animated={true}
              />
              
              <StatCard
                title="Urgent Tasks Handled"
                value={stats?.conversionBreakdown?.urgentTasksHandled || 0}
                description="High-priority tasks processed"
                icon=""
                color="bg-red-50 border-l-red-500"
                animated={true}
              />
              
              <StatCard
                title="Tasks Completed"
                value={stats?.conversionBreakdown?.completedTasks || 0}
                description="Tasks marked as finished"
                icon=""
                color="bg-purple-50 border-l-purple-500"
                animated={true}
              />
            </div>

            {/* Time Saving Breakdown */}
            <Card className="border">
              <CardHeader>
                <CardTitle className="text-xl md:text-2xl">How You're Saving Time</CardTitle>
                <CardDescription>
                  Breakdown of productivity improvements and time savings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg">Automation Benefits</h3>
                    <div className="space-y-3">
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium">Email → Task Conversion</span>
                          <Badge variant="secondary">2 min/email</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Eliminates manual reading, prioritizing, and converting email content into actionable tasks
                        </p>
                      </div>
                      <div className="p-3 bg-green-50 rounded-lg">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium">AI Task Creation</span>
                          <Badge variant="secondary">1 min/task</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Removes time spent manually writing task descriptions, setting priorities, and estimating durations
                        </p>
                      </div>
                      <div className="p-3 bg-red-50 rounded-lg">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium">Urgent Task Processing</span>
                          <Badge variant="secondary">+3 min bonus</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Prevents escalation delays by auto-detecting urgency and immediate priority escalation vs manual triage
                        </p>
                      </div>
                      <div className="p-3 bg-purple-50 rounded-lg">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium">Task Completion</span>
                          <Badge variant="secondary">1 min/task</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Saves time on manual progress tracking, status updates, and completion workflows
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg">Productivity Insights</h3>
                    <div className="space-y-3">
                      <div className="p-4 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg">
                        <div className="text-2xl font-bold text-foreground">
                          {((stats?.totalTimeSavedMinutes || 0) / 60).toFixed(1)}
                        </div>
                        <div className="text-sm text-muted-foreground">Hours saved total</div>
                      </div>
                      <div className="p-4 bg-gradient-to-r from-green-50 to-purple-50 rounded-lg">
                        <div className="text-2xl font-bold text-foreground">
                          {stats?.totalEmailsConverted + stats?.totalTasksCreatedFromNaturalLanguage || 0}
                        </div>
                        <div className="text-sm text-muted-foreground">Total automations</div>
                      </div>
                    </div>
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
