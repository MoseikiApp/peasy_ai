import { PrismaAdapter } from "@auth/prisma-adapter";
import { Coinbase } from "@coinbase/coinbase-sdk";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
// import TwitterProvider from "next-auth/providers/twitter";

import { db } from "~/server/db";
import { CryptoService } from "~/server/services/CryptoService";
// import { TwitterService } from "~/server/services/TwitterService";
// import { getBaseUrl } from "~/utils/getBaseUrl"

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      email?: string | null;
      image?: string | null;
      // Add any additional fields you want to expose
    } & DefaultSession["user"];
  }

  // interface User {
  //   // ...other properties
  //   // role: UserRole;
  // }
}

// const twitterProvider = TwitterProvider({
//   clientId: process.env.X_CLIENT_ID!,
//   clientSecret: process.env.X_CLIENT_SECRET!,
// })

// twitterProvider.authorization += " tweet.write";


/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authConfig = {
  providers: [
    DiscordProvider({
      clientId: process.env.AUTH_DISCORD_ID,
      clientSecret: process.env.AUTH_DISCORD_SECRET
    }),
    // TwitterProvider({
    //   clientId: process.env.X_CLIENT_ID,
    //   clientSecret: process.env.X_CLIENT_SECRET,
    //   authorization: {
    //     url: "https://twitter.com/i/oauth2/authorize",
    //     params: { 
    //       scope: "tweet.read tweet.write users.read" 
    //     }
    //   }
    // }),
    // twitterProvider,
    /**
     * ...add more providers here.
     *
     * Most other providers require a bit more work than the Discord provider. For example, the
     * GitHub provider requires you to add the `refresh_token_expires_in` field to the Account
     * model. Refer to the NextAuth.js docs for the provider you want to use. Example:
     *
     * @see https://next-auth.js.org/providers/github
     */
  ],
  adapter: PrismaAdapter(db),
  callbacks: {
    signIn: async ({ user, account }) => {
      console.log("signIn", user, account);

      if (!account) {
        return false;
      }

      try {
        console.log("***Checking if user exists or needs to be created");
        
        // First, check if the user exists and create if not
        const existingUser = await db.user.findUnique({
          where: { id: user.id! }
        });
        
        if (!existingUser) {
          console.log("***Creating new user", user);
          await db.user.create({
            data: {
              id: user.id!,
              name: user.name,
              email: user.email,
              image: user.image
            }
          });
        }
        
        // Now proceed with account upsert knowing the user exists
        console.log("***Upserting account due to signing in", account);
        console.log("***Token expiration date", 
          account.expires_at 
            ? new Date(account.expires_at * 1000).toISOString() 
            : 'No expiration date'
        );
        
        await db.account.upsert({
          where: {
            provider_providerAccountId: {
              provider: account.provider,
              providerAccountId: account.providerAccountId
            }
          },
          update: {
            access_token: account.access_token,
            refresh_token: account.refresh_token,
            expires_at: account.expires_at,
            token_type: account.token_type,
            scope: account.scope
          },
          create: {
            type: account.type ?? 'oauth',
            provider: account.provider,
            providerAccountId: account.providerAccountId,
            access_token: account.access_token,
            refresh_token: account.refresh_token,
            expires_at: account.expires_at,
            token_type: account.token_type,
            scope: account.scope,
            userId: user.id!
          }
        });

        // Create wallet for the user if it doesn't exist
        try {
          const cryptoService = new CryptoService(db);
          const userWallet = await cryptoService.getWallet(user.id!);
          
          if (!userWallet) {
            await cryptoService.createCryptoWallet(
              user.id!,
              user.name || `user-${user.id}`,
              Coinbase.networks.BaseMainnet,
              'ETH'
            );
          }
        } catch (walletError) {
          console.error("Error creating wallet:", walletError);
          // Continue authentication even if wallet creation fails
        }

        return true;
      } catch (error) {
        console.error('Error updating account tokens:', error);
        return false;
      }
    },
    session: ({ session, user }) => ({
      ...session,
      user: {
        ...session.user,
        id: user.id,
      },
    }),
  },
} satisfies NextAuthConfig;
