import { z } from "zod";

export const ChatSummarySchema = z.object({
  chatType: z.enum([
    "financialActionClarification",
    "financialActionExecution"
  ]),
  financialActionName: z.string().optional(),
  financialActionParameters: z.array(z.string()).optional(),
  regularChatMessage: z.string().optional(),
  rationaleForResponse: z.string(),
});

export const ChatSummaryChangeTalkingStyleSchema = z.object({
  chatMessage: z.string().optional(),
  rationaleForResponse: z.string(),
});

export type ChatSummary = z.infer<typeof ChatSummarySchema>; 