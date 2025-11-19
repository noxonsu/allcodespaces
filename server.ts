// server.ts
// Главный файл системы. Управляет картой Entity-машин, обрабатывает блоки каждые 100мс,
// сохраняет снэпшоты состояния в LevelDB через RLP-сериализацию.
// Содержит глобальный мемпул транзакций, отправляет состояние в браузер через WebSocket.
// Реализует восстановление из последнего блока при перезапуске.

import { Level } from 'level';
import { encode, decode } from '@stablelib/rlp';
import WebSocket, { WebSocketServer } from 'ws';

// Типы
type EntityId = string;

interface Transaction {
  from: EntityId;
  to: EntityId;
  amount: number;
}

interface Block {
  height: number;
  timestamp: number;
  transactions: Transaction[];
  stateRoot: string; //  хеш состояния всех Entity
}

class Server {
  private entities: Map<EntityId, any>; // any  Entity class
  private mempool: Map<EntityId, Transaction[]>;
  private db: Level;
  private wss: WebSocketServer;
  private blockHeight: number;

  constructor() {
    this.entities = new Map();
    this.mempool = new Map();
    this.db = new Level('blockchain.db', { valueEncoding: 'binary' });
    this.wss = new WebSocketServer({ port: 8080 });
    this.blockHeight = 0;

    this.wss.on('connection', ws => {
      console.log('WebSocket connected');
      ws.on('message', message => {
        console.log('received: %s', message);
      });
      ws.send('Hello from server');
    });
  }

  async start() {
    await this.loadLastBlock();
    setInterval(() => this.processBlock(), 100);
  }

  async loadLastBlock() {
    try {
      const lastBlock = await this.db.get('lastBlock');
      const decodedBlock: Block = decode(lastBlock) as Block;
      this.blockHeight = decodedBlock.height;
      console.log(`Loaded last block at height: ${this.blockHeight}`);
    } catch (error) {
      console.log('No previous block found. Starting from genesis.');
      this.blockHeight = 0;
    }
  }

  async processBlock() {
    const transactions = this.getTransactionsFromMempool();
    if (transactions.length === 0) return;

    const timestamp = Date.now();
    // TODO:  изменить состояние Entity на основе транзакций
    const stateRoot = 'fake_state_root'; // TODO:  вычислять настоящий stateRoot

    const block: Block = {
      height: this.blockHeight + 1,
      timestamp,
      transactions,
      stateRoot,
    };

    await this.saveBlock(block);
    this.blockHeight++;
    this.broadcastState(block);
  }

  getTransactionsFromMempool(): Transaction[] {
    const transactions: Transaction[] = [];
    for (const entityTransactions of this.mempool.values()) {
      transactions.push(...entityTransactions);
    }
    this.mempool.clear();
    return transactions;
  }

  async saveBlock(block: Block) {
    const encodedBlock = encode(block);
    await this.db.put(`block_${block.height}`, encodedBlock);
    await this.db.put('lastBlock', encodedBlock);
    console.log(`Saved block ${block.height}`);
  }

  broadcastState(block: Block) {
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(block)); //  отправляем блок как JSON
      }
    });
  }

  addTransactionToMempool(entityId: EntityId, transaction: Transaction) {
    if (!this.mempool.has(entityId)) {
      this.mempool.set(entityId, []);
    }
    this.mempool.get(entityId)?.push(transaction);
  }
}

const server = new Server();
server.start();
