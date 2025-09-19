
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Zap, Brain, Calendar, BarChart3, Shield, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextLoop } from "@/components/TextLoop";

export function Intro() {
  const [, setLocation] = useLocation();
  const [isVisible, setIsVisible] = useState(false);

  const benefits = [
    "Turn chaos into clarity",
    "AI handles your inbox", 
    "Smart scheduling, zero effort",
    "Never miss a deadline again",
    "Focus on what truly matters",
    "Your personal productivity AI"
  ];

  const features = [
    {
      icon: Brain,
      title: "AI-Powered Intelligence",
      description: "Advanced email analysis and smart task creation using Google Gemini AI",
      color: "from-blue-500 to-cyan-500"
    },
    {
      icon: Calendar,
      title: "Intelligent Auto-Scheduling",
      description: "Automatically reschedule and prioritize tasks based on deadlines and importance",
      color: "from-purple-500 to-pink-500"
    },
    {
      icon: Zap,
      title: "Real-Time Workflow Sync",
      description: "Seamlessly connect Gmail, Slack, and calendar for unified productivity",
      color: "from-green-500 to-emerald-500"
    },
    {
      icon: BarChart3,
      title: "Executive Analytics",
      description: "Comprehensive insights and performance tracking for data-driven decisions",
      color: "from-orange-500 to-red-500"
    }
  ];

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 300);
    return () => clearTimeout(timer);
  }, []);

  const handleGetStarted = () => {
    setIsVisible(false);
    setTimeout(() => {
      setLocation("/app-links");
    }, 400);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 relative overflow-hidden">
      {/* Enhanced Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Premium gradient orbs */}
        <div className="absolute top-1/4 -left-40 w-80 h-80 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-1/3 -right-40 w-96 h-96 bg-gradient-to-br from-cyan-500/15 to-indigo-500/15 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '6s', animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-br from-violet-500/10 to-pink-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s', animationDelay: '2s' }} />
        
        {/* Floating light particles */}
        {[...Array(30)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white/30 rounded-full animate-float"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 4}s`,
              animationDuration: `${4 + Math.random() * 6}s`
            }}
          />
        ))}
        
        {/* Premium grid overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)`,
          backgroundSize: '50px 50px'
        }} />
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 text-center max-w-7xl mx-auto">
        <div className={`transition-all duration-1000 transform ${
          isVisible ? 'translate-y-0 opacity-100' : 'translate-y-16 opacity-0'
        }`}>
          
          {/* Enhanced FlowHub Logo with Premium Light Animation */}
          <div className="mb-3">
            <h1 className="text-7xl md:text-8xl lg:text-9xl font-extralight text-white leading-none tracking-tight relative">
              <span className="relative inline-block">
                FlowHub
                {/* Inner flowing light effect */}
                <div 
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-80"
                  style={{
                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.8) 50%, transparent 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'flowingLight 3s ease-in-out infinite',
                    maskImage: 'linear-gradient(to right, transparent 10%, black 30%, black 70%, transparent 90%)',
                    WebkitMaskImage: 'linear-gradient(to right, transparent 10%, black 30%, black 70%, transparent 90%)'
                  }} 
                />
                {/* Premium holographic glow */}
                <div className="absolute inset-0 bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent animate-pulse opacity-90" />
                {/* Outer shimmer ring */}
                <div 
                  className="absolute -inset-2 bg-gradient-to-r from-transparent via-blue-400/40 to-transparent opacity-60 blur-sm"
                  style={{
                    background: 'linear-gradient(90deg, transparent 0%, rgba(59, 130, 246, 0.6) 30%, rgba(147, 51, 234, 0.6) 50%, rgba(6, 182, 212, 0.6) 70%, transparent 100%)',
                    backgroundSize: '400% 100%',
                    animation: 'outerGlow 5s ease-in-out infinite 0.5s'
                  }} 
                />
              </span>
            </h1>
          </div>

          {/* Enhanced Animated Benefits */}
          <div className="mb-3">
            <TextLoop 
              messages={benefits}
              duration={2500}
              className="text-4xl md:text-5xl lg:text-6xl font-light text-white/95 leading-tight tracking-tight min-h-[1.3em] flex items-center justify-center"
            />
          </div>

          {/* Premium Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16 max-w-6xl mx-auto">
            {features.map((feature, index) => (
              <div
                key={index}
                className="group relative p-8 rounded-3xl bg-white/[0.02] backdrop-blur-md border border-white/10 hover:bg-white/[0.08] hover:border-white/20 transition-all duration-500 cursor-pointer hover:scale-105 hover:shadow-2xl"
                style={{ 
                  animationDelay: `${index * 150}ms`,
                  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)'
                }}
              >
                {/* Feature icon with gradient background */}
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-r ${feature.color} p-0.5 mb-6 mx-auto group-hover:scale-110 transition-transform duration-300`}>
                  <div className="w-full h-full rounded-2xl bg-slate-900/90 flex items-center justify-center">
                    <feature.icon className="w-8 h-8 text-white group-hover:scale-110 transition-transform duration-300" />
                  </div>
                </div>
                
                <h3 className="text-xl font-semibold text-white mb-4 group-hover:text-blue-100 transition-colors">{feature.title}</h3>
                <p className="text-sm text-white/70 leading-relaxed group-hover:text-white/85 transition-colors">{feature.description}</p>
                
                {/* Hover glow effect */}
                <div className={`absolute inset-0 rounded-3xl bg-gradient-to-r ${feature.color} opacity-0 group-hover:opacity-10 transition-opacity duration-500 -z-10`} />
              </div>
            ))}
          </div>

          {/* Enhanced CTA Section with Professional Focus */}
          <div className="space-y-8">
            <div className="text-center space-y-4">
              <h2 className="text-2xl md:text-3xl font-semibold text-white mb-2 flex items-center justify-center gap-3">
                <Sparkles className="w-8 h-8 text-blue-400 animate-pulse" />
                Ready to revolutionize your workflow?
                <Sparkles className="w-8 h-8 text-purple-400 animate-pulse" style={{ animationDelay: '0.5s' }} />
              </h2>
              <p className="text-lg text-white/80 font-medium">Join thousands of professionals who've transformed their productivity</p>
              <p className="text-sm text-white/60">Secure OAuth integration • Setup takes less than 60 seconds</p>
            </div>

            {/* Premium CTA Button */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button
                onClick={handleGetStarted}
                className="relative bg-gradient-to-r from-blue-600 via-purple-600 to-blue-700 hover:from-blue-700 hover:via-purple-700 hover:to-blue-800 text-white px-16 py-7 text-xl font-semibold rounded-2xl transition-all duration-500 group hover:scale-105 border-0 overflow-hidden shadow-2xl hover:shadow-blue-500/30"
                data-testid="button-get-started"
              >
                {/* Premium shimmer effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                {/* Button inner glow */}
                <div className="absolute inset-0 bg-gradient-to-r from-blue-400/30 via-purple-400/30 to-blue-400/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm" />
                <span className="relative z-10 flex items-center gap-4">
                  <Shield className="w-6 h-6" />
                  Sign In with Google
                  <ArrowRight className="w-6 h-6 transition-transform group-hover:translate-x-2 group-hover:scale-110" />
                </span>
              </Button>
            </div>

            {/* Secondary Actions */}
            <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
              <button
                onClick={handleGetStarted}
                className="text-white/80 hover:text-blue-300 underline underline-offset-4 hover:underline-offset-8 transition-all duration-300 text-base font-medium group flex items-center gap-2"
              >
                <Zap className="w-4 h-4 group-hover:scale-110 transition-transform" />
                View Live Demo
              </button>
              <span className="hidden sm:block text-white/40 text-lg">•</span>
              <button
                onClick={handleGetStarted}
                className="text-white/80 hover:text-purple-300 underline underline-offset-4 hover:underline-offset-8 transition-all duration-300 text-base font-medium group flex items-center gap-2"
              >
                <Brain className="w-4 h-4 group-hover:scale-110 transition-transform" />
                See How It Works
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced CSS for premium animations */}
      <style jsx>{`
        @keyframes flowingLight {
          0% {
            transform: translateX(-100%) scale(0.8);
            opacity: 0;
          }
          30% {
            opacity: 0.8;
            transform: translateX(-20%) scale(1);
          }
          70% {
            opacity: 0.8;
            transform: translateX(20%) scale(1);
          }
          100% {
            transform: translateX(100%) scale(0.8);
            opacity: 0;
          }
        }
        
        @keyframes outerGlow {
          0% {
            transform: translateX(-150%);
            opacity: 0;
          }
          30% {
            opacity: 0.6;
          }
          70% {
            opacity: 0.6;
          }
          100% {
            transform: translateX(150%);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
