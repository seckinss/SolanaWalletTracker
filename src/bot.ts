import { TelegramTracker } from "./TelegramTracker";
import dotenv from 'dotenv';
dotenv.config();
// TODO: instead of using env use a database to fetch all subscriptions 
for (let i = 0; i <= 5; i++) {
    const walletKey = i === 0 ? 'trackWallet' : `trackWallet${i}`;
    const traderNameKey = i === 0 ? 'traderName' : `traderName${i}`;
    
    if (process.env[walletKey]) {
        const telegramBot = new TelegramTracker({
            rpcUrl: process.env.rpc || '',
            trackWallet: process.env[walletKey] || '',
            botKey: process.env.botKey || '',
            subs: process.env.subs || '',
            ws: process.env.ws_tg || '',
            traderName: process.env[traderNameKey]
        });
        telegramBot.start();
    }
}