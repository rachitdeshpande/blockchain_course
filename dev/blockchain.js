const sha256 = require('sha256')
const { v1: uuid } = require('uuid');

function Blockchain(){
    this.chain = []; //to store the blocks information
    this.pendingTransactions = [];
    this.networkNodes = [];
    this.currentNodeUrl = process.argv[3];
    this.createNewBlock(1435345300, 'dasdadsasdasd', 'asdasdasdas0'); //genesis
}

//to create a block
Blockchain.prototype.createNewBlock = function(nonce,previousBlockHash,hash){
    const newBlock = {
        index: this.chain.length+1,
        timestamp: Date.now(),
        transactions:this.pendingTransactions,
        nonce:nonce,
        hash:hash,
        previousBlockHash:previousBlockHash
    };
    this.pendingTransactions = []; //once the block gets created delete all the pending transactions
    this.chain.push(newBlock);
    return newBlock;
}

Blockchain.prototype.getLastBlock = function(){
    return this.chain[this.chain.length-1];
}

//to create a transaction
Blockchain.prototype.createNewTransaction = function(amount, sender, recipient){
    const newTransaction = {
        amount: amount,
        sender: sender,
        recipient: recipient,
        transactionId: uuid().split('-').join(')')
    };
    return newTransaction;
}

//to add transactions to pending transactions
Blockchain.prototype.addTransactionToPendingTransactions = function(transactionObj){
    this.pendingTransactions.push(transactionObj);
    return this.getLastBlock()['index'] + 1;
}

Blockchain.prototype.generateHash = function(previousBlockHash,currentBlockData,nonce){
    const dataString = previousBlockHash + nonce.toString() + JSON.stringify(currentBlockData);
    const hash = sha256(dataString);
    return hash;
}

Blockchain.prototype.proofOfWork = function(previousBlockHash,currentBlockData){
    let nonce = 0;
    let hash = this.generateHash(previousBlockHash,currentBlockData,nonce);
    //cryptographic puzzle
    while(hash.substring(0,5) != '00000'){
        nonce++;
        hash = this.generateHash(previousBlockHash,currentBlockData,nonce);
        console.log(hash);
    }
    return nonce;
};

Blockchain.prototype.chainIsValid = function(blockchain) {
	let validChain = true;

	for (var i = 1; i < blockchain.length; i++) {
		const currentBlock = blockchain[i];
		const prevBlock = blockchain[i - 1];
		const blockHash = this.generateHash(prevBlock['hash'], { transactions: currentBlock['transactions'], index: currentBlock['index'] }, currentBlock['nonce']);
		if (blockHash.substring(0, 4) !== '0000') validChain = false;
		if (currentBlock['previousBlockHash'] !== prevBlock['hash']) validChain = false;
	};

	const genesisBlock = blockchain[0];
	const correctNonce = genesisBlock['nonce'] === 100;
	const correctPreviousBlockHash = genesisBlock['previousBlockHash'] === '0';
	const correctHash = genesisBlock['hash'] === '0';
	const correctTransactions = genesisBlock['transactions'].length === 0;

	if (!correctNonce || !correctPreviousBlockHash || !correctHash || !correctTransactions) validChain = false;

	return validChain;
};


Blockchain.prototype.getBlock = function(blockHash) {
	let correctBlock = null;
	this.chain.forEach(block => {
		if (block.hash === blockHash) correctBlock = block;
	});
	return correctBlock;
};


Blockchain.prototype.getTransaction = function(transactionId) {
	let correctTransaction = null;
	let correctBlock = null;

	this.chain.forEach(block => {
		block.transactions.forEach(transaction => {
			if (transaction.transactionId === transactionId) {
				correctTransaction = transaction;
				correctBlock = block;
			};
		});
	});

	return {
		transaction: correctTransaction,
		block: correctBlock
	};
};


Blockchain.prototype.getAddressData = function(address) {
	const addressTransactions = [];
	this.chain.forEach(block => {
		block.transactions.forEach(transaction => {
			if(transaction.sender === address || transaction.recipient === address) {
				addressTransactions.push(transaction);
			};
		});
	});

	let balance = 0;
	addressTransactions.forEach(transaction => {
		if (transaction.recipient === address) balance += transaction.amount;
		else if (transaction.sender === address) balance -= transaction.amount;
	});

	return {
		addressTransactions: addressTransactions,
		addressBalance: balance
	};
};

module.exports = Blockchain; //give access to other files to import constructor Blockchain