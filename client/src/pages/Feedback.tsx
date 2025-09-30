
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Header } from "@/components/dashboard/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Send, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useAuth";

export default function Feedback() {
  const [feedback, setFeedback] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();
  const { user } = useCurrentUser();

  // Submit feedback to Google Forms
  const submitFeedbackMutation = useMutation({
    mutationFn: async (feedbackText: string) => {
      const formData = new FormData();
      // Using the feedback form entry ID for message field
      formData.append('entry.701563353', feedbackText);
      // Add user email if available
      const userEmail = user?.email || 'anonymous@flowhub.com';
      formData.append('entry.1229648205', userEmail);
      // Add timestamp as name field
      formData.append('entry.30482898', `FlowHub User - ${new Date().toLocaleString()}`);

      const response = await fetch('https://docs.google.com/forms/d/e/1FAIpQLScmgrxBPiy2B6U1KEuBZLl_mK6ksc-tlcfrYSrHzlTDHci0lw/formResponse', {
        method: 'POST',
        mode: 'no-cors',
        body: formData
      });
      
      // Since no-cors mode doesn't return response, we assume success
      return { success: true };
    },
    onSuccess: () => {
      setSubmitted(true);
      setFeedback('');
      toast({
        title: "Feedback Sent!",
        description: "Thank you for your feedback. We'll review it and get back to you soon."
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send feedback. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleSubmit = () => {
    if (!feedback.trim()) {
      toast({
        title: "Empty Feedback",
        description: "Please write your feedback before submitting.",
        variant: "destructive"
      });
      return;
    }

    if (feedback.trim().length < 10) {
      toast({
        title: "Feedback Too Short",
        description: "Please provide more detailed feedback (at least 10 characters).",
        variant: "destructive"
      });
      return;
    }

    submitFeedbackMutation.mutate(feedback);
  };

  const handleNewFeedback = () => {
    setSubmitted(false);
    setFeedback('');
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 md:px-6 pt-6 md:pt-8 pb-8">
          <div className="space-y-6">
            {/* Page Header */}
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center space-x-3">
                <MessageCircle className="w-8 h-8 text-primary" />
                <h1 className="text-2xl md:text-3xl font-bold">Feedback</h1>
              </div>
              <p className="text-muted-foreground text-sm md:text-base max-w-2xl mx-auto">
                Help us improve FlowHub by sharing your thoughts, suggestions, or reporting any issues
              </p>
            </div>

            {!submitted ? (
              /* Feedback Form */
              <Card className="max-w-2xl mx-auto">
                <CardHeader>
                  <CardTitle>
                    Share Your Feedback
                  </CardTitle>
                  <CardDescription>
                    Your feedback helps us make FlowHub better for everyone. All feedback is sent directly to our development team.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="feedback" className="text-sm font-medium">
                      Your Feedback
                    </label>
                    <textarea
                      id="feedback"
                      placeholder="Tell us what you think about FlowHub. What features do you love? What could be improved? Any bugs or issues you've encountered?"
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      className="w-full h-32 md:h-40 px-3 py-2 border border-input bg-background rounded-md text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                      maxLength={1000}
                    />
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-muted-foreground">
                        Minimum 10 characters required
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {feedback.length}/1000
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-4">
                    <Button
                      onClick={handleSubmit}
                      disabled={submitFeedbackMutation.isPending || feedback.trim().length < 10}
                      className="flex-1 sm:flex-initial"
                    >
                      {submitFeedbackMutation.isPending ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Send Feedback
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              /* Success State */
              <Card className="max-w-2xl mx-auto border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
                <CardContent className="p-8 text-center">
                  <div className="space-y-4">
                    <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-xl font-semibold text-green-900 dark:text-green-100">
                        Feedback Sent Successfully!
                      </h3>
                      <p className="text-green-800 dark:text-green-200">
                        Thank you for taking the time to share your feedback. Our team will review it and get back to you if needed.
                      </p>
                    </div>
                    <Button
                      onClick={handleNewFeedback}
                      variant="outline"
                      className="mt-4"
                    >
                      Send Another Feedback
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Feedback Guidelines */}
            <div className="max-w-2xl mx-auto space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Feedback Guidelines</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-start space-x-2">
                      <Badge variant="outline" className="text-xs mt-0.5">→</Badge>
                      <p><strong>Feature Requests:</strong> Describe what you'd like to see and how it would help you</p>
                    </div>
                    <div className="flex items-start space-x-2">
                      <Badge variant="outline" className="text-xs mt-0.5">→</Badge>
                      <p><strong>Bug Reports:</strong> Include steps to reproduce the issue and what you expected to happen</p>
                    </div>
                    <div className="flex items-start space-x-2">
                      <Badge variant="outline" className="text-xs mt-0.5">→</Badge>
                      <p><strong>General Feedback:</strong> Share your overall experience and suggestions for improvement</p>
                    </div>
                    <div className="flex items-start space-x-2">
                      <Badge variant="outline" className="text-xs mt-0.5">→</Badge>
                      <p><strong>Privacy:</strong> Your feedback is sent securely and will only be used to improve FlowHub</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
