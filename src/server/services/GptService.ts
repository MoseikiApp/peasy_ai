import { db } from "~/server/db";
import OpenAI from 'openai';
import { ChatSummarySchema } from "~/schemas/chatSummary";
import { ChatSummaryChangeTalkingStyleSchema } from "~/schemas/chatSummaryChangeTalkingStyle";
import { zodResponseFormat } from "openai/helpers/zod";
import type { UserWallet } from "@prisma/client";
import { CryptoService } from "./CryptoService";
import { AddressBookService } from "./AddressBookService";
import { SwingService } from "./SwingService";
import { ethers } from "ethers";

export class GptService {
  private openai: OpenAI;
  private cryptoService: CryptoService;
  private swingService: SwingService;
  private addressBookService: AddressBookService;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.cryptoService = new CryptoService(db);
    this.swingService = new SwingService(db);
    this.addressBookService = new AddressBookService(db);
  }

  async generateChatResponse(
    accountId: string,
    userWallet: UserWallet,
    agentName: string,
    userMessage: string,
    context: string,
    chatExternalConversationId: string | null = null,
    notificationCallback: ((msg: string) => Promise<void>) | null = null): Promise<string> {
    // Fetch the agent configuration from the database
    const agentConfig = await db.aIAgentConfiguration.findFirst({
      where: {
        name: agentName
      }
    });

    // If no configuration found, throw an error
    if (!agentConfig) {
      throw new Error(`No agent configuration found for name: ${agentName}`);
    }

    console.log("gptModel: " + agentConfig.providerVersion);

    // The following currencies are supported: ${coinbaseSupportedSwapCurrencies.join(', ')}.

    try {
      var contactList = await this.addressBookService.getContactList(accountId);

      var contactListString = "User's contacts: " + contactList.map(c => `${c.name} (${c.telegramHandle}) (${c.walletAddress})`).join(', ');

      var userRecord = await db.user.findUnique({
        where: {
          id: accountId
        }
      });

      const userName = userRecord?.name ?? "PeasyFriend";

      var telegramReferralLink = `https://t.me/peasy_app_bot?start=referral_${accountId}_${userName}`

      if (chatExternalConversationId) {
        telegramReferralLink = telegramReferralLink + "_" + chatExternalConversationId;
      }

      // Call OpenAI API to generate content
      const completion = await this.openai.beta.chat.completions.parse({
        model: agentConfig.providerVersion || "gpt-4o", // Using GPT-4 for better capabilities
        messages: [
          {
            role: "system",
            content: `Your app name is Peasy. Respond as a person with the following persona: ${agentConfig.persona}.`
          },
          {
            role: "system",
            content: "earlier conversation: " + context
          },
          {
            role: "system",
            content: `Available financial functions:
            1. getApprovalForSendCrypto(fromAddress, toAddress, amount, currency)
            2. sendCrypto(fromAddress, toAddress, amount, currency) //Requires approval via getApprovalForSendCrypto first
            3. getQuoteForSwapCrypto(walletAddress, fromCurrency, toCurrency, amount) //This is also for approval
            4. swapCrypto(walletAddress, fromCurrency, toCurrency, amount, rateApproved) //Requires approval via getQuoteForSwapCrypto first
            5. getCryptoRate(fromCurrency, toCurrency)
            6. getWalletBalance(walletAddress, currency)
            7. getWalletBalanceForAllCoins(walletAddress)
            8. getWalletBalanceForAllCoinsWithTotalUsd(walletAddress)
            9. getContactList()
            10. findContactByName(name)
            11. addContact(name, walletAddress, telegramHandle?)
            12. updateContact(name, data: { name?, walletAddress?, telegramHandle?, phoneNumberWithCountryCode? })
            13. removeContact(name)

            For swapCrypto, get a quote first with getQuoteForSwapCrypto. Then ask for user approval and then execute the swap with swapCrypto. 

            Based on the conversation, determine if you have all necessary information to execute a financial action. 
            Be helpful and reasonable. Don't expect perfect input from user. For instance, if user types mon, or MON, or Monad, or MONAD; do understand that user is referring to the currency "MON".
            If so, return a structured response with chatType="financialActionExecution" and the appropriate financialActionName and financialActionParameters. 
            Otherwise, return chatType="financialActionClarification" and continue the conversation in regularChatMessage.
            Only ask for missing function name and parameters and nothing else.
            Mention the user available functions with friendly names that a person not familiar with the app would understand.
            Never mention user to hold on. You either execute action or perform clarification.
            If you respond with chatType = financialActionClarification, it means you ask user for more info. You cannot return financialActionName with type financialActionClarification.
            You can respond with with financialActionName and financialActionParameters only when chatType is financialActionExecution.
            
            Your response must be a valid JSON object with the following structure:
            {
              "chatType": "financialActionClarification" or "financialActionExecution",
              "financialActionName": (optional) name of the function to call (this can include address book functions as well),
              "financialActionParameters": (optional) array of string parameters for the function,
              "regularChatMessage": (optional) message to send to the user
            }
            
            If user wants to invite a friend to the app, share this link with the user and ask user to invite a friend with that link: ${telegramReferralLink}
            User's friend will get a wallet address created automatically.

            If user insists on trying something that is not supported, do try what user wants to do.

            If a user want's to try a currency you think that is not supported, go ahead and try it. If not supported, relevant call will give user a proper error message.

            When you have enough information to execute a financial action, set chatType to "financialActionExecution", 
            provide the appropriate financialActionName, and include all necessary parameters as strings in the financialActionParameters array.`
              + "The user wallet address is: " + userWallet.address + ". Show this address to user when asked.\n" +
              + "If user mentions a contact name, use the following contact list to guess the contact."
              + contactListString + "\n" +
              + agentConfig.instruction + "\n" +
              + "You should respond with Ryan Reynolds style. Be funny, clever and sarcastic. First, give the info you need to give, such as balances, then add your funny bit. Use emojis if you need."
          },
          {
            role: "user",
            content: userMessage
          }
        ],
        response_format: zodResponseFormat(ChatSummarySchema, 'chatSummary'),
        max_tokens: 500,
        temperature: parseFloat(agentConfig.randomness.toString()) || 0.5
      });

      // Extract the generated content
      const response = completion.choices[0]?.message?.parsed;

      if (!response) {
        return "I had an error while processing your request. Please try again.";
      }

      console.log("Gpt response: " + JSON.stringify(response));
      console.log("Rationale for response: " + response.rationaleForResponse);

      if (response.chatType === "financialActionExecution") {
        const result = await this.handleFinancialExecution(accountId, userWallet, response.financialActionName!, response.financialActionParameters!, notificationCallback);
        const resultChangeTalkingStyle = await this.generateChatResponseChangeTalkingStyle(context, result, agentName);
        return resultChangeTalkingStyle;
      } else if (response.chatType === "financialActionClarification" && response.regularChatMessage) {
        return response.regularChatMessage
      } else {
        return "I didn't understand. Please try again.";
      }
    } catch (error) {
      console.error('Error processing user message:', error);
      throw new Error('Failed to process user message');
    }
  }

  async generateChatResponseChangeTalkingStyle(
    context: string,
    content: string,
    agentName: string
  ): Promise<string> {
    // Fetch the agent configuration from the database
    const agentConfig = await db.aIAgentConfiguration.findFirst({
      where: {
        name: agentName
      }
    });

    // If no configuration found, throw an error
    if (!agentConfig) {
      throw new Error(`No agent configuration found for name: ${agentName}`);
    }

    console.log("gptModel: " + agentConfig.providerVersion);

    // The following currencies are supported: ${coinbaseSupportedSwapCurrencies.join(', ')}.

    try {
      // Call OpenAI API to generate content
      const completion = await this.openai.beta.chat.completions.parse({
        model: agentConfig.providerVersion || "gpt-4o", // Using GPT-4 for better capabilities
        messages: [
          {
            role: "system",
            content: "earlier conversation with user: " + context
          },
          {
            role: "system",
            content: `Your app name is Peasy. You will receive a content which you should respond with Ryan Reynolds style. Be funny, clever and sarcastic. First, give the info you need to give, such as balances, then add your funny bit. Use emojis if you need.`
          },
          {
            role: "system",
            content: `This is the message to change the talking style: ${content}`
          },
        ],
        response_format: zodResponseFormat(ChatSummaryChangeTalkingStyleSchema, 'chatSummary'),
        max_tokens: 500,
        temperature: parseFloat(agentConfig.randomness.toString()) || 0.5
      });

      // Extract the generated content
      const response = completion.choices[0]?.message?.parsed;

      if (!response || !response.chatMessage) {
        console.error('Error processing user message: Response is null or chatMessage is null');
        return content;
      }

      console.log("Gpt response: " + JSON.stringify(response));
      console.log("Rationale for response: " + response.rationaleForResponse);

      return response.chatMessage
    } catch (error) {
      console.error('Error processing user message:', error);
      return content;
    }
  }

  async handleFinancialExecution(userId: string, userWallet: UserWallet, financialActionName: string, parameters: string[], notificationCallback: ((msg: string) => Promise<void>) | null = null): Promise<string> {

    console.log("User ID: " + userId + ", Handling financial execution: " + financialActionName + " with parameters: " + parameters.join(","));

    try {
      switch (financialActionName) {
        case "getApprovalForSendCrypto": {
          return await this.getApprovalForSendCrypto(userId, userWallet, financialActionName, parameters, notificationCallback);
        }

        case "sendCrypto": {
          return await this.sendCrypto(userId, userWallet, financialActionName, parameters, notificationCallback);

        }
        case "getQuoteForSwapCrypto": {
          return await this.getQuoteForSwapCrypto(userId, userWallet, financialActionName, parameters, notificationCallback);
        }

        case "swapCrypto": {
          return await this.swapCrypto(userId, userWallet, financialActionName, parameters, notificationCallback);
        }

        case "getCryptoRate": {
          return await this.getCryptoRate(userId, userWallet, financialActionName, parameters, notificationCallback);
        }

        case "getWalletBalance": {
          return await this.getWalletBalance(userId, userWallet, financialActionName, parameters, notificationCallback);
        }

        case "getWalletBalanceForAllCoins": {
          return await this.getWalletBalanceForAllCoins(userId, userWallet, financialActionName, parameters, notificationCallback);
        }

        case "getWalletBalanceForAllCoinsWithTotalUsd": {
          return await this.getWalletBalanceForAllCoinsWithTotalUsd(userId, userWallet, financialActionName, parameters, notificationCallback);
        }

        case "getContactList": {
          return await this.getContactList(userId, userWallet, financialActionName, parameters, notificationCallback);
        }

        case "findContactByName": {
          return await this.findContactByName(userId, userWallet, financialActionName, parameters, notificationCallback);
        }

        case "addContact": {
          return await this.addContact(userId, userWallet, financialActionName, parameters, notificationCallback);
        }

        case "removeContact": {
          return await this.removeContact(userId, userWallet, financialActionName, parameters, notificationCallback);
        }

        case "updateContact": {
          return await this.updateContact(userId, userWallet, financialActionName, parameters, notificationCallback);
        }

        default:
          return `Unknown action: ${financialActionName}`;
      }
    } catch (error: any) {
      console.error(`Error executing financial action ${financialActionName}:`, error);
      return `Ops, something went wrong: ${error.message}`;
    }
  }

  async getApprovalForSendCrypto(userId: string, userWallet: UserWallet, financialActionName: string, parameters: string[], notificationCallback: ((msg: string) => Promise<void>) | null = null): Promise<string> {
    if (parameters.length < 4) {
      return "Insufficient parameters for sending crypto token. Required: fromAddress, toAddress, amount, currency";
    }
    const [fromAddress, toAddress, amount, currency] = parameters;
    if (!fromAddress || !toAddress || !amount || !currency) {
      return "All parameters must be provided for sending crypto token: fromAddress, toAddress, amount, currency";
    }

    if (fromAddress !== userWallet.address) {
      return "You can only send crypto from your own wallet. Please use the wallet address: " + userWallet.address;
    }

    if (!ethers.isAddress(toAddress)) {
      return `Invalid Ethereum address format for "to" address: ${toAddress}`;
    }

    if (!ethers.isAddress(fromAddress)) {
      return `Invalid Ethereum address format for "from" address: ${fromAddress}`;
    }

    const currencyBalanceInWallet = await this.cryptoService.getWalletBalance(
      fromAddress,
      currency
    );

    if (currencyBalanceInWallet.formattedBalance < amount) {
      return `You don't have enough ${currency} in your wallet. Your balance is ${currencyBalanceInWallet.formattedBalance}.`;
    }

    return `Do you approve sending of ${amount} ${currency.toUpperCase()} to address ${toAddress}?` +
      `\n\nYour current balance:
    ${currencyBalanceInWallet.formattedBalance} ${currency.toUpperCase()}`;
  }

  async sendCrypto(userId: string, userWallet: UserWallet, financialActionName: string, parameters: string[], notificationCallback: ((msg: string) => Promise<void>) | null = null): Promise<string> {
    if (parameters.length < 4) {
      return "Insufficient parameters for sending crypto token. Required: fromAddress, toAddress, amount, currency";
    }
    const [fromAddress, toAddress, amount, currency] = parameters;
    if (!fromAddress || !toAddress || !amount || !currency) {
      return "All parameters must be provided for sending crypto token: fromAddress, toAddress, amount, currency";
    }

    if (fromAddress !== userWallet.address) {
      return "You can only send crypto from your own wallet. Please use the wallet address: " + userWallet.address;
    }

    const rpcProvider = await this.cryptoService.getDefaultRpcProvider();

    if (!rpcProvider) {
      throw new Error(`RPC provider not found for currency: ${currency}`);
    }

    if (!ethers.isAddress(toAddress)) {
      return `Invalid Ethereum address format for "to" address: ${toAddress}`;
    }

    if (!ethers.isAddress(fromAddress)) {
      return `Invalid Ethereum address format for "from" address: ${fromAddress}`;
    }

    var result;
    if (currency.toUpperCase() === "ETH") {
      result = await this.cryptoService.sendNativeToken(
        fromAddress,
        toAddress,
        Number(amount),
        currency,
        userId,
        "AUTO"
      );
    } else {
      result = await this.cryptoService.sendCryptoToken(
        fromAddress,
        toAddress,
        Number(amount),
        currency,
        userId,
        "AUTO"
      );
    }

    const currencyBalanceInWallet = await this.cryptoService.getWalletBalance(
      fromAddress,
      currency
    );

    return `Successfully sent ${amount} ${currency} to ${toAddress}. Transaction hash: ${result.txHash}`
      + `\n\nYour current balance:
  ${currencyBalanceInWallet.formattedBalance} ${currency.toUpperCase()}`;
  }

  async getQuoteForSwapCrypto(userId: string, userWallet: UserWallet, financialActionName: string, parameters: string[], notificationCallback: ((msg: string) => Promise<void>) | null = null): Promise<string> {
    if (parameters.length < 4) {
      return "Insufficient parameters for getting quote for swapping crypto. Required: walletAddress, fromCurrency, toCurrency, amount";
    }
    const [walletAddress, fromCurrency, toCurrency, amount] = parameters;
    if (!walletAddress || !fromCurrency || !toCurrency || !amount) {
      return "All parameters must be provided for getting quote for swapping crypto: walletAddress, fromCurrency, toCurrency, amount";
    }

    if (walletAddress !== userWallet.address) {
      return "You can only send crypto from your own wallet. Please use the wallet address: " + userWallet.address;
    }

    const result = await this.swingService.swap(
      userId,
      walletAddress as `0x${string}`,
      "base",
      fromCurrency,
      toCurrency,
      Number(amount),
      true,
      null
    );

    if (!result.isSuccess) {
      return result.error;
    }

    const fromCurrencyUpper = fromCurrency.toUpperCase();
    const toCurrencyUpper = toCurrency.toUpperCase();

    const fromCurrencyBalance = await this.cryptoService.getWalletBalance(
      userWallet.address,
      fromCurrencyUpper
    );

    console.log("From currency balance: " + fromCurrencyBalance.formattedBalance);

    const toCurrencyBalance = await this.cryptoService.getWalletBalance(
      userWallet.address,
      toCurrencyUpper
    );

    const quoteToSummary = (quote: any) => {
      return quote.integration + " (Fee: " + quote.fees.reduce((acc: number, fee: { amountUSD: string }) => acc + parseFloat(fee.amountUSD), 0) + " USD)";
    }

    console.log("To currency balance: " + toCurrencyBalance.formattedBalance);
    var response = `Do you approve the swap of ${amount} ${fromCurrency.toUpperCase()} to ${toCurrency.toUpperCase()} at rate ${result.swapRateStr}? (Approximate fee: ${result.totalFeeInUsdStr} USD)` +
      `\n\nYour current balance:
    ${fromCurrencyBalance.formattedBalance} ${fromCurrencyUpper}
    ${toCurrencyBalance.formattedBalance} ${toCurrencyUpper}`;


    response += "\n\nBest quote: " + quoteToSummary(result.quote) +
      (result.quote2 != null ? ("\n2nd best quote: " + quoteToSummary(result.quote2)) : "") +
      (result.quote3 != null ? ("\n3rd best quote: " + quoteToSummary(result.quote3)) : "");

    return response;
  }

  async swapCrypto(userId: string, userWallet: UserWallet, financialActionName: string, parameters: string[], notificationCallback: ((msg: string) => Promise<void>) | null = null): Promise<string> {
    if (parameters.length < 5) {
      return "Insufficient parameters for swapping crypto. Required: walletAddress, fromCurrency, toCurrency, amount";
    }
    const [walletAddress, fromCurrency, toCurrency, amount, rateApproved] = parameters;
    if (!walletAddress || !fromCurrency || !toCurrency || !amount || !rateApproved) {
      return "All parameters must be provided for swapping crypto: walletAddress, fromCurrency, toCurrency, amount, rateApproved";
    }

    if (walletAddress !== userWallet.address) {
      return "You can only send crypto from your own wallet. Please use the wallet address: " + userWallet.address;
    }

    const fromCurrencyUpper = fromCurrency.toUpperCase();
    const toCurrencyUpper = toCurrency.toUpperCase();

    const result = await this.swingService.swap(
      userId,
      walletAddress as `0x${string}`,
      "base",
      fromCurrencyUpper,
      toCurrencyUpper,
      Number(amount),
      false,
      parseFloat(rateApproved),
      1,
      notificationCallback
    );

    if (!result.isSuccess) {
      return result.error;
    }

    const fromCurrencyBalance = await this.cryptoService.getWalletBalance(
      userWallet.address,
      fromCurrencyUpper
    );

    const toCurrencyBalance = await this.cryptoService.getWalletBalance(
      userWallet.address,
      toCurrencyUpper
    );

    const baseExplorerTxUrl = `https://basescan.org/tx/${result.txHash}`;
    return `Successfully swapped ${amount} ${fromCurrencyUpper} to ${result.actualAmountReceivedStr != null && result.actualAmountReceivedStr !== "0" ? result.actualAmountReceivedStr : ""} ${toCurrencyUpper} ${result.actualSwapRateStr != null && result.actualSwapRateStr != "0" ? "at rate " + result.actualSwapRateStr : ""}.` +
      `${result.gasFeeInNativeTokenStr != null && result.gasFeeInNativeTokenStr != "0" ? "Fee in ETH: " + result.gasFeeInNativeTokenStr : ""}`
      + `\n\nTransaction hash: ${baseExplorerTxUrl}`
      + `\n\nYour new balance:
     ${fromCurrencyBalance.formattedBalance} ${fromCurrencyUpper}
     ${toCurrencyBalance.formattedBalance} ${toCurrencyUpper}`;
  }

  async getCryptoRate(userId: string, userWallet: UserWallet, financialActionName: string, parameters: string[], notificationCallback: ((msg: string) => Promise<void>) | null = null): Promise<string> {
    if (parameters.length < 2) {
      return "Insufficient parameters for getting crypto rate. Required: fromCurrency, toCurrency";
    }
    const [fromCurrency, toCurrency] = parameters;
    if (!fromCurrency || !toCurrency) {
      return "All parameters must be provided for getting crypto rate: fromCurrency, toCurrency";
    }
    const result = await this.cryptoService.getCryptoRate(
      fromCurrency,
      toCurrency
    );
    return `Current exchange rate from ${fromCurrency} to ${toCurrency} is ${result.rate.toFixed(6)} at ${new Date(result.timestamp).toLocaleString()}`;
  }

  async getWalletBalance(userId: string, userWallet: UserWallet, financialActionName: string, parameters: string[], notificationCallback: ((msg: string) => Promise<void>) | null = null): Promise<string> {
    if (parameters.length < 2) {
      return "Insufficient parameters for getting wallet balance. Required: walletAddress, currency";
    }
    const [walletAddress, currency] = parameters;
    if (!walletAddress || !currency) {
      return "All parameters must be provided for getting wallet balance: walletAddress, currency";
    }



    const result = await this.cryptoService.getWalletBalance(
      walletAddress,
      currency
    );
    return `Balance of ${currency} is ${result.formattedBalance} ${currency} for wallet ${walletAddress}`;
  }

  async getWalletBalanceForAllCoins(userId: string, userWallet: UserWallet, financialActionName: string, parameters: string[], notificationCallback: ((msg: string) => Promise<void>) | null = null): Promise<string> {
    if (parameters.length < 1) {
      return "Insufficient parameters for getting wallet balance. Required: walletAddress";
    }
    const [walletAddress] = parameters;
    if (!walletAddress) {
      return "All parameters must be provided for getting wallet balance: walletAddress";
    }

    const result = await this.cryptoService.getWalletBalanceForAllCoinsFromCoinbase(
      walletAddress
    );

    return `Your wallet balances: \r\n${result.userFriendlyBalanceMessage}`;
  }

  async getWalletBalanceForAllCoinsWithTotalUsd(userId: string, userWallet: UserWallet, financialActionName: string, parameters: string[], notificationCallback: ((msg: string) => Promise<void>) | null = null): Promise<string> {
    if (parameters.length < 1) {
      return "Insufficient parameters for getting wallet balance. Required: walletAddress";
    }
    const [walletAddress] = parameters;
    if (!walletAddress) {
      return "All parameters must be provided for getting wallet balance: walletAddress";
    }

    const result = await this.cryptoService.getWalletBalanceForAllCoinsFromCoinbaseWithTotalUsd(
      walletAddress
    );

    return `Your wallet balances with USD amounts: \r\n${result.userFriendlyBalanceMessage}`;
  }

  async getContactList(userId: string, userWallet: UserWallet, financialActionName: string, parameters: string[], notificationCallback: ((msg: string) => Promise<void>) | null = null): Promise<string> {
    const contacts = await this.addressBookService.getContactList(userId);

    if (contacts.length === 0) {
      return "You have no contacts yet. Add some contacts to your address book.";
    }

    return `Your contacts - Name, Telegram handle, Wallet address: \r\n\r\n${contacts.map(c => `${c.name} (${c.telegramHandle}) (${c.walletAddress})`).join('\r\n')}`;
  }

  async findContactByName(userId: string, userWallet: UserWallet, financialActionName: string, parameters: string[], notificationCallback: ((msg: string) => Promise<void>) | null = null): Promise<string> {
    if (parameters.length < 1) {
      return "Insufficient parameters for finding contact. Required: name";
    }
    const [name] = parameters;
    if (!name) {
      return "Name must be provided for finding contact";
    }

    const contacts = await this.addressBookService.findContactByName(userId, name);
    if (contacts.length === 0) {
      return `No contacts found with name: ${name}`;
    }
    return `Found contacts: ${contacts.map(c => `${c.name} (${c.telegramHandle}) (${c.walletAddress})`).join('\r\n')}`;
  }

  async addContact(userId: string, userWallet: UserWallet, financialActionName: string, parameters: string[], notificationCallback: ((msg: string) => Promise<void>) | null = null): Promise<string> {
    if (parameters.length < 2) {
      return "Insufficient parameters for adding contact. Required: name, walletAddress";
    }
    const [name, walletAddress, telegramHandle] = parameters;
    if (!name || !walletAddress) {
      return "Name and wallet address must be provided for adding contact";
    }

    if (!ethers.isAddress(walletAddress)) {
      return `Invalid Ethereum address format for "walletAddress" address: ${walletAddress}`;
    }

    const newContact = await this.addressBookService.addContact(userId, name, walletAddress, telegramHandle);

    return `Contact added successfully: ${newContact.name} (${newContact.walletAddress})`;
  }

  async removeContact(userId: string, userWallet: UserWallet, financialActionName: string, parameters: string[], notificationCallback: ((msg: string) => Promise<void>) | null = null): Promise<string> {
    if (parameters.length < 1) {
      return "Insufficient parameters for removing contact. Required: contactId";
    }
    const [name] = parameters;
    if (!name) {
      return "Contact name must be provided for removing contact";
    }

    var isRemoved = await this.addressBookService.removeContact(userId, name);
    if (isRemoved) {
      return "Contact removed successfully";
    } else {
      return "Contact not found. Please provide exact name of the contact.";
    }
  }


  async updateContact(userId: string, userWallet: UserWallet, financialActionName: string, parameters: string[], notificationCallback: ((msg: string) => Promise<void>) | null = null): Promise<string> {
    if (parameters.length < 2) {
      return "Insufficient parameters for updating contact. Required: contactId, at least one field to update";
    }

    const [name, ...updateParams] = parameters;
    if (!name) {
      return "Contact name must be provided for updating contact";
    }

    const updateData: Record<string, string> = {};

    // Parse update parameters (name=value format)
    for (const param of updateParams) {
      const [key, value] = param.split('=');
      if (key && value) {
        updateData[key] = value;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return "At least one field must be provided for update";
    }

    const updatedContact = await this.addressBookService.updateContact(userId, name, updateData);
    return `Contact updated successfully: ${updatedContact?.name} (${updatedContact?.walletAddress})`;
  }

} 