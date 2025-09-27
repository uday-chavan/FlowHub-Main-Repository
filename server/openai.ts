// Remove unused fs import
import { GoogleGenAI, Modality } from "@google/genai";

// This API key is from Gemini Developer API Key, not vertex AI API Key
let ai: GoogleGenAI | null = null;

if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

export interface NotificationAnalysis {
  priority: "urgent" | "important" | "informational";
  summary: string;
  actionableInsights: string[];
  estimatedTimeToHandle: number;
  suggestedActions: string[];
}

export interface WorkflowOptimization {
  suggestions: {
    type: "reorder" | "batch" | "delegate" | "postpone";
    description: string;
    estimatedTimeSaving: number;
    confidence: number;
  }[];
  optimizedSchedule: {
    taskId: string;
    suggestedStartTime: string;
    reason: string;
  }[];
}

// Note that the newest Gemini model series is "gemini-2.5-flash" or gemini-2.5-pro"
export async function analyzeNotification(
  title: string,
  content: string,
  sourceApp: string
): Promise<NotificationAnalysis> {
  // If AI is not available, return basic analysis
  if (!ai) {
    const priority = content.toLowerCase().includes("urgent") || title.toLowerCase().includes("urgent")
      ? "urgent" : "important";
    return {
      priority: priority as any,
      summary: `${sourceApp}: ${title}`,
      actionableInsights: ["Review notification", "Take appropriate action"],
      estimatedTimeToHandle: 10,
      suggestedActions: ["Read content", "Respond if needed"]
    };
  }

  try {
    const systemPrompt = `You are an executive assistant AI analyzing workplace notifications for a corporate command center.
    Analyze the notification and provide priority classification, summary, and actionable insights.
    Consider business context, urgency indicators, and deadline implications.
    Respond with JSON in this exact format: {
      "priority": "urgent|important|informational",
      "summary": "concise summary in 1-2 sentences",
      "actionableInsights": ["insight1", "insight2"],
      "estimatedTimeToHandle": number_in_minutes,
      "suggestedActions": ["action1", "action2"]
    }`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            priority: { type: "string" },
            summary: { type: "string" },
            actionableInsights: { type: "array", items: { type: "string" } },
            estimatedTimeToHandle: { type: "number" },
            suggestedActions: { type: "array", items: { type: "string" } },
          },
          required: ["priority", "summary", "actionableInsights", "estimatedTimeToHandle", "suggestedActions"],
        },
      },
      contents: `Source App: ${sourceApp}\nTitle: ${title}\nContent: ${content}`,
    });

    const rawJson = response.text;
    if (rawJson) {
      const result = JSON.parse(rawJson);
      // Validate and normalize priority - ensure it's one of the valid enum values
      if (!["urgent", "important", "informational"].includes(result.priority)) {
        result.priority = "informational";
      }
      return {
        priority: result.priority,
        summary: result.summary || "No summary available",
        actionableInsights: result.actionableInsights || [],
        estimatedTimeToHandle: result.estimatedTimeToHandle || 5,
        suggestedActions: result.suggestedActions || [],
      };
    } else {
      throw new Error("Empty response from model");
    }
  } catch (error) {
    throw new Error("Failed to analyze notification: " + (error as Error).message);
  }
}

// Note that the newest Gemini model series is "gemini-2.5-flash" or gemini-2.5-pro"
export interface TaskOptimizationResult {
  taskId: string;
  newPriority: "urgent" | "important" | "normal";
  reason: string;
  suggestedOrder: number;
}

export interface WorkflowOptimizationResult {
  optimizedTasks: TaskOptimizationResult[];
  insights: string[];
  estimatedTimeSaving: number;
}

