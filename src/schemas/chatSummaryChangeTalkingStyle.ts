import { z } from "zod";

export const ChatSummaryChangeTalkingStyleSchema = z.object({
  chatMessage: z.string().optional(),
  rationaleForResponse: z.string(),
});

export type ChatSummaryChangeTalkingStyle = z.infer<typeof ChatSummaryChangeTalkingStyleSchema>; 