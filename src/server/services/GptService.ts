import { db } from "~/server/db";
import OpenAI from 'openai';
import { ChatSummarySchema } from "~/schemas/chatSummary";
import { zodResponseFormat } from "openai/helpers/zod";
import type { UserWallet } from "@prisma/client";
import { CryptoService } from "./CryptoService";
import { AddressBookService } from "./AddressBookService";

export class GptService {
  private openai: OpenAI;
  private cryptoService: CryptoService;
  private addressBookService: AddressBookService;

  constructor() {
    // Initialize OpenAI client with API key from environment variable
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.cryptoService = new CryptoService(db);
    this.addressBookService = new AddressBookService(db);
  }

  async generateChatResponse(accountId: string, userWallet: UserWallet, agentName: string, userMessage: string, context: string): Promise<string> {
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

    try {
      var contactList = await this.addressBookService.getContactList();
      var coinbaseSupportedSwapCurrencies = this.cryptoService.getCoinbaseSupportedSwapCurrencies();
      var contactListString = "User's contacts: " + contactList.map(c => `${c.name} ${c.surname} (${c.walletAddress})`).join(', ');
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
            1. sendCrypto(fromAddress, toAddress, amount, currency)
            2. swapCrypto(walletAddress, fromCurrency, toCurrency, amount)
            3. getCryptoRate(fromCurrency, toCurrency)
            4. getWalletBalance(walletAddress, currency)
            5. getContactList()
            6. findContactByName(name)

            For swapCrypto, the following currencies are supported: ${coinbaseSupportedSwapCurrencies.join(', ')}.

            Based on the conversation, determine if you have all necessary information to execute a financial action. 
            Be helpful and reasonable. Don't expect perfect input from user. For instance, if user types mon, or MON, or Monad, or MONAD; do understand that user is referring to the currency "MON".
            If so, return a structured response with chatType="financialActionExecution" and the appropriate financialActionName and financialActionParameters. 
            Otherwise, return chatType="financialActionClarification" and continue the conversation in regularChatMessage.
            Only ask for missing function name and parameters and nothing else.
            Mention the user available functions with friendly names that a person not familiar with the app would understand.
            
            Your response must be a valid JSON object with the following structure:
            {
              "chatType": "financialActionClarification" or "financialActionExecution",
              "financialActionName": (optional) name of the function to call,
              "financialActionParameters": (optional) array of string parameters for the function,
              "regularChatMessage": (optional) message to send to the user
            }
            
            When you have enough information to execute a financial action, set chatType to "financialActionExecution", 
            provide the appropriate financialActionName, and include all necessary parameters as strings in the financialActionParameters array.` 
            + "The user wallet address is: " + userWallet.address + ". Show this address to user when asked.\n" +
            + "If user mentions a contact name, use the following contact list to guess the contact."
            + contactListString + "\n" +
            + agentConfig.instruction
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

      if (!response){
        return "I had an error while processing your request. Please try again.";
      }

      console.log("Gpt response: " + JSON.stringify(response));
      console.log("Rationale for response: " + response.rationaleForResponse);

      if (response.chatType === "financialActionExecution"){
        const result = await this.handleFinancialExecution(accountId, userWallet, response.financialActionName!, response.financialActionParameters!);
        return result;
      } else if (response.chatType === "financialActionClarification" && response.regularChatMessage){
        return response.regularChatMessage
      } else {
        return "I didn't understand. Please try again.";
      }
    } catch (error) {
      console.error('Error processing user message:', error);
      throw new Error('Failed to process user message');
    }
  }

  async handleFinancialExecution(userId: string, userWallet: UserWallet, financialActionName: string, parameters: string[]): Promise<string> {

    console.log("User ID: " + userId + ", Handling financial execution: " + financialActionName + " with parameters: " + parameters.join(","));
    
    try {
      switch(financialActionName) {
        case "sendCrypto": {
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

          const rpcProvider = await db.rpcProvider.findUnique({
            where: {
              currency: currency
            }
          });
          
          if (!rpcProvider) {
            throw new Error(`RPC provider not found for currency: ${currency}`);
          }
          

          var result;
          if (rpcProvider.isNative){
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
          return `Successfully sent ${amount} ${currency} to ${toAddress}. Transaction hash: ${result.txHash}`;
          }
        }
        case "sendNativeToken": {
          if (parameters.length < 4) {
            return "Insufficient parameters for sending native token. Required: fromAddress, toAddress, amount, currency";
          }
          const [fromAddress, toAddress, amount, currency] = parameters;
          if (!fromAddress || !toAddress || !amount || !currency) {
            return "All parameters must be provided for sending native token: fromAddress, toAddress, amount, currency";
          }

          if (fromAddress !== userWallet.address) {
            return "You can only send crypto from your own wallet. Please use the wallet address: " + userWallet.address;
          }

          const result = await this.cryptoService.sendNativeToken(
            fromAddress, 
            toAddress, 
            Number(amount), 
            currency,
            userId,
            "AUTO"
          );
          return `Successfully sent ${amount} ${currency} to ${toAddress}. Transaction hash: ${result.txHash}`;
        }
        
        case "swapCrypto": {
          if (parameters.length < 4) {
            return "Insufficient parameters for swapping crypto. Required: walletAddress, fromCurrency, toCurrency, amount";
          }
          const [walletAddress, fromCurrency, toCurrency, amount] = parameters;
          if (!walletAddress || !fromCurrency || !toCurrency || !amount) {
            return "All parameters must be provided for swapping crypto: walletAddress, fromCurrency, toCurrency, amount";
          }

          if (walletAddress !== userWallet.address) {
            return "You can only send crypto from your own wallet. Please use the wallet address: " + userWallet.address;
          }



          const result = await this.cryptoService.getSwapCryptoQuote(
            fromCurrency, 
            toCurrency, 
            Number(amount),
            walletAddress
          );

          
          return `Successfully swapped ${amount} ${fromCurrency} to ${result.amountReceived.toFixed(6)} ${toCurrency} at rate ${result.exchangeRate.toFixed(6)}`;
        }
        
        // TODO: Implement buyCrypto
        // case "buyCrypto": {
        //   if (parameters.length < 4) {
        //     return "Insufficient parameters for buying crypto. Required: walletAddress, currency, amount, fiatCurrency";
        //   }
        //   const [walletAddress, currency, amount, fiatCurrency] = parameters;
        //   if (!walletAddress || !currency || !amount || !fiatCurrency) {
        //     return "All parameters must be provided for buying crypto: walletAddress, currency, amount, fiatCurrency";
        //   }

        //   if (walletAddress !== userWallet.address) {
        //     return "You can only send crypto from your own wallet. Please use the wallet address: " + userWallet.address;
        //   }


        //   const result = await this.cryptoService.buyCrypto(
        //     walletAddress, 
        //     currency, 
        //     Number(amount), 
        //     fiatCurrency
        //   );
        //   return `Successfully bought ${result.cryptoAmount.toFixed(6)} ${currency} with ${amount} ${fiatCurrency} at rate ${result.rate.toFixed(2)}`;
        // }
        
        case "getCryptoRate": {
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
        
        case "getWalletBalance": {
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
        
        case "getContactList": {
          const contacts = await this.addressBookService.getContactList();
          return `Your contacts: ${contacts.map(c => `${c.name} ${c.surname} (${c.walletAddress})`).join(', ')}`;
        }
        
        case "findContactByName": {
          if (parameters.length < 1) {
            return "Insufficient parameters for finding contact. Required: name";
          }
          const [name] = parameters;
          if (!name) {
            return "Name must be provided for finding contact";
          }
          
          const contacts = await this.addressBookService.findContactByName(name);
          if (contacts.length === 0) {
            return `No contacts found with name: ${name}`;
          }
          return `Found contacts: ${contacts.map(c => `${c.name} ${c.surname} (${c.walletAddress})`).join(', ')}`;
        }
        
        default:
          return `Unknown financial action: ${financialActionName}`;
      }
    } catch (error: any) {
      console.error(`Error executing financial action ${financialActionName}:`, error);
      return `Ops, something went wrong: ${error.message}`;
    }
  }
  
  private async getUsernameFromId(userId: string): Promise<string> {
    const user = await db.user.findUnique({
      where: { id: userId }
    });
    return user?.name || userId;
  }
} 