export async function optimizeWorkflow(
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    priority: string;
    estimatedMinutes: number;
    dueAt?: string;
  }>,
  currentTime: Date
): Promise<WorkflowOptimizationResult> {
  // If AI is not available, return basic optimization
  if (!ai) {
    const urgentTasks = tasks.filter(t => t.priority === 'urgent');
    const importantTasks = tasks.filter(t => t.priority === 'important');

    return {
      optimizedTasks: [...urgentTasks, ...importantTasks].slice(0, 5).map((task, index) => ({
        taskId: task.id,
        newPriority: task.priority as any,
        reason: `Scheduled based on ${task.priority} priority`,
        suggestedOrder: index + 1
      })),
      insights: ["Tasks ordered by priority: urgent first, then important"],
      estimatedTimeSaving: 10
    };
  }

  try {
    const systemPrompt = `You are an AI workflow optimization system for executive productivity.
    Analyze the given tasks and intelligently categorize them into 3 priority levels:

    PRIORITY LEVELS:
    - "urgent": Critical deadlines within 1 hour only, emergency situations, time mentions like "in 5 min", "in 10 min", "in 30 min", "asap", "urgent", "right now", "immediately"
    - "important": ALL work-related tasks and professional communications including meetings, deadlines, reviews, submissions, reports, business emails. This includes ANY time mentions for work tasks like "in 1 hour", "in 2 hours", "in 3 hours", "in 6 hours", "today", "tomorrow", "this week", "next week", OR tasks without deadlines that are work-related
    - "normal": Only casual/informal conversations, social chatter, entertainment, personal messages like "hi", "hello", "wassup", "let's play game", "how are you", social media notifications, non-work related content

    CRITICAL RULE: If a message mentions meetings, work tasks, deadlines, or any professional context, it should be "important" regardless of timing (unless within 1 hour = urgent).

    Consider:
    - Current time vs due dates and relative time mentions
    - Business impact and urgency indicators from language used
    - Task dependencies and context
    - Email urgency patterns and time-sensitive language
    - Optimal cognitive load distribution

    Order tasks within each priority by time urgency (most time-sensitive first).

    Respond with JSON in this exact format: {
      "optimizedTasks": [
        {
          "taskId": "task_id",
          "newPriority": "urgent|important|normal",
          "reason": "explanation for priority assignment including any time mentions found",
          "suggestedOrder": number_1_to_N
        }
      ],
      "insights": ["insight1", "insight2"],
      "estimatedTimeSaving": number_in_minutes
    }`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            optimizedTasks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  taskId: { type: "string" },
                  newPriority: { type: "string" },
                  reason: { type: "string" },
                  suggestedOrder: { type: "number" },
                },
                required: ["taskId", "newPriority", "reason", "suggestedOrder"],
              },
            },
            insights: {
              type: "array",
              items: { type: "string" },
            },
            estimatedTimeSaving: { type: "number" },
          },
          required: ["optimizedTasks", "insights", "estimatedTimeSaving"],
        },
      },
      contents: `Current time: ${currentTime.toISOString()}\nTasks to optimize: ${JSON.stringify(tasks, null, 2)}`,
    });

    const rawJson = response.text;
    if (rawJson) {
      const result = JSON.parse(rawJson);
      // Validate and normalize priority in optimizedTasks
      result.optimizedTasks = result.optimizedTasks.map((task: TaskOptimizationResult) => {
        if (!["urgent", "important", "normal"].includes(task.newPriority)) {
          task.newPriority = "normal";
        }
        return task;
      });
      return {
        optimizedTasks: result.optimizedTasks || [],
        insights: result.insights || [],
        estimatedTimeSaving: result.estimatedTimeSaving || 0,
      };
    } else {
      throw new Error("Empty response from model");
    }
  } catch (error) {
    throw new Error("Failed to optimize workflow: " + (error as Error).message);
  }
}

