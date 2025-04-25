
# App skeleton template
This is a Web3 AI assistant that works as Telegram bot.
It uses Coinbase API and also Ethers.js for Web3 operations.

It also offers a basic web interface for managing the account. 
The web interface can be extended with more features for connecting wallets in browser to perform transactions and add credits to the account.

Note - This project is bootstrapped with `create-t3-app` [See T3 Stack](https://create.t3.gg/).

## DB preparation
Install postgres and create a new database.

### Enable uuid-ossp extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

### Deploy migrations

npx prisma migrate deploy

## Deploy initial data

See the scripts under `prisma/customScripts`

### Create a new migration

npx prisma migrate dev --name describe_your_changes

### Generate Prisma client

npx prisma generate

## Dev PC preparation

npx next telemetry disable

Use .env.example to create .env file and set the correct variables on your local machine.

##Telegram Bot - Webhook setup

curl -F "url=https://your-domain.com/webhook" -F "secret_token=YOUR_SECRET_TOKEN" https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook
