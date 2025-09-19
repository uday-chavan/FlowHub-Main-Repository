import { useState, useEffect } from 'react';

interface TextLoopProps {
  messages: string[];
  duration?: number;
  className?: string;
}

export function TextLoop({ messages, duration = 3000, className = '' }: TextLoopProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused || messages.length <= 1) return;

    const interval = setInterval(() => {
      setIsVisible(false);
      
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % messages.length);
        setIsVisible(true);
      }, 300);
    }, duration);

    return () => clearInterval(interval);
  }, [messages, duration, isPaused]);

  // Respect user's motion preferences
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setIsPaused(true);
      setCurrentIndex(0);
    }
  }, []);

  return (
    <div 
      className={`relative ${className}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Static text for screen readers */}
      <span className="sr-only">
        FlowHub helps you: {messages.join(', ')}
      </span>
      
      {/* Fixed height container to prevent shifting */}
      <div className="h-[2.4em] flex items-center justify-center">
        {/* Animated text */}
        <span 
          aria-hidden="true"
          className={`block transition-all duration-300 ease-in-out transform text-center ${
            isVisible 
              ? 'opacity-100 translate-y-0' 
              : 'opacity-0 translate-y-2'
          }`}
        >
          {messages[currentIndex]}
        </span>
      </div>
    </div>
  );
}