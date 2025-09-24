import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Sparkles, Star, X, CheckCircle } from "lucide-react";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
  const [isJoiningWaitlist, setIsJoiningWaitlist] = useState(false);
  const [waitlistJoined, setWaitlistJoined] = useState(false);

  const handleJoinWaitlist = async () => {
    setIsJoiningWaitlist(true);

    try {
      // Get user email from localStorage or use demo email
      const userEmail = localStorage.getItem('userEmail') || 'demo-user@example.com';

      const formData = new FormData();
      // Using the upgrade request form entry ID for email field (1832906040)
      formData.append('entry.1832906040', userEmail);

      await fetch('https://docs.google.com/forms/d/e/[YOUR_UPGRADE_FORM_ID]/formResponse', {
        method: 'POST',
        mode: 'no-cors',
        body: formData
      });

      // Since no-cors mode doesn't return response, we assume success
      setWaitlistJoined(true);
    } catch (error) {
      console.error('Failed to join waitlist:', error);
    } finally {
      setIsJoiningWaitlist(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl w-[95vw] max-w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-3">
          <div className="flex items-center justify-center space-x-2">
            <Crown className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-500" />
            <DialogTitle className="text-lg sm:text-2xl bg-gradient-to-r from-yellow-500 to-orange-500 bg-clip-text text-transparent text-center">
              Upgrade to Premium
            </DialogTitle>
          </div>
          <DialogDescription className="text-center text-sm sm:text-base">
            Choose the perfect plan for your productivity needs
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mt-4 sm:mt-6">
          {/* Free Plan */}
          <div className="border rounded-lg p-4 sm:p-6 bg-card hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h3 className="text-lg sm:text-xl font-semibold">Free Plan</h3>
              <Badge variant="secondary" className="text-xs">Current</Badge>
            </div>

            <div className="mb-4 sm:mb-6">
              <div className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">₹0</div>
              <p className="text-muted-foreground text-sm sm:text-base">Perfect for getting started</p>
            </div>

            <ul className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                <span className="text-sm sm:text-base">50 AI task conversions/month</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                <span className="text-sm sm:text-base">Basic email integration</span>
              </li>
            </ul>

            <Button variant="outline" className="w-full text-sm sm:text-base" disabled>
              Current Plan
            </Button>
          </div>

          {/* Professional Plan */}
          <div className="border-2 border-orange-500 rounded-lg p-4 sm:p-6 bg-card hover:shadow-lg transition-all duration-300 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-2 py-1 rounded-bl-lg">
              <span className="text-xs font-medium">POPULAR</span>
            </div>

            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h3 className="text-lg sm:text-xl font-semibold">Professional</h3>
              <Badge className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white text-xs">
                Recommended
              </Badge>
            </div>

            <div className="mb-4 sm:mb-6">
              <div className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">₹149</div>
              <p className="text-muted-foreground text-sm sm:text-base">Per month</p>
            </div>

            <ul className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
              <li className="flex items-center space-x-2 group">
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 flex-shrink-0" />
                <div className="flex items-center space-x-1 sm:space-x-2">
                  <span className="relative text-lg sm:text-xl font-bold text-orange-500 golden-shine-text">500</span>
                  <span className="text-sm sm:text-base text-muted-foreground">AI task conversions/month</span>
                </div>
              </li>
              <li className="flex items-center space-x-2 group">
                <Check className="w-4 h-4 text-green-500 group-hover:scale-110 transition-transform flex-shrink-0" />
                <span className="font-semibold text-orange-600 group-hover:text-orange-500 transition-colors text-sm sm:text-base">Priority notifications</span>
              </li>
              <li className="flex items-center space-x-2 group">
                <Check className="w-4 h-4 text-green-500 group-hover:scale-110 transition-transform flex-shrink-0" />
                <span className="font-semibold text-orange-600 group-hover:text-orange-500 transition-colors text-sm sm:text-base">Priority support</span>
              </li>
            </ul>

            {waitlistJoined ? (
              <Button className="w-full bg-green-600 hover:bg-green-700 text-sm sm:text-base" disabled>
                <Check className="w-4 h-4 mr-2" />
                Joined Waitlist!
              </Button>
            ) : (
              <Button
                className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white text-sm sm:text-base"
                onClick={handleJoinWaitlist}
                disabled={isJoiningWaitlist}
              >
                {isJoiningWaitlist ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    <span className="hidden sm:inline">Joining Waitlist...</span>
                    <span className="sm:hidden">Joining...</span>
                  </>
                ) : (
                  <>
                    <span className="hidden sm:inline">Join Waitlist</span>
                    <span className="sm:hidden">Join</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 sm:mt-6 text-center text-xs sm:text-sm text-muted-foreground">
          <p>✨ All plans include our core features with different usage limits</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
