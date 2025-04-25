// import { NextRequest, NextResponse } from 'next/server';
// import { TwitterService } from '~/server/services/TwitterService';
// import { db } from '~/server/db';
// import { auth } from '~/server/auth';

// export async function GET(request: NextRequest) {
    
//   const searchParams = request.nextUrl.searchParams;
//   const code = searchParams.get('code');
//   const state = searchParams.get('state');

//   if (!code || !state) {
//     return NextResponse.redirect(new URL('/auth/error', request.url));
//   }

//   try {
//     return NextResponse.redirect(new URL('/auth/error', request.url));

//     const session = await auth();
//     const twitterService = new TwitterService();
    
//     // Retrieve the code verifier from session or secure storage
//     // In a real-world scenario, you'd want to securely store and retrieve this
//     const codeVerifier = "challenge"; // For simplicity, using state as code verifier

//     const callbackUrl = `${process.env.NEXTAUTH_URL}/api/x-oauth`;

//     const { accessToken, refreshToken, userAccountId, token_type, expires_at, scope, name, username } = await twitterService.handleOAuthCallback(
//       callbackUrl,
//       code,
//       codeVerifier
//     );

//     const userId = session?.user?.id ?? (await db.user.create({
//         data: {
//           name: name,
//           email: `${username}@twitter.com`, // Temporary email
//         }
//       })).id;

//     await db.account.upsert({
//         where: {
//           provider_providerAccountId: {
//             provider: 'twitter',
//             providerAccountId: userAccountId
//           },
//         },
//         update: {
//           access_token: accessToken,
//           refresh_token: refreshToken,
//           token_type,
//           expires_at,
//           scope,
//           // You might want to add more fields like expires_at, token_type, etc.
//         },
//         create: {
//           type: 'oauth',
//           provider: 'twitter',
//           providerAccountId: userAccountId,
//           access_token: accessToken,
//           refresh_token: refreshToken,
//           token_type,
//           expires_at,
//           scope,
//           userId
//         },
//       });

//     // Redirect to a success page or back to the main application
//     return NextResponse.redirect(new URL('/configurations', request.url));

//   } catch (error) {
//     console.error('X OAuth Callback Error:', error);
//     return NextResponse.redirect(new URL('/auth/error', request.url));
//   }
// } 