import { Connection, ParsedTransactionWithMeta, PublicKey } from "@solana/web3.js";
import { fetchDigitalAsset } from '@metaplex-foundation/mpl-token-metadata';
import { publicKey } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';


interface TradeInfo {
  type: 'BUY' | 'SELL';
  trader: string;
  inputToken: {
    mint: string;
    amount: number;
  };
  outputToken: {
    mint: string;
    amount: number;
  };
}

interface tokenDifference {
  mint: string;
  amount: number;
  programId: PublicKey;
  preBalance: number;
  decimals: number;
}

interface tokenMetadata {
  metadata: {
    symbol: string;
  }
  mint: {
    supply: number;
    decimals: number;
  }
}

interface txConfig {
  connection: Connection;
  name?: string;
  signer: string;
}

export class TxParser {
  private connection: Connection;
  static char = "`";
  private static programs = {
    RAYDIUM: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
    JUPITER: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
    PUMPFUN: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
    METEORADLMM: "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
    METEORAPOOL: "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB"
  }
  private SOL_MINT = "So11111111111111111111111111111111111111112";
  private name;
  private signer;
  constructor(config: txConfig) {
    this.connection = config.connection;
    if (config.name) this.name = config.name;
    this.signer = config.signer;
  }
  async parseTx(signature: string): Promise<ParsedTransactionWithMeta | null> {
    try {
      const tx = await this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 10,
        commitment: "confirmed"
      });
      return tx;
    } catch (error) {
      console.error(`Error fetching transaction ${signature}:`, error);
      return null;
    }
  }

  async formatMessage(tx: ParsedTransactionWithMeta, signature: string): Promise<{ message: string, url: string }> {
    try {
      const { tradeInfo, programName } = await this.parseTradeInfo(tx);
      if (!tradeInfo) return { message: "Not a trade transaction", url: "" };
      const messages: string[] = [];
      const [input_metadata, output_metadata, prices] = await Promise.all([this.getTokenMetadata(tradeInfo.inputToken.mint), this.getTokenMetadata(tradeInfo.outputToken.mint), TxParser.getPricesJUP(tradeInfo.inputToken.mint, tradeInfo.outputToken.mint)]);
      const emoji = tradeInfo.type === 'BUY' ? '🟢' : '🔴';
      if (!input_metadata || !output_metadata) return { message: "Error fetching token metadata", url: "" };
      const inputSymbol = this.escapeMarkdown(input_metadata.metadata.symbol);
      const outputSymbol = this.escapeMarkdown(output_metadata.metadata.symbol);
      tradeInfo.outputToken.amount /= 10 ** output_metadata.mint.decimals;
      tradeInfo.inputToken.amount /= 10 ** input_metadata.mint.decimals;
      messages.push(`${emoji} [${tradeInfo.type} ${tradeInfo.type === 'BUY' ? outputSymbol : inputSymbol}](https://solscan\\.io/tx/${signature}) on ${programName}`);
      messages.push(`${TxParser.char + tradeInfo.trader + TxParser.char} \\(${this.name}\\)\n`);
      const inputAmount = this.escapeMarkdown(this.formatAmount(tradeInfo.inputToken.amount));
      const outputAmount = this.escapeMarkdown(this.formatAmount(tradeInfo.outputToken.amount));
      let totalValue = this.escapeMarkdown(this.formatAmount(tradeInfo.inputToken.amount * prices.input)); // check later
      let ratio
      let marketCap;
      if (this.isSOL(tradeInfo.inputToken.mint)) {
        totalValue = this.escapeMarkdown(this.formatAmount(tradeInfo.inputToken.amount * prices.input));
        ratio = this.escapeMarkdown((tradeInfo.inputToken.amount * prices.input / tradeInfo.outputToken.amount).toString());
        const mcapCalc = (BigInt(Math.floor(prices.output * 1e10)) * BigInt(output_metadata.mint.supply)) / BigInt(10 ** Number(output_metadata.mint.decimals)) / BigInt(1e10);
        marketCap = this.escapeMarkdown(TxParser.formatMCAP(Number(mcapCalc.toString())));
      } else {
        totalValue = this.escapeMarkdown(this.formatAmount(tradeInfo.outputToken.amount * prices.output));
        ratio = this.escapeMarkdown((tradeInfo.outputToken.amount * prices.output / tradeInfo.inputToken.amount).toString());
        const mcapCalc = (BigInt(Math.floor(prices.input * 1e10)) * BigInt(input_metadata.mint.supply)) / BigInt(10 ** Number(input_metadata.mint.decimals)) / BigInt(1e10);
        marketCap = this.escapeMarkdown(TxParser.formatMCAP(Number(mcapCalc.toString())));
      }
      messages.push(`🔹[${this.name}](https://solscan\\.io/account/${tradeInfo.trader}) swapped *${inputAmount}* [${inputSymbol}](https://solscan\\.io/token/${tradeInfo.inputToken.mint}) for ${outputAmount} \\($${totalValue}\\) [${outputSymbol}](https://solscan\\.io/token/${tradeInfo.outputToken.mint}) @$${ratio}\n`);
      messages.push(`🔹[${this.name}](https://solscan\\.io/account/${tradeInfo.trader}):`);
      messages.push(`[${inputSymbol}](https://solscan\\.io/token/${tradeInfo.inputToken.mint}): ${TxParser.char}\\-${inputAmount} \\($${this.escapeMarkdown(this.formatAmount(prices.input * tradeInfo.inputToken.amount))}\\)${TxParser.char}`);
      messages.push(`[${outputSymbol}](https://solscan\\.io/token/${tradeInfo.outputToken.mint}): ${TxParser.char}\\+${outputAmount} \\($${this.escapeMarkdown(this.formatAmount(prices.output * tradeInfo.outputToken.amount))}\\)${TxParser.char}`);
      messages.push(`\n[Trade ${outputSymbol} \\- ${inputSymbol}](https://jup\\.ag/swap/${tradeInfo.outputToken.mint}\\-${tradeInfo.inputToken.mint}) \\| MC: ${marketCap}\n${TxParser.char}${this.isSOL(tradeInfo.outputToken.mint) ? tradeInfo.inputToken.mint : tradeInfo.outputToken.mint}${TxParser.char}`);
      return { message: messages.join('\n'), url: `https://jup.ag/swap/${tradeInfo.outputToken.mint}-${tradeInfo.inputToken.mint}` };
    } catch (error) {
      console.error("Error formatting transaction message:", error);
      return { message: "Error parsing transaction", url: "" };
    }
  }

  private async parseTradeInfo(tx: ParsedTransactionWithMeta): Promise<{ tradeInfo: TradeInfo | null, programName: string | null }> {
    const hasTrade = tx.transaction.message.instructions.some(
      ix => ix.programId.toBase58() === TxParser.programs.RAYDIUM || ix.programId.toBase58() === TxParser.programs.JUPITER
        || ix.programId.toBase58() === TxParser.programs.PUMPFUN || ix.programId.toBase58() === TxParser.programs.METEORADLMM
        || ix.programId.toBase58() === TxParser.programs.METEORAPOOL
    );
    if (!hasTrade) return { tradeInfo: null, programName: null };
    const tokenDifference = TxParser.calculateTokenDifference(tx);
    if (!tokenDifference) { return { tradeInfo: null, programName: null }; }
    const trader = tx.transaction.message.accountKeys.find(key => key.signer)?.pubkey;
    if (!trader || trader.toString() !== this.signer) return { tradeInfo: null, programName: null };
    const getProgramName = (programId: string): string => {
      for (const [key, value] of Object.entries(TxParser.programs)) {
        if (value === programId) return key;
      }
      return 'Unknown';
    }
    if (tokenDifference[0].amount > 0) {
      return {
        tradeInfo: {
          type: this.isSOL(tokenDifference[1].mint) ? 'BUY' : 'SELL',
          trader: trader.toString(),
          inputToken: {
            mint: tokenDifference[1].mint,
            amount: Math.abs(tokenDifference[1].amount)
          },
          outputToken: {
            mint: tokenDifference[0].mint,
            amount: Math.abs(tokenDifference[0].amount)
          }
        }, programName: getProgramName(tokenDifference[0].programId.toBase58())
      };
    } else {
      return {
        tradeInfo: {
          type: this.isSOL(tokenDifference[0].mint) ? 'BUY' : 'SELL',
          trader: trader.toString(),
          inputToken: {
            mint: tokenDifference[0].mint,
            amount: Math.abs(tokenDifference[0].amount)
          },
          outputToken: {
            mint: tokenDifference[1].mint,
            amount: tokenDifference[1].amount
          }
        }, programName: getProgramName(tokenDifference[1].programId.toBase58())
      };
    }
  }

  private isSOL(mint?: string): boolean {
    return mint === this.SOL_MINT;
  }

  private formatAmount(amount: number): string {
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  public static calculateTokenDifference(result: any): tokenDifference[] | null {
    try {
      const owner = result.transaction.message.accountKeys.find((key: any) => key.signer)?.pubkey.toBase58();
      if (!result || !result.meta) return null;

      const postBalances = result.meta.postTokenBalances;
      const preBalances = result.meta.preTokenBalances;
      const differences: tokenDifference[] = [];

      const program = result.transaction.message.instructions.find(
        (instruction: any) =>
          instruction.programId == this.programs.JUPITER ||
          instruction.programId == this.programs.PUMPFUN ||
          instruction.programId == this.programs.RAYDIUM ||
          instruction.programId == this.programs.METEORADLMM ||
          instruction.programId == this.programs.METEORAPOOL
      )?.programId || null;
      const signer = result.transaction.message.accountKeys.find(
        (key: { signer: boolean; }) => key.signer === true
      )?.pubkey || null;
      if (!program || !signer || signer !== owner) return null;

      for (const postBalance of postBalances.filter((balance: { owner: string; }) => balance.owner === owner)) {
        let preBalance = preBalances.find((balance: { owner: string; mint: string; }) =>
          balance.owner === owner && balance.mint === postBalance.mint
        );

        if (!preBalance) {
          preBalance = {
            mint: postBalance.mint,
            owner: postBalance.owner,
            programId: postBalance.programId,
            uiTokenAmount: {
              amount: '0',
              decimals: postBalance.uiTokenAmount.decimals,
              uiAmount: 0,
              uiAmountString: '0'
            }
          };
        }

        const postAmount = Number(postBalance.uiTokenAmount.amount);
        const preAmount = Number(preBalance.uiTokenAmount.amount);
        const difference = postAmount - preAmount;

        if (difference !== 0) {
          differences.push({
            mint: postBalance.mint,
            amount: difference,
            programId: program,
            preBalance: preAmount,
            decimals: postBalance.uiTokenAmount.decimals
          });
        }
      }

      for (const preBalance of preBalances.filter((balance: { owner: string; }) => balance.owner === owner)) {
        const hasPost = postBalances.some((post: { owner: string; mint: string; }) =>
          post.owner === owner && post.mint === preBalance.mint
        );

        if (!hasPost) {
          differences.push({
            mint: preBalance.mint,
            amount: -Number(preBalance.uiTokenAmount.amount),
            programId: program,
            preBalance: Number(preBalance.uiTokenAmount.amount),
            decimals: preBalance.uiTokenAmount.decimals
          });
        }
      }
      const solAccount = result.transaction.message.accountKeys.findIndex((key: any) => key.signer);
      if (solAccount > -1) {
        differences.push({
          mint: 'So11111111111111111111111111111111111111112',
          amount: Number(result.meta.postBalances[solAccount]) - Number(result.meta.preBalances[solAccount]),
          programId: program,
          preBalance: Number.isNaN(Number(preBalances[solAccount])) ? 0 : Number(preBalances[solAccount]),
          decimals: 9,
        })
      }
      return differences.length > 0 ? differences : [];
    } catch (error) {
      console.error('Error calculating token differences:', error);
      return [];
    }
  }

  public async getTokenMetadata(mint: string): Promise<tokenMetadata | null> {
    try {
      const context = createUmi(this.connection);
      const metadata = await fetchDigitalAsset(context, publicKey(mint));
      return {
        metadata: metadata.metadata,
        mint: {
          supply: Number(metadata.mint.supply),
          decimals: Number(metadata.mint.decimals)
        }
      };
    } catch (error) {
      return this.getTokenMetadataDAS(mint);
    };
  }
  async getTokenMetadataDAS(mint: string) {
    try {
      const url = this.connection.rpcEndpoint;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '33',
          method: 'getAsset',
          params: {
            id: mint,
            displayOptions: {
              showFungible: true
            }
          },
        }),
      });
      const { result } = await response.json();
      return {
        metadata: { symbol: result.token_info.symbol },
        mint: { supply: result.token_info.supply, decimals: result.token_info.decimals }
      }
    } catch (error) {
      console.error('Error fetching token metadata:', error);
      return null;
    }
  }
  private escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  }

  static formatMCAP(mcap: number): string {
    if (mcap >= 1_000_000_000) {
      return `$${(mcap / 1_000_000_000).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}B`;
    } else if (mcap >= 1_000_000) {
      return `$${(mcap / 1_000_000).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}M`;
    } else if (mcap >= 1_000) {
      return `$${(mcap / 1_000).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}K`;
    } else {
      return `$${mcap.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`;
    }
  }
  static convertBytesToNumber(bytes: string): number {
    const littleEndian = bytes.match(/../g)?.reverse().join("") || "";
    const number = BigInt("0x" + littleEndian);
    return Number(number);
  }
  static async getPricesJUP(input: string, output: string): Promise<{ input: number, output: number }> {
    const response = await fetch(`https://api.jup.ag/price/v2?ids=${input},${output}`);
    const data = await response.json();
    const inputPrice = data.data[input]?.price ? Number(data.data[input].price) : 0;
    const outputPrice = data.data[output]?.price ? Number(data.data[output].price) : 0;
    return { input: inputPrice, output: outputPrice };
  }
}
