# StickMark

A polished React Native/Expo mini-app for Telegram: list, buy, and manage NFTs with Telegram Stars and TON. Built with TypeScript, Convex, and a Telegram-first UX.

## Features
- Telegram-native payments
  - Stars invoices via Telegram
  - TON transfer with Telegram Wallet priority and TonConnect support
- NFT marketplace flows: list, buy, remove listing, delete NFT
- Telegram bot integration: webhook, left blue menu opens the web app, fixed reply keyboard, commands
- Elegant Telegram-inspired UI

## Project Structure
- App.tsx – entry
- screens – app screens
- components – UI components
- lib – utilities (wallet helpers)
- convex – backend functions and schema

## Environment
This app runs in a managed Expo environment on a0.dev with Convex. No local CLI is required.

## Telegram Bot
- Bot token is configured server-side in Convex settings
- Webhook endpoint: /telegram/webhook (provided by Convex HTTP action)
- Left menu button opens the web app; commands include /market, /mint, /help

Open the bot in Telegram:
- https://t.me/<your_bot_username>

## Development
- Keep code in TypeScript, React Native/Expo compatible
- Avoid native directories (managed workflow)
- Ensure UI remains consistent with Telegram theme

## License
All rights reserved.