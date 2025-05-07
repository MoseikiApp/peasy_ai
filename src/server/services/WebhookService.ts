import { PrismaClient } from '@prisma/client';
import { TelegramService } from './TelegramService';
import { Coinbase } from '@coinbase/coinbase-sdk';
import { CryptoService } from './CryptoService';
import { GptService } from './GptService';

export class WebhookService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  public async processMessage(ctx: any, input: any): Promise<{
    status: string;
    message: string;
    error?: any;
  }> {
    console.log("Received text message webhook", input);
    const telegramService = new TelegramService(ctx.db);
    const gptService = new GptService();

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
      userName: input.message.from.username,
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
      let referringAccountId = null;
      let referringUserName = null;
      let referringUserChatId = null;

      if (!user) {
        console.log("User not found, creating new user");
        user = await ctx.db.user.create({
          data: {
            phoneNumberWithCountryCode: phoneNumberWithCountryCode
          }
        });
        newUser = true;


      }

      //This section should be enabled for new user only. Not doing so now for demo purposes.
      const referralPrefix = "/start referral_";

      if (typedInput.body != null && typedInput.body.startsWith(referralPrefix)) {
        var parts = typedInput.body.substring(referralPrefix.length).split("_");
        referringAccountId = parts[0];
        referringUserName = parts.length > 1 ? parts[1] : null;
        referringUserChatId = parts.length > 2 ? parts[2] : null;
        console.log("Referring account ID:", referringAccountId);
        console.log("Referring user name:", referringUserName);
        console.log("Referring user chat ID:", referringUserChatId);
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

      if (userAccount) {
        //update user name
        await ctx.db.user.update({
          where: {
            id: user.id
          },
          data: {
            name: typedInput.userName ?? typedInput.firstName
          }
        });
      }

      let newUserAccount = false;
      if (!userAccount) {
        console.log("User account not found, creating new user account");
        userAccount = await ctx.db.account.create({
          data: {
            userId: user.id,
            provider: provider,
            providerAccountId: typedInput.waId,
            type: channel,
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
          Coinbase.networks.BaseMainnet,
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
        .map((msg: any) => `${msg.actor}: ${msg.chatContent}`)
        .join('\n');

      const agentName = "chatGpt";

      var notificationCallback = null;

      if (typedInput.chatExternalConversationId) {
        notificationCallback = async (msg: string) => {
          await telegramService.sendMessage(typedInput.chatExternalConversationId, msg);
        }
      }

      // Generate AI response using GptService
      currentStep = "generating response to your request via AI";
      var aiResponseContent = await gptService.generateChatResponse(
        user.id,
        userWallet!,
        agentName,
        typedInput.body,
        contextHistory,
        typedInput.chatExternalConversationId,
        notificationCallback
      );

      var referralMessage = null;

      if (referringAccountId) {
        console.log("Processing referral message");

        const referringUser = await ctx.db.user.findFirst({
          where: {
            id: referringAccountId
          }
        });

        if (!referringUser) {
          console.error("Referring user not found");
        }

        let referringUserWallet = await ctx.db.userWallet.findFirst({
          where: {
            userId: referringAccountId
          }
        });

        if (!referringUserWallet) {
          console.error("Referring user wallet not found");
        }

        try {
          if (referringUser) {
            let addressBookNameReferringUser = referringUserName ?? "Peasy Friend";

            // Check if name already exists in user's address book
            const existingReferringEntry = await ctx.db.addressBook.findFirst({
              where: {
                userId: user.id,
                name: addressBookNameReferringUser
              }
            });

            // If name exists, append a number to make it unique
            if (existingReferringEntry) {
              let counter = 1;
              let isUnique = false;

              while (!isUnique) {
                const nameWithCounter = `${addressBookNameReferringUser}${counter}`;
                const duplicate = await ctx.db.addressBook.findFirst({
                  where: {
                    userId: user.id,
                    name: nameWithCounter
                  }
                });

                if (!duplicate) {
                  addressBookNameReferringUser = nameWithCounter;
                  isUnique = true;
                } else {
                  counter++;
                }
              }
            }

            await ctx.db.addressBook.create({
              data: {
                userId: user.id,
                name: addressBookNameReferringUser,
                walletAddress: referringUserWallet?.address as `0x${string}`
              }
            });

            console.log("Added " + addressBookNameReferringUser + " to your address book");

            let addressBookNameCurrentUser = user.name ?? "Peasy Friend";

            // Check if name already exists in referring user's address book
            const existingCurrentEntry = await ctx.db.addressBook.findFirst({
              where: {
                userId: referringAccountId,
                name: addressBookNameCurrentUser
              }
            });

            // If name exists, append a number to make it unique
            if (existingCurrentEntry) {
              let counter = 1;
              let isUnique = false;

              while (!isUnique) {
                const nameWithCounter = `${addressBookNameCurrentUser}${counter}`;
                const duplicate = await ctx.db.addressBook.findFirst({
                  where: {
                    userId: referringAccountId,
                    name: nameWithCounter
                  }
                });

                if (!duplicate) {
                  addressBookNameCurrentUser = nameWithCounter;
                  isUnique = true;
                } else {
                  counter++;
                }
              }
            }

            await ctx.db.addressBook.create({
              data: {
                userId: referringAccountId,
                name: addressBookNameCurrentUser,
                walletAddress: userWallet?.address as `0x${string}`
              }
            });

            console.log("Added " + addressBookNameCurrentUser + " to " + referringUserName + " address book");

            if (referringUserChatId) {
              try {

                const chatExternalConversationIdCount = await ctx.db.chat.count({
                  where: {
                    accountId: referringAccountId,
                    chatExternalConversationId: typedInput.chatExternalConversationId
                  }
                });

                if (chatExternalConversationIdCount > 0) {

                  await telegramService.sendMessage(referringUserChatId, "Hello. The user you referred to Peasy " + addressBookNameCurrentUser + " has accepted your referral and added you to their address book.\r\n" +
                    "You can now send/receive crypto to/from " + referringUserName + ".\r\n" +
                    "Would you like to send 0.00001 ETH to " + referringUserName + " as a welcome gift now?\r\nWallet address: " + userWallet?.address + ".");
                }
                else {
                  console.log("No messages found for chat external conversation ID for " + referringUserName + " with account ID: " + referringAccountId + " and chat external conversation ID: " + typedInput.chatExternalConversationId);
                }
              }
              catch (error) {
                console.error("Error sending referral message to user who referred " + referringUserName + " via Telegram: ", error);
              }

            }
          }

          referralMessage = "Welcome to Peasy - Your web3 AI assistant!\r\n\r\n" +
            "You were referred by " + referringUserName + ".\r\n" +
            "We added " + referringUserName + " to your address book.\r\n" +
            "You can now send/receive crypto to/from " + referringUserName + ".\r\n" +
            "How can I help you today? You can perform send, swap, get balance, get quote, etc."
          console.log("Referral message:", referralMessage);
        } catch (error) {
          console.error("Error creating address book entries:", error);
        }
      }

      if (referralMessage) {
        aiResponseContent = referralMessage;
      }


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

      if (typedInput.chatExternalConversationId){
        await telegramService.sendMessage(typedInput.chatExternalConversationId, aiResponseContent);
      }
      else {
        console.log("No messages found for chat external conversation ID for " + referringUserName + " with account ID: " + referringAccountId + " and chat external conversation ID: " + typedInput.chatExternalConversationId);
      }

      return {
        status: 'success',
        message: aiResponseContent
      };
    } catch (error) {
      console.error('Error handling Twilio webhook:', error);
      // Still return success even on errors, but log them


      try{
        if (typedInput.chatExternalConversationId){
          await telegramService.sendMessage(typedInput.chatExternalConversationId,
            'Ops, something went wrong while ' + currentStep + '. Please try again later.');
        }
        else {
          console.log("No messages found for chat external conversation ID");
        }
      }
      catch (error) {
        console.error('Error sending error message to Telegram:', error);
      }


      return {
        status: 'success',
        message: 'Ops, something went wrong while ' + currentStep + '. Please try again later.',
        error: error instanceof Error ? error : { message: String(error) }
      };
    }
  }
}