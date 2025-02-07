<h3 align="center">
    <p>Solana Wallet Tracker (Only For Swap Transactions)</p>
</h3>

`tg-wallet-tracker` is a project that enables you to track solana wallet transactions and get notified via telegram.

## Table of Contents
- [Quick Demo](#quick-demo)
- [Environment Variables](#environment-variables)

## Quick demo

First install the package.
```bash
git clone https://github.com/seckinss/SolanaWalletTracker.git
```
Fill necessary environment variables.
```bash
cp .env.example .env
```
Install necessary packages.
```bash
npm install
```
Build the project.
```bash
npm run build
```
Run the project.
```bash
npm run start
```

## Environment Variables

- `BOT_KEY`: The bot token for the telegram bot. You can get your bot token from [here](https://t.me/BotFather).
- `RPC_URL`: The rpc url for the solana blockchain.
- `TRACK_WALLET`: The wallet address to track.
- `SUBS`: The telegram chat ids to send the notifications to.