// Note that the newest Gemini model series is "gemini-2.5-flash" or gemini-2.5-pro"
export async function generateWellnessInsights(
  userMetrics: {
    focusScore: number;
    workloadCapacity: number;
    stressLevel: string;
    activeHours: number;
    tasksCompleted: number;
  }
): Promise<{
  insights: string[];
  suggestions: string[];
  nextBreakRecommendation: number;
}> {
  // If AI is not available, return basic wellness insights
  if (!ai) {
    const stressAdvice = userMetrics.stressLevel === 'high' ?
      "Take a 15-minute break to improve focus" :
      "Maintain current productivity rhythm";

    return {
      insights: [
        `Focus score: ${userMetrics.focusScore}% - ${userMetrics.focusScore > 70 ? 'performing well' : 'room for improvement'}`,
        `Workload: ${userMetrics.workloadCapacity}% capacity utilized`
      ],
      suggestions: [
        stressAdvice,
        "Track task completion patterns for optimization"
      ],
      nextBreakRecommendation: userMetrics.activeHours > 4 ? 15 : 30
    };
  }

  try {
    const systemPrompt = `You are a corporate wellness AI advisor focused on executive performance optimization.
    Analyze user metrics and provide professional wellness insights disguised as performance optimization.
    Use corporate language and focus on productivity benefits.

    Respond with JSON in this exact format: {
      "insights": ["insight1", "insight2"],
      "suggestions": ["suggestion1", "suggestion2"],
      "nextBreakRecommendation": number_minutes_until_next_break
    }`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            insights: { type: "array", items: { type: "string" } },
            suggestions: { type: "array", items: { type: "string" } },
            nextBreakRecommendation: { type: "number" },
          },
          required: ["insights", "suggestions", "nextBreakRecommendation"],
        },
      },
      contents: `User Performance Metrics:
      Focus Score: ${userMetrics.focusScore}%
      Workload Capacity: ${userMetrics.workloadCapacity}%
      Stress Level: ${userMetrics.stressLevel}
      Active Hours: ${userMetrics.activeHours}
      Tasks Completed: ${userMetrics.tasksCompleted}`,
    });

    const rawJson = response.text;
    if (rawJson) {
      const result = JSON.parse(rawJson);
      // No specific priority to validate here, just return the insights
      return {
        insights: result.insights || [],
        suggestions: result.suggestions || [],
        nextBreakRecommendation: result.nextBreakRecommendation || 25,
      };
    } else {
      throw new Error("Empty response from model");
    }
  } catch (error) {
    throw new Error("Failed to generate wellness insights: " + (error as Error).message);
  }
}

export interface TaskAnalysis {
  title: string;
  description: string;
  priority: "urgent" | "important" | "normal";
  estimatedMinutes: number;
  dueAt?: Date;
}

