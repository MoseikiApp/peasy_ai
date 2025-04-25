import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { GptService } from "~/server/services/GptService";
import { CryptoService } from "~/server/services/CryptoService";

// Initialize the GptService
const gptService = new GptService();

export const chatRouter = createTRPCRouter({
  getMessages: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(100),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { limit, cursor } = input;
      const userId = ctx.session.user.id;

      const messages = await ctx.db.chat.findMany({
        where: {
          accountId: userId,
        },
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: {
          date: 'desc',
        },
        select: {
          id: true,
          chatContent: true,
          actor: true,
          date: true,
        },
      });

      let nextCursor: typeof cursor | undefined = undefined;
      if (messages.length > limit) {
        const nextItem = messages.pop();
        nextCursor = nextItem?.id;
      }

      return {
        messages: messages.reverse(), // Reverse to show oldest first
        nextCursor,
      };
    }),

  sendMessage: protectedProcedure
    .input(z.object({
      content: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const accountId = ctx.session.user.id;
      const conversationId = null; //ctx.session.conversationId;
      const chatExternalProviderName = null; //ctx.session.chatExternalProviderName;

      // Save user message
      const userMessage = await ctx.db.chat.create({
        data: {
          accountId: accountId,
          chatContent: input.content,
          actor: "You",
        },
      });

      // Get recent chat history for context
      const recentMessages = await ctx.db.chat.findMany({
        where: {
          accountId: accountId,
        },
        take: 100,
        orderBy: {
          date: 'desc',
        },
        select: {
          chatContent: true,
          actor: true,
        },
      });

      // Format the context string from recent messages (oldest first)
      const contextHistory = recentMessages
        .reverse()
        .map(msg => `${msg.actor}: ${msg.chatContent}`)
        .join('\n');

      const agentName = "chatGpt";

      const userWallet = await ctx.db.userWallet.findFirst({
        where: {
          userId: accountId,
        },
      });

      if (!userWallet) {
        const cryptoService = new CryptoService(ctx.db);
        await cryptoService.createCryptoWallet(
          accountId,
          ctx.session.user.name || `user-${accountId}`,
          'ethereum',
          'ETH'
        );
      }

      const user = await ctx.db.user.findFirst({
        where: {
          id: accountId
        },
        select: {
          phoneNumberWithCountryCode: true
        }
      });

      // Generate AI response using GptService
      const aiResponseContent = await gptService.generateChatResponse(
        accountId,
        userWallet!,
        agentName,
        input.content,
        contextHistory
      );

      // Create AI response in database
      const aiResponse = await ctx.db.chat.create({
        data: {
          accountId: accountId,
          chatContent: aiResponseContent,
          actor: "Agent",
          currentPhoneNumberWithCountryCode: user?.phoneNumberWithCountryCode,
          chatExternalConversationId: conversationId,
          chatExternalProviderName: chatExternalProviderName
        },
      });

      return {
        userMessage,
        aiResponse,
      };
    }),


  handleTwilioWebhook: publicProcedure
    .input(z.any())
    .mutation(async ({ ctx, input }) => {
      console.log("Received Twilio webhook", input);
      var currentStep = "processing your request";

      try {
        console.log("Received Twilio webhook:", JSON.stringify(input, null, 2));

        // Directly create typed input from the original input data
        const typedInput = {
          // Base parameters
          conversationSid: input.ConversationSid || input.MessageSid,
          messageSid: input.MessageSid || input.SmsMessageSid,
          author: input.Author,
          body: input.Body,
          dateCreated: input.DateCreated,
          eventType: input.EventType || ((input.WaId || input.SmsMessageSid) ? 'onMessageAdded' : undefined),
          webhookSid: input.WebhookSid,
          accountSid: input.AccountSid,
          attributes: input.Attributes,

          // WhatsApp-specific parameters
          profileName: input.ProfileName,
          waId: input.WaId,
          forwarded: input.Forwarded,
          frequentlyForwarded: input.FrequentlyForwarded,
          buttonText: input.ButtonText,

          // Location parameters
          latitude: input.Latitude,
          longitude: input.Longitude,
          address: input.Address,
          label: input.Label,

          // SMS-specific parameters
          from: input.From,
          to: input.To,
        };

        // Handle different event types from Twilio Conversations API
        switch (typedInput.eventType) {
          case 'onMessageAdded':
            // Skip processing if the message was sent by the system or our own service
            // if (!typedInput.author || typedInput.author === 'system') {
            //   return { status: 'success', message: 'Skipped system message' };
            // }

            const phoneNumberWithCountryCode = typedInput.waId;

            if (!phoneNumberWithCountryCode) {
              console.error('Phone number not found');
              return { status: 'success', message: 'Ops, something went wrong. We were unable to identify your phone number. Please try again later.' };
            }

            var user = await ctx.db.user.findFirst({
              where: {
                phoneNumberWithCountryCode: phoneNumberWithCountryCode
              }
            });

            if (!user) {
              console.log("User not found, creating new user");
              user = await ctx.db.user.create({
                data: {
                  phoneNumberWithCountryCode: phoneNumberWithCountryCode
                }
              });
            }

            console.log("User:", user.id + " " + (user.phoneNumberWithCountryCode ?? "No phone number"));

            if (!typedInput.accountSid) {
              console.log("AccountSid not found, skipping");
              return { status: 'success', message: 'Ops, something went wrong. We were unable to identify your account. Please try again later.' };
            }

            var userAccount = await ctx.db.account.findFirst({
              where: {
                userId: user.id,
                provider: "twilio",
                providerAccountId: typedInput.accountSid
              }
            });

            if (!userAccount) {
              console.log("User account not found, creating new user account");
              userAccount = await ctx.db.account.create({
                data: {
                  userId: user.id,
                  provider: "twilio",
                  providerAccountId: typedInput.waId,
                  type: "whatsapp"
                }
              });
            }

            console.log("User account:", userAccount.id + " " + userAccount.provider + " " + userAccount.providerAccountId);

            currentStep = "recording your chat message";

            await ctx.db.chat.create({
              data: {
                accountId: user.id,
                chatContent: typedInput.body || '',
                actor: "You",
                chatExternalId: typedInput.messageSid,
                chatExternalConversationId: typedInput.conversationSid,
                chatExternalProviderName: "twilio",
                currentPhoneNumberWithCountryCode: phoneNumberWithCountryCode,
                date: new Date(typedInput.dateCreated || new Date())
              },
            });



            var userWallet = await ctx.db.userWallet.findFirst({
              where: {
                userId: user.id,
              },
            });



            if (!userWallet) {
              currentStep = "creating your wallet";
              
              const cryptoService = new CryptoService(ctx.db);
              userWallet = await cryptoService.createCryptoWallet(
                user.id!,
                user.name || `user-${user.id}`,
                'ethereum',
                'ETH'
              );
            }

            currentStep = "getting your earlier chat messages";
            // Get recent chat history for context
            const recentMessages = await ctx.db.chat.findMany({
              where: {
                accountId: user.id,
              },
              take: 100,
              orderBy: {
                date: 'desc',
              },
              select: {
                chatContent: true,
                actor: true,
              },
            });

            // Format the context string from recent messages (oldest first)
            const contextHistory = recentMessages
              .reverse()
              .map(msg => `${msg.actor}: ${msg.chatContent}`)
              .join('\n');

            const agentName = "chatGpt";


            // Generate AI response using GptService
            currentStep = "generating response to your request via AI";
            const aiResponseContent = await gptService.generateChatResponse(
              user.id,
              userWallet!,
              agentName,
              typedInput.body,
              contextHistory
            );

            await ctx.db.chat.create({
              data: {
                accountId: user.id,
                chatContent: aiResponseContent,
                actor: "Agent",
                currentPhoneNumberWithCountryCode: user?.phoneNumberWithCountryCode,
                chatExternalConversationId: typedInput.conversationSid,
                chatExternalProviderName: userAccount.provider
              },
            });


            return {
              status: 'success',
              message: aiResponseContent
            };

          case 'onConversationAdded':
            console.log("onConversationAdded:", typedInput.conversationSid);
            break;
          case 'onConversationUpdated':
            console.log("onConversationUpdated:", typedInput.conversationSid);
            break;
          case 'onParticipantAdded':
            console.log("onParticipantAdded:", typedInput.conversationSid);
            break;
          case 'onParticipantUpdated':
            console.log("onParticipantUpdated:", typedInput.conversationSid);
            break;
          case 'onConversationRemoved':
            console.log("onConversationRemoved:", typedInput.conversationSid);
            break;
          case 'onParticipantRemoved':
            console.log("onParticipantRemoved:", typedInput.conversationSid);

            return {
              status: 'success',
              message: `${typedInput.eventType} event received`
            };

          default:
            console.log("Unhandled event or missing eventType:", typedInput);
            return {
              status: 'success',
              message: 'Ops, something went wrong. We were unable to identify the channel of your message. Please try again later.'
            };
        }

      } catch (error) {
        console.error('Error handling Twilio webhook:', error);
        // Still return success even on errors, but log them
        return {
          status: 'success',
          message: 'Ops, something went wrong while ' + currentStep + '. Please try again later.',
          error: error instanceof Error ? error : { message: String(error) }
        };
      }
    }),

  handleTextMessageWebhook: publicProcedure
    .input(z.any())
    .mutation(async ({ ctx, input }) => {
      console.log("Received text message webhook", input);
      var currentStep = "processing your request";
      var channel = input.channel;
      var provider = input.provider;

      console.log("Channel:", channel, "Provider:", provider);

      const typedInput = {
        eventType: "chatMessage",
        phoneNumberWithCountryCode: input.message.from.id.toString(),
        accountSid: input.message.from.id.toString(),
        waId: input.message.from.id.toString(),
        body: input.message.text,
        chatExternalId: input.message.from.id.toString(),
        chatExternalConversationId: input.message.chat.id.toString(),
        dateCreated: new Date(input.message.date * 1000),
        firstName: input.message.from.first_name,
      };

      try {
        console.log("Received " + channel + " webhook:", JSON.stringify(input, null, 2));


        const phoneNumberWithCountryCode = typedInput.waId;

        if (!phoneNumberWithCountryCode) {
          console.error('Phone number not found');
          return { status: 'success', message: 'Ops, something went wrong. We were unable to identify your phone number. Please try again later.' };
        }

        var user = await ctx.db.user.findFirst({
          where: {
            phoneNumberWithCountryCode: phoneNumberWithCountryCode
          }
        });

        let newUser = false;

        if (!user) {
          console.log("User not found, creating new user");
          user = await ctx.db.user.create({
            data: {
              phoneNumberWithCountryCode: phoneNumberWithCountryCode
            }
          });
          newUser = true;
        }

        console.log("User:", user.id + " " + (user.phoneNumberWithCountryCode ?? "No phone number"));

        if (!typedInput.accountSid) {
          console.log("AccountSid not found, skipping");
          return { status: 'success', message: 'Ops, something went wrong. We were unable to identify your account. Please try again later.' };
        }

        var userAccount = await ctx.db.account.findFirst({
          where: {
            userId: user.id,
            provider: provider,
            providerAccountId: typedInput.accountSid
          }
        });

        let newUserAccount = false;
        if (!userAccount) {
          console.log("User account not found, creating new user account");
          userAccount = await ctx.db.account.create({
            data: {
              userId: user.id,
              provider: provider,
              providerAccountId: typedInput.waId,
              type: channel
            }
          });
          newUserAccount = true;
        }

        console.log("User account:", userAccount.id + " " + userAccount.provider + " " + userAccount.providerAccountId);

        currentStep = "recording your chat message";

        await ctx.db.chat.create({
          data: {
            accountId: user.id,
            chatContent: typedInput.body || '',
            actor: "You",
            chatExternalId: typedInput.chatExternalId,
            chatExternalConversationId: typedInput.chatExternalConversationId,
            chatExternalProviderName: provider,
            currentPhoneNumberWithCountryCode: phoneNumberWithCountryCode,
            date: new Date(typedInput.dateCreated || new Date())
          },
        });



        var userWallet = await ctx.db.userWallet.findFirst({
          where: {
            userId: user.id,
          },
        });


        let newUserWallet = false;
        if (!userWallet) {
          currentStep = "creating your wallet";
          const cryptoService = new CryptoService(ctx.db);
          userWallet = await cryptoService.createCryptoWallet(
            user.id!,
            user.name || `user-${user.id}`,
            'ethereum',
            'ETH'
          );
          newUserWallet = true;
        }

        currentStep = "getting your earlier chat messages";
        // Get recent chat history for context
        const recentMessages = await ctx.db.chat.findMany({
          where: {
            accountId: user.id,
          },
          take: 100,
          orderBy: {
            date: 'desc',
          },
          select: {
            chatContent: true,
            actor: true,
          },
        });

        // Format the context string from recent messages (oldest first)
        const contextHistory = recentMessages
          .reverse()
          .map(msg => `${msg.actor}: ${msg.chatContent}`)
          .join('\n');

        const agentName = "chatGpt";


        // Generate AI response using GptService
        currentStep = "generating response to your request via AI";
        const aiResponseContent = await gptService.generateChatResponse(
          user.id,
          userWallet!,
          agentName,
          typedInput.body,
          contextHistory
        );

        await ctx.db.chat.create({
          data: {
            accountId: user.id,
            chatContent: aiResponseContent,
            actor: "Agent",
            currentPhoneNumberWithCountryCode: user?.phoneNumberWithCountryCode,
            chatExternalConversationId: typedInput.chatExternalConversationId,
            chatExternalProviderName: provider
          },
        });


        // var messagePrefix = "";

        // const appName = "Peasy";

        // if (newUser) {
        //   messagePrefix = "Hello " + typedInput.firstName + "! Welcome to " + appName + "! I'm your web3 AI assistant.\r\n";
        // }

        // if (newUserAccount) {
        //   messagePrefix += "I realize this is the first time you're using our service on this channel.\r\n";
        // }

        // if (newUserWallet) {
        //   messagePrefix += "I just created a wallet for you with address " + userWallet?.address + ".\r\n";
        // }

        // messagePrefix += "Please let me know how I can help you today.\r\n";


        return {
          status: 'success',
          message: aiResponseContent
        };



      } catch (error) {
        console.error('Error handling Twilio webhook:', error);
        // Still return success even on errors, but log them
        return {
          status: 'success',
          message: 'Ops, something went wrong while ' + currentStep + '. Please try again later.',
          error: error instanceof Error ? error : { message: String(error) }
        };
      }
    }),
}); 