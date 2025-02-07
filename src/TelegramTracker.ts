import { Connection } from '@solana/web3.js';
import WebSocket from 'ws';
import { Telegraf } from 'telegraf';
import { TxParser } from './txParser';

interface TelegramConfig {
    ws: string;
    botKey: string;
    trackWallet: string;
    traderName?: string;
    rpcUrl: string;
    subs: string;
}

export class TelegramTracker{
    private ws: WebSocket;
    private wsUrl: string;
    private botKey: string;
    private connection: Connection;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 5000;
    private trackWallet: string
    private traderName: string;
    private parser: TxParser;
    private subs: string[];
    constructor(config: TelegramConfig) {
        this.wsUrl = config.ws;
        this.ws = new WebSocket(config.ws);
        this.botKey = config.botKey;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000;
        this.trackWallet = config.trackWallet;
        this.connection = new Connection(config.rpcUrl);
        this.traderName = config.traderName || this.trackWallet.slice(0, 4) + '..' + this.trackWallet.slice(-4);
        this.subs = config.subs.split(',');
        this.parser = new TxParser({
            connection: this.connection,
            name: this.traderName,
            signer: this.trackWallet
        });
    }
    private async waitForOpenConnection(): Promise<void> {
        return new Promise((resolve, reject) => {
            const maxNumberOfAttempts = 10;
            const intervalTime = 200; //ms
            let currentAttempt = 0;
            const interval = setInterval(() => {
                if (currentAttempt > maxNumberOfAttempts - 1) {
                    clearInterval(interval);
                    reject(new Error('Maximum number of attempts exceeded'));
                } else if (this.ws.readyState === WebSocket.OPEN) {
                    clearInterval(interval);
                    resolve();
                }
                currentAttempt++;
            }, intervalTime);
        });
    }
    private connect() {
        this.ws = new WebSocket(this.wsUrl);
        this.ws.on('open', async () => {
            console.log('Connected to RPC');
            this.reconnectAttempts = 0;
            const subscriptionRequest1 = {
                jsonrpc: "2.0",
                id: 1,
                method: "logsSubscribe",
                params: [
                {
                    mentions: [this.trackWallet]
                },
                {
                    commitment: "confirmed"
                }
            ]
        };
        try {
            await this.waitForOpenConnection();
            this.ws.send(JSON.stringify(subscriptionRequest1));
            console.log('Subscription request sent for:', this.trackWallet);
            this.startPing(this.ws);
        } catch (err) {
            console.error('Failed to send subscription request:', err);
        }
    });

    this.ws.on('message', (data: any) => {
        const response = JSON.parse(data.toString());
        if (response && response.params && response.params.result && response.params.result.value) {
            const tx = response.params.result.value.signature;
            this.parser.parseTx(tx).then(parsedTx => {
                if (parsedTx) {
                    this.parser.formatMessage(parsedTx, tx).then(message => {
                        this.sendMessage(message.message, message.url);
                    });
                }
            });
        }
    });

    this.ws.on('error', (error: any) => {
        console.error('WebSocket error:', error);
    });

    this.ws.on('close', () => {
        console.log('Disconnected from RPC');
        this.reconnect();
    });
}
    private reconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => this.connect(), this.reconnectDelay);
        } else {
            console.error('Max reconnection attempts reached. Please check your connection and restart the application.');
        }
    }
    private startPing(ws: WebSocket) {
        console.log('Ping started');
        const pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                try {
                    ws.ping();
                } catch (error) {
                    console.error('Ping error:', error);
                    clearInterval(pingInterval);
                }
            } else if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
                console.log('WebSocket closed or closing, stopping ping');
                clearInterval(pingInterval);
            }
        }, 60000); 
    }
    private sendMessage(message: string, url: string) {
        if(!message.includes('swapped')) return;
        const bot = new Telegraf(this.botKey);
        for(const sub of this.subs) {
            bot.telegram.sendMessage(sub, message, {parse_mode: 'MarkdownV2', link_preview_options: {is_disabled: true}, reply_markup: {inline_keyboard: [[{text: 'Trade On Jupiter', url: url}]]}});
        }
    }
    public start() {
        this.connect();
    }
}