// Convert notification content to structured task using Gemini AI with retry logic
export async function analyzeNotificationForTask(
  notification: {
    title: string;
    description?: string;
    sourceApp?: string;
  }
): Promise<TaskAnalysis> {
  // If AI is not available, use fallback immediately
  if (!ai) {
    const fallback = getFallbackTaskFromNotification(notification);
    return fallback;
  }

  const maxRetries = 3;
  const baseDelay = 2000; // 2 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const systemPrompt = `You are an executive assistant AI that converts email notifications into very short, actionable tasks.
      Analyze the complete email content and create a VERY SHORT task title (2-3 words maximum).
      Focus on the main action required from the email.

      TITLE REQUIREMENTS:
      - Maximum 2-3 words only
      - Action-oriented (e.g., "Reply John", "Review docs", "Schedule meeting")
      - No articles (a, an, the)
      - No punctuation

      PRIORITY RULES (VERY IMPORTANT - Follow these exactly):
      - urgent: ONLY for deadlines within 1 hour, emergency situations, words like "asap", "urgent", "right now", "immediately", "in 5 min", "in 10 min", "in 30 min"
      - important: ALL work-related tasks including meetings, deadlines within days/hours, reviews, submissions, reports, business emails, professional communications. ANY work task with time mentions like "in 1 hour", "in 2 hours", "in 3 hours", "today", "tomorrow", "this week". Also tasks without deadlines that are work-related should be important.
      - normal: ONLY for casual/social conversations, entertainment, personal messages like "hi", "hello", "wassup", "let's play game", non-work content

      NON-ACTIONABLE EMAIL DETECTION:
      If the email contains any of these patterns, classify as "skip" instead of creating a task:
      - Security alerts, verification codes, login attempts, password resets
      - System notifications, automated confirmations, receipts
      - Newsletter content, promotional material, unsubscribe messages
      - Account activity notifications, suspicious activity alerts
      - Welcome emails, signup confirmations, email verifications

      CRITICAL: If the email mentions work, business, meetings, deadlines, or professional context, it should be "important" unless it's within 1 hour (then "urgent"). However, if it's a security/system notification, it should be skipped entirely.

      TIME PARSING INSTRUCTIONS:
      Current time: ${new Date().toISOString()} (Parse times as UTC timestamps)
      When you find time references in the content, convert them to ISO timestamps:
      - "in X minutes" or "X min" → add X minutes to current UTC time
      - "in X hours" → add X hours to current UTC time
      - "today" with specific time → convert IST time to UTC (subtract 5:30 hours)
      - "today" without specific time → set to current date 11:30 UTC (5 PM IST)
      - "tomorrow" → set to next date 03:30 UTC (9 AM IST)
      - Week days → set to appropriate date 03:30 UTC (9 AM IST)
      - If no clear time reference, set dueAt to null

      IMPORTANT: Be very precise with "in X min" patterns. "google meet in 11 min" should be exactly 11 minutes from current time.

      Respond with JSON in this exact format: {
        "title": "Very short 2-3 word task title",
        "description": "Detailed task description with the complete email content and action steps",
        "priority": "urgent|important|normal",
        "estimatedMinutes": number_between_5_and_480,
        "dueAt": "ISO_timestamp_or_null"
      }`;

      const content = `Email Title: ${notification.title}
Complete Email Content: ${notification.description || 'No content'}
Source: ${notification.sourceApp || 'Unknown'}

Analyze the complete email text above and create a very short 2-3 word task title that captures the main action needed.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              priority: { type: "string" },
              estimatedMinutes: { type: "number" },
              dueAt: { type: ["string", "null"] }
            },
            required: ["title", "description", "priority", "estimatedMinutes"]
          },
          temperature: 0.1
        },
        contents: content
      });

      const rawJson = response.text?.trim();
      if (rawJson) {
        const result = JSON.parse(rawJson);

        // Validate and normalize priority
        if (!["urgent", "important", "normal"].includes(result.priority)) {
          result.priority = "normal";
        }

        // Validate required fields
        if (!result.title || !result.description || !result.priority) {
          throw new Error("Invalid AI response: missing required fields");
        }

        // Post-processing guardrails: override generic AI titles
        let finalTitle = result.title;
        const genericTitles = ["reply email", "check email", "new email", "email response", "respond email"];

        if (genericTitles.includes(result.title.toLowerCase())) {
          // Apply deterministic logic to notification content
          const fallback = getFallbackTaskFromNotification(notification);
          finalTitle = fallback.title;
        }

        // Server-side fallback time parsing if AI didn't set dueAt
        let finalDueAt: Date | undefined = undefined;

        if (result.dueAt) {
          try {
            finalDueAt = new Date(result.dueAt);
            // Validate the date is valid
            if (isNaN(finalDueAt.getTime())) {
              console.error(`[AI Analysis] Invalid date returned by AI: ${result.dueAt}`);
              finalDueAt = undefined;
            }
          } catch (dateError) {
            console.error(`[AI Analysis] Error parsing AI date: ${result.dueAt}`, dateError);
            finalDueAt = undefined;
          }
        }

        if (!finalDueAt) {
          const fullText = `${notification.title} ${notification.description || ''}`;
          finalDueAt = parseServerSideTimeReferences(fullText);
        }

        return {
          title: finalTitle,
          description: result.description,
          priority: result.priority,
          estimatedMinutes: Math.max(5, Math.min(480, result.estimatedMinutes || 15)),
          dueAt: finalDueAt
        };
      } else {
        throw new Error("Empty response from model");
      }
    } catch (error: any) {

      // Check if it's a 503 (overloaded) error or other retryable errors
      const isRetryableError = error.status === 503 ||
                              error.message?.includes("overloaded") ||
                              error.message?.includes("quota") ||
                              error.message?.includes("rate limit");

      if (isRetryableError && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // If all retries failed or non-retryable error, return fallback
      break;
    }
  }

  // Use deterministic fallback helper
  const fallback = getFallbackTaskFromNotification(notification);
  return fallback;
}

