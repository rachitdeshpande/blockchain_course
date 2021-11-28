const Blockchain = require('./blockchain')
const bitcoin = new Blockchain()

const previousBlockHash = 'asdasdasd';
const currentBlockData = {
    "sender":"rachit",
    "recipient":"deshpande",
    "amount": 13e123
}

// const blockInfo = bitcoin.createNewBlock(3234234,'asdasdasd','adasdasdasd');
// const hash = bitcoin.generateHash(3234234,'asdasdasd','adasdasdasd');
const nonce = bitcoin.proofOfWork(previousBlockHash,currentBlockData);

console.log(nonce);
// console.log(blockInfo)