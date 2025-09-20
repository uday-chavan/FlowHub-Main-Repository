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
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <span className="text-2xl">{icon}</span>
        </div>
      </CardHeader>
      <CardContent>
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
                </div>
              </CardContent>
            </Card>

            
          </div>
        </div>
      </main>
    </div>
  );
}