// Deterministic fallback helper for task generation
// Server-side time parsing fallback function
function parseServerSideTimeReferences(text: string): Date | undefined {
  if (!text) return undefined;

  // Use current UTC time consistently
  const now = new Date();
  const lowerText = text.toLowerCase().trim();

  // Look for "in X min/mins/minutes/m" patterns - be more precise
  const minuteMatch = lowerText.match(/(?:in\s+)?(\d+)\s*(?:m|min|mins|minutes?)\b/i);
  if (minuteMatch) {
    const minutes = parseInt(minuteMatch[1]);
    const futureTime = new Date(now.getTime() + minutes * 60 * 1000);
    console.log(`[TimeParser] Parsed "${lowerText}" as ${minutes} minutes from now: ${futureTime.toISOString()}`);
    return futureTime;
  }

  // Look for "in X hour/hours/hr/hrs/h" patterns
  const hourMatch = lowerText.match(/(?:in\s+)?(\d+)\s*(?:h|hr|hrs|hour|hours?)\b/i);
  if (hourMatch) {
    const hours = parseInt(hourMatch[1]);
    const futureTime = new Date(now.getTime() + hours * 60 * 60 * 1000);
    console.log(`[TimeParser] Parsed "${lowerText}" as ${hours} hours from now: ${futureTime.toISOString()}`);
    return futureTime;
  }

  // Look for "in X days" patterns
  const dayMatch = lowerText.match(/(?:in\s+)?(\d+)\s*(?:day|days?)\b/i);
  if (dayMatch) {
    const days = parseInt(dayMatch[1]);
    const futureTime = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    console.log(`[TimeParser] Parsed "${lowerText}" as ${days} days from now: ${futureTime.toISOString()}`);
    return futureTime;
  }

  // Handle "tomorrow" or "tommorow" (common typo) - Use UTC consistently
  if (lowerText.includes('tomorrow') || lowerText.includes('tommorow')) {
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(3, 30, 0, 0); // 9 AM IST = 3:30 UTC
    console.log(`[TimeParser] Parsed "tomorrow" as: ${tomorrow.toISOString()}`);
    return tomorrow;
  }

  // Handle "today" with specific time mentions - Use UTC consistently
  if (lowerText.includes('today')) {
    const today = new Date(now);

    // Look for specific time mentions with "today"
    // Match patterns like: "9 pm", "9:00 pm", "21:00", "9 p.m.", "9pm"
    const timeToday = lowerText.match(/(\d{1,2}):?(\d{2})?\s*(pm|p\.m\.|am|a\.m\.)\s*today|today\s*(?:at\s*)?(\d{1,2}):?(\d{2})?\s*(pm|p\.m\.|am|a\.m\.)|(\d{1,2}):?(\d{2})?\s*(pm|p\.m\.|am|a\.m\.)/i);

    if (timeToday) {
      // Extract hour and minute, handling different capture groups
      let hour = parseInt(timeToday[1] || timeToday[4] || timeToday[7] || '17');
      const minute = parseInt(timeToday[2] || timeToday[5] || timeToday[8] || '0');
      const period = (timeToday[3] || timeToday[6] || timeToday[9] || '').toLowerCase();

      // Convert to 24-hour format
      if (period.includes('pm') || period.includes('p.m.')) {
        if (hour !== 12) hour += 12;
      } else if (period.includes('am') || period.includes('a.m.')) {
        if (hour === 12) hour = 0;
      }

      // Convert IST hour to UTC (IST = UTC + 5:30)
      const utcHour = hour - 5;
      const utcMinute = minute - 30;

      // Handle minute/hour overflow
      let finalHour = utcHour;
      let finalMinute = utcMinute;
      let dayOffset = 0;

      if (finalMinute < 0) {
        finalMinute += 60;
        finalHour -= 1;
      }
      if (finalHour < 0) {
        finalHour += 24;
        dayOffset = -1;
      }

      today.setUTCDate(today.getUTCDate() + dayOffset);
      today.setUTCHours(finalHour, finalMinute, 0, 0);

      console.log(`[TimeParser] Parsed "today at ${hour}:${minute.toString().padStart(2, '0')}" IST as: ${today.toISOString()}`);
      return today;
    } else {
      // Default to 5 PM IST (11:30 UTC) if no specific time mentioned
      today.setUTCHours(11, 30, 0, 0);
      console.log(`[TimeParser] Parsed "today" (default 5 PM IST) as: ${today.toISOString()}`);
      return today;
    }
  }

  // Handle specific day names (for this week)
  const dayNames = {
    'monday': 1, 'mon': 1,
    'tuesday': 2, 'tue': 2, 'tues': 2,
    'wednesday': 3, 'wed': 3,
    'thursday': 4, 'thu': 4, 'thurs': 4,
    'friday': 5, 'fri': 5,
    'saturday': 6, 'sat': 6,
    'sunday': 0, 'sun': 0
  };

  for (const [dayName, dayNumber] of Object.entries(dayNames)) {
    if (lowerText.includes(dayName)) {
      const targetDate = new Date(now);
      const currentDay = now.getDay();
      const daysUntilTarget = (dayNumber - currentDay + 7) % 7;

      // If it's the same day, assume next week unless it's still early
      if (daysUntilTarget === 0 && now.getHours() >= 12) {
        targetDate.setDate(targetDate.getDate() + 7);
      } else if (daysUntilTarget === 0) {
        // Same day, set to later today
        targetDate.setHours(17, 0, 0, 0);
        return targetDate;
      } else {
        targetDate.setDate(targetDate.getDate() + daysUntilTarget);
      }

      targetDate.setHours(9, 0, 0, 0); // Set to 9 AM on target day
      return targetDate;
    }
  }

  // Handle "next week"
  if (lowerText.includes('next week')) {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(9, 0, 0, 0);
    return nextWeek;
  }

  // Handle "this week" (Friday)
  if (lowerText.includes('this week')) {
    const friday = new Date(now);
    const daysUntilFriday = (5 - now.getDay() + 7) % 7;
    if (daysUntilFriday === 0 && now.getHours() >= 17) {
      friday.setDate(friday.getDate() + 7); // Next Friday if it's late Friday
    } else {
      friday.setDate(friday.getDate() + daysUntilFriday);
    }
    friday.setHours(17, 0, 0, 0);
    return friday;
  }

  // Look for immediate urgency keywords
  if (lowerText.includes('asap') || lowerText.includes('urgent') || lowerText.includes('right now') || lowerText.includes('immediately')) {
    const urgentTime = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes from now
    console.log(`[TimeParser] Parsed urgent keyword in "${lowerText}" as 5 minutes from now: ${urgentTime.toISOString()}`);
    return urgentTime;
  }

  console.log(`[TimeParser] No time reference found in: "${lowerText}"`);
  return undefined;
}

