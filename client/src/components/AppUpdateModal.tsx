
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface AppUpdateModalProps {
  isOpen: boolean;
  onSignInClick: () => void;
}

export function AppUpdateModal({ isOpen, onSignInClick }: AppUpdateModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-md"
        hideCloseButton={true}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <RefreshCw className="w-6 h-6 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-xl font-semibold">
            App Updated!
          </DialogTitle>
          <DialogDescription className="text-center mt-2">
            The app has been updated. Please sign in again to continue using FlowHub with the latest features.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex justify-center mt-6">
          <Button 
            onClick={onSignInClick}
            className="w-full"
            size="lg"
          >
            Sign In Again
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
