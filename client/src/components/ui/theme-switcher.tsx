
import { useState, useEffect } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Theme = 'light' | 'dark' | 'system';

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    // Check if device is mobile
    const isMobile = window.innerWidth < 768;
    
    if (isMobile) {
      // For mobile devices, automatically use system theme
      setTheme('system');
      applyTheme('system');
      
      // Listen for system theme changes on mobile
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleSystemThemeChange = () => {
        applyTheme('system');
      };
      
      mediaQuery.addEventListener('change', handleSystemThemeChange);
      
      return () => {
        mediaQuery.removeEventListener('change', handleSystemThemeChange);
      };
    } else {
      // For desktop, use saved theme or default to dark
      const savedTheme = localStorage.getItem('theme') as Theme;
      if (savedTheme) {
        setTheme(savedTheme);
        applyTheme(savedTheme);
      } else {
        // Default to dark theme
        applyTheme('dark');
      }
    }
  }, []);

  const applyTheme = (newTheme: Theme) => {
    const root = document.documentElement;
    
    if (newTheme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.toggle('dark', systemTheme === 'dark');
      root.classList.toggle('light', systemTheme === 'light');
    } else {
      root.classList.toggle('dark', newTheme === 'dark');
      root.classList.toggle('light', newTheme === 'light');
    }

    if (newTheme === 'light') {
      // Modern light theme with better contrast and softer colors
      root.style.setProperty('--background', 'hsl(0, 0%, 98%)');
      root.style.setProperty('--foreground', 'hsl(224, 71%, 4%)');
      root.style.setProperty('--card', 'hsl(0, 0%, 100%)');
      root.style.setProperty('--card-foreground', 'hsl(224, 71%, 4%)');
      root.style.setProperty('--popover', 'hsl(0, 0%, 100%)');
      root.style.setProperty('--popover-foreground', 'hsl(224, 71%, 4%)');
      root.style.setProperty('--primary', 'hsl(221, 83%, 53%)');
      root.style.setProperty('--primary-foreground', 'hsl(210, 40%, 98%)');
      root.style.setProperty('--secondary', 'hsl(210, 40%, 94%)');
      root.style.setProperty('--secondary-foreground', 'hsl(222, 84%, 4%)');
      root.style.setProperty('--muted', 'hsl(210, 40%, 94%)');
      root.style.setProperty('--muted-foreground', 'hsl(215, 16%, 44%)');
      root.style.setProperty('--accent', 'hsl(210, 40%, 92%)');
      root.style.setProperty('--accent-foreground', 'hsl(222, 84%, 4%)');
      root.style.setProperty('--destructive', 'hsl(0, 72%, 51%)');
      root.style.setProperty('--destructive-foreground', 'hsl(210, 40%, 98%)');
      root.style.setProperty('--border', 'hsl(214, 32%, 88%)');
      root.style.setProperty('--input', 'hsl(214, 32%, 88%)');
      root.style.setProperty('--ring', 'hsl(221, 83%, 53%)');
    } else {
      // Dark theme (default)
      root.style.setProperty('--background', 'hsl(222, 84%, 4%)');
      root.style.setProperty('--foreground', 'hsl(210, 40%, 98%)');
      root.style.setProperty('--card', 'hsl(222, 84%, 6%)');
      root.style.setProperty('--card-foreground', 'hsl(210, 40%, 98%)');
      root.style.setProperty('--popover', 'hsl(222, 84%, 6%)');
      root.style.setProperty('--popover-foreground', 'hsl(210, 40%, 98%)');
      root.style.setProperty('--primary', 'hsl(212, 100%, 47%)');
      root.style.setProperty('--primary-foreground', 'hsl(210, 40%, 98%)');
      root.style.setProperty('--secondary', 'hsl(217, 32%, 17%)');
      root.style.setProperty('--secondary-foreground', 'hsl(210, 40%, 98%)');
      root.style.setProperty('--muted', 'hsl(217, 32%, 12%)');
      root.style.setProperty('--muted-foreground', 'hsl(215, 20%, 65%)');
      root.style.setProperty('--accent', 'hsl(220, 14%, 96%)');
      root.style.setProperty('--accent-foreground', 'hsl(222, 84%, 4%)');
      root.style.setProperty('--destructive', 'hsl(0, 62%, 30%)');
      root.style.setProperty('--destructive-foreground', 'hsl(210, 40%, 98%)');
      root.style.setProperty('--border', 'hsl(217, 32%, 17%)');
      root.style.setProperty('--input', 'hsl(217, 32%, 17%)');
      root.style.setProperty('--ring', 'hsl(212, 100%, 47%)');
    }
  };

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
  };

  const getThemeIcon = () => {
    switch (theme) {
      case 'light':
        return <Sun className="h-4 w-4" />;
      case 'dark':
        return <Moon className="h-4 w-4" />;
      case 'system':
        return <Monitor className="h-4 w-4" />;
      default:
        return <Moon className="h-4 w-4" />;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="glass-effect">
          {getThemeIcon()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleThemeChange('light')}>
          <Sun className="mr-2 h-4 w-4" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleThemeChange('dark')}>
          <Moon className="mr-2 h-4 w-4" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleThemeChange('system')}>
          <Monitor className="mr-2 h-4 w-4" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