// NEW: Multi-task analysis function - splits emails with multiple deadlines
export async function analyzeEmailForMultipleTasks(
  notification: {
    title: string;
    description?: string;
    sourceApp?: string;
  }
): Promise<TaskAnalysis[]> {
  // If AI is not available, return single task analysis
  if (!ai) {
    return [getFallbackTaskFromNotification(notification)];
  }

  try {
    const systemPrompt = `You are an executive assistant AI that analyzes emails and identifies if they contain multiple distinct tasks with separate deadlines.

    ANALYZE the email content and determine:
    1. How many separate actionable tasks exist
    2. Each task's deadline/timing
    3. Each task's priority and description

    TASK IDENTIFICATION RULES:
    - Look for multiple deadlines (e.g., "submit draft by Monday, final version by Friday")
    - Look for multiple action items with different timings
    - Look for sequential steps with different due dates
    - Each task should be independently actionable

    TITLE REQUIREMENTS for each task:
    - Maximum 2-3 words only
    - Action-oriented (e.g., "Submit Draft", "Final Version", "Review Meeting")
    - No articles (a, an, the)
    - No punctuation

    Current time: ${new Date().toISOString()} (Server timezone: Indian Standard Time - UTC+5:30)

    RESPOND with a JSON array of tasks. If only one task exists, return array with one task.
    Each task should have this format:
    {
      "title": "short action title",
      "description": "full detailed description",
      "priority": "urgent|important|normal",
      "estimatedMinutes": number,
      "dueAt": "ISO timestamp or null"
    }

    PRIORITY RULES:
    - urgent: deadlines within 1 hour, emergency situations
    - important: work-related tasks, deadlines within days/hours
    - normal: casual/social content`;

    const userPrompt = `Title: ${notification.title}
Content: ${notification.description || ''}
Source: ${notification.sourceApp || 'email'}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json"
      },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }]
    });

    let tasks: TaskAnalysis[];
    try {
      // FIXED: Use correct Gemini SDK method consistent with other functions
      const responseText = response.text;
      tasks = JSON.parse(responseText);

      // Validate array structure and ensure we have valid task objects
      if (!Array.isArray(tasks)) {
        tasks = [tasks]; // Convert single object to array
      }

      // Validate each task has required properties
      tasks = tasks.filter(task => task && typeof task === 'object' && task.title);

      if (tasks.length === 0) {
        throw new Error("No valid tasks found in AI response");
      }

      console.log(`[MultiTaskAnalysis] Successfully parsed ${tasks.length} tasks from AI response`);
    } catch (parseError) {
      console.error('Multi-task parsing error:', parseError);
      console.log('[MultiTaskAnalysis] Falling back to single task analysis');
      return [getFallbackTaskFromNotification(notification)];
    }

    // Validate and clean up tasks
    return tasks.map(task => {
      let validDueAt: Date | undefined = undefined;

      if (task.dueAt) {
        try {
          validDueAt = new Date(task.dueAt);
          // Validate the date is valid
          if (isNaN(validDueAt.getTime())) {
            console.error(`[MultiTask] Invalid date in task: ${task.dueAt}`);
            validDueAt = undefined;
          }
        } catch (dateError) {
          console.error(`[MultiTask] Error parsing task date: ${task.dueAt}`, dateError);
          validDueAt = undefined;
        }
      }

      // Validate and normalize priority
      if (!["urgent", "important", "normal"].includes(task.priority)) {
        task.priority = "normal";
      }

      return {
        title: task.title || "Task",
        description: task.description || notification.description || "No description",
        priority: task.priority,
        estimatedMinutes: typeof task.estimatedMinutes === 'number' ? task.estimatedMinutes : 30,
        dueAt: validDueAt
      };
    });

  } catch (error) {
    console.error('Multi-task analysis error:', error);
    return [getFallbackTaskFromNotification(notification)];
  }
}

function getFallbackTaskFromNotification(notification: {
  title: string;
  description?: string;
  sourceApp?: string;
}): TaskAnalysis {
  let shortTitle = "Check notification";
  let priority: "urgent" | "important" | "normal" = "normal";

  // Focus on notification description (actual content) over generic title
  const content = notification.description || notification.title;
  const lowerContent = content.toLowerCase();

  // Gmail-specific logic: parse email content
  if (notification.sourceApp === 'gmail') {
    // Look for specific actions in email content (prioritize action keywords over greetings)
    if (lowerContent.includes("submit") || lowerContent.includes("submission") || lowerContent.includes("assignment") ||
        lowerContent.includes("deliverable") || lowerContent.includes("turn in") || lowerContent.includes("attach") ||
        lowerContent.includes("upload")) {
      shortTitle = "Submit file";
    } else if (lowerContent.includes("deadline") || lowerContent.includes("due")) {
      shortTitle = "Meet deadline";
    } else if (lowerContent.includes("project") && (lowerContent.includes("review") || lowerContent.includes("check"))) {
      shortTitle = "Review project";
    } else if (lowerContent.includes("meeting") || lowerContent.includes("meet") || lowerContent.includes("zoom") || lowerContent.includes("google meet")) {
      shortTitle = "Join meeting";
    } else if (lowerContent.includes("invoice") || lowerContent.includes("payment") || lowerContent.includes("bill")) {
      shortTitle = "Pay invoice";
    } else if (lowerContent.includes("approve") || lowerContent.includes("approval") || lowerContent.includes("sign")) {
      shortTitle = "Review approval";
    } else if (lowerContent.includes("hi") || lowerContent.includes("hello") || lowerContent.includes("hangout") || lowerContent.includes("chat")) {
      shortTitle = "Reply email";
    } else {
      // Try to extract meaningful subject from "Subject: content" format
      const subjectMatch = lowerContent.match(/:\s*(.+)/);
      if (subjectMatch) {
        const subject = subjectMatch[1].trim();
        const meaningfulWords = subject.split(' ')
          .filter(word => word.length > 2 && !['the', 'and', 'for', 'with', 'from', 'just', 'will'].includes(word))
          .slice(0, 2);

        if (meaningfulWords.length >= 2) {
          shortTitle = meaningfulWords.join(' ').replace(/[^\w\s]/g, '');
        } else if (meaningfulWords.length === 1) {
          shortTitle = `Handle ${meaningfulWords[0]}`;
        } else {
          shortTitle = "Reply email";
        }
      } else {
        shortTitle = "Reply email";
      }
    }
  } else {
    // For non-email notifications, use general logic
    const allText = (notification.title + ' ' + (notification.description || '')).toLowerCase();

    if (allText.includes("meeting") || allText.includes("meet")) {
      shortTitle = allText.includes("google meet") || allText.includes("zoom") ? "Join meeting" : "Schedule meeting";
    } else if (allText.includes("review") || allText.includes("check")) {
      shortTitle = "Review item";
    } else if (allText.includes("call") || allText.includes("phone")) {
      shortTitle = "Make call";
    } else if (allText.includes("submit") || allText.includes("send")) {
      shortTitle = "Submit task";
    } else if (allText.includes("deadline") || allText.includes("due")) {
      shortTitle = "Complete deadline";
    } else if (allText.includes("boss") || allText.includes("manager")) {
      shortTitle = "Contact manager";
    } else {
      // Extract meaningful words from title
      const titleWords = notification.title.split(' ').filter(word =>
        word.length > 2 && !['the', 'and', 'for', 'with', 'from'].includes(word.toLowerCase())
      );
      if (titleWords.length >= 2) {
        shortTitle = titleWords.slice(0, 2).join(' ');
      } else if (titleWords.length === 1) {
        shortTitle = `Handle ${titleWords[0]}`;
      }
    }
  }

  // Priority detection based on time and context - MOVED to analyze the FULL text including description
  const allText = (notification.title + ' ' + (notification.description || '')).toLowerCase();

  // Check for work email patterns FIRST - prioritize work content
  const workPatterns = [
    /action required/i,
    /deadline/i,
    /deliverable/i,
    /task/i,
    /project/i,
    /meeting/i,
    /campaign/i,
    /vendor/i,
    /coordinate/i,
    /assist/i,
    /prepare/i,
    /draft/i,
    /confirm/i,
    /negotiate/i,
    /training/i,
    /conference/i,
    /calendar/i,
    /schedule/i,
    /analysis/i,
    /strategy/i,
    /review/i,
    /approval/i,
    /budget/i,
    /timeline/i,
    /milestone/i,
    /presentation/i,
    /proposal/i,
    /contract/i,
    /client/i,
    /customer/i,
    /stakeholder/i,
    /team/i,
    /department/i
  ];

  const isWorkEmail = workPatterns.some(pattern => pattern.test(allText));

  // Check for non-actionable patterns ONLY if it's not clearly a work email
  if (!isWorkEmail) {
    const nonActionablePatterns = [
      /security alert/i,
      /verification code.*\d{4,}/i, // Only skip if contains actual verification code
      /two.?factor authentication.*code/i,
      /login verification.*code/i,
      /confirm your email.*click here/i,
      /welcome to.*verify/i,
      /thank you for signing up.*confirm/i
    ];

    if (nonActionablePatterns.some(pattern => pattern.test(allText))) {
      return {
        title: "Skip",
        description: "Non-actionable email filtered out",
        priority: "normal",
        estimatedMinutes: 0
      };
    }
  }

  // Check for casual/social patterns SECOND - Check DESCRIPTION content primarily
  if (lowerContent.match(/\b(?:hi|hello|hey|wassup|what's up|how are you|how r u|good morning|good afternoon|good evening|hangout|chat|let's play|game|social|casual)\b/) ||
      lowerContent.match(/^(?:hi|hello|hey)\s*[!.]*\s*$/) ||
      allText.match(/\b(?:hi|hello|hey|wassup|what's up|how are you|how r u|good morning|good afternoon|good evening|hangout|chat|let's play|game|social|casual)\b/) ||
      allText.match(/^(?:hi|hello|hey)\s*[!.]*\s*$/)) {
    priority = "normal";
  }
  // Check for urgent patterns (within 1 hour or immediate action needed)
  else if (allText.match(/\b(?:in\s*(?:[1-5]?\d)\s*(?:min|mins|minutes?))\b/) ||
      allText.match(/\b(?:asap|urgent|right now|immediately|emergency)\b/) ||
      allText.match(/\b(?:in\s*(?:[1-9]|[1-5][0-9])\s*(?:min|mins|minutes?))\b/)) {
    priority = "urgent";
  }
  // Check for important patterns (work-related, deadlines within hours/days) - EXCLUDE if already classified as casual
  else if (allText.match(/\b(?:meeting|work|boss|client|deadline|important|review|submit|report|project|task|schedule|call)\b/) ||
           allText.match(/\b(?:in\s*(?:[1-9]|[12][0-9])\s*(?:hour|hours?|hrs?))\b/) ||
           allText.includes("today") || allText.includes("tomorrow") || allText.includes("this week")) {
    priority = "important";
  }

  return {
    title: shortTitle,
    description: `Complete email content:\n\n${notification.title}\n\n${notification.description || 'No content available'}\n\nAction needed: Review and respond to this notification.`,
    priority: priority,
    estimatedMinutes: 15
  };
}
