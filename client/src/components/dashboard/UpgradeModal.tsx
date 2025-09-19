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

      const response = await fetch('/api/waitlist/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userEmail,
          plan: 'professional'
        }),
      });

      if (response.ok) {
        setWaitlistJoined(true);
      }
    } catch (error) {
      console.error('Failed to join waitlist:', error);
    } finally {
      setIsJoiningWaitlist(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto upgrade-modal-content">
        <DialogHeader>
          <div className="flex items-center space-x-2">
            <Crown className="w-6 h-6 text-yellow-500" />
            <DialogTitle className="text-2xl bg-gradient-to-r from-yellow-500 to-orange-500 bg-clip-text text-transparent">
              Upgrade to Premium
            </DialogTitle>
          </div>
          <DialogDescription>
            Choose the perfect plan for your productivity needs
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mt-6">
          {/* Free Plan */}
          <div className="border rounded-lg p-6 bg-card hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">Free Plan</h3>
              <Badge variant="secondary">Current</Badge>
            </div>

            <div className="mb-6">
              <div className="text-3xl font-bold mb-2">₹0</div>
              <p className="text-muted-foreground">Perfect for getting started</p>
            </div>

            <ul className="space-y-3 mb-6">
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-green-500" />
                <span>50 AI task conversions/month</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-green-500" />
                <span>Basic email integration</span>
              </li>
            </ul>

            <Button variant="outline" className="w-full" disabled>
              Current Plan
            </Button>
          </div>

          {/* Professional Plan */}
          <div className="border-2 border-gradient-to-r from-yellow-500 to-orange-500 rounded-lg p-6 bg-card hover:shadow-lg transition-all duration-300 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-2 py-1 rounded-bl-lg">
              <span className="text-xs font-medium">POPULAR</span>
            </div>

            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">Professional</h3>
              <Badge className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white">
                Recommended
              </Badge>
            </div>

            <div className="mb-6">
              <div className="text-3xl font-bold mb-2">₹149</div>
              <p className="text-muted-foreground">Per month</p>
            </div>

            <ul className="space-y-3 mb-6">
              <li className="flex items-center space-x-2 group">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <div className="flex items-center space-x-2">
                  <span className="relative text-xl font-bold text-orange-500 golden-shine-text">500</span>
                  <span className="text-lg text-muted-foreground">AI task conversions/month</span>
                </div>
              </li>
              <li className="flex items-center space-x-2 group">
                <Check className="w-4 h-4 text-green-500 group-hover:scale-110 transition-transform" />
                <span className="font-semibold text-orange-600 group-hover:text-orange-500 transition-colors">Priority notifications</span>
              </li>
              <li className="flex items-center space-x-2 group">
                <Check className="w-4 h-4 text-green-500 group-hover:scale-110 transition-transform" />
                <span className="font-semibold text-orange-600 group-hover:text-orange-500 transition-colors">Priority support</span>
              </li>
            </ul>

            {waitlistJoined ? (
              <Button className="w-full bg-green-600 hover:bg-green-700" disabled>
                <Check className="w-4 h-4 mr-2" />
                Joined Waitlist!
              </Button>
            ) : (
              <Button
                className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white"
                onClick={handleJoinWaitlist}
                disabled={isJoiningWaitlist}
              >
                {isJoiningWaitlist ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Joining Waitlist...
                  </>
                ) : (
                  <>
                    Join Waitlist
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>✨ All plans include our core features with different usage limits</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}