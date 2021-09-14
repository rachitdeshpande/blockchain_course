const express = require('express')
const bodyParser = require('body-parser');
const bitcoinBackend = express()
const Blockchain = require('./blockchain')
const bitcoin = new Blockchain()
bitcoinBackend.use(bodyParser.json());
bitcoinBackend.use(bodyParser.urlencoded({extended: false}));
const rp = require('request-promise');

const port = process.argv[2]

bitcoinBackend.get('/home',function(req,res){
    res.send('This is homepage');
})

//get entire bloackcahin

bitcoinBackend.get('/blockchain',function(req,res){
    res.send(bitcoin);
})

bitcoinBackend.post('/transaction',function(req,res){
    const newTransaction = req.body;
	const blockIndex = bitcoin.addTransactionToPendingTransactions(newTransaction);
	res.json({ note: `Transaction will be added in block ${blockIndex}.` });
})

//  MAIN STEP-1 BROADCAST TRANSACTIONS //   

bitcoinBackend.post('/transaction/broadcast',function(req,res){
    const newTransaction = bitcoin.createNewTransaction(
        req.body.amount,
        req.body.sender,
        req.body.recipient
    );
    bitcoin.addTransactionToPendingTransactions(newTransaction);

    //broadcasting the transaction object to all other nodes

    const requestPromises = [];
    bitcoin.networkNodes.forEach((networkNodeUrl)=> {
        const requestOptions = {
            url: networkNodeUrl + '/transaction',
            method:'POST',
            body: newTransaction,
            json: true
        };
        requestPromises.push(rp(requestOptions)); //call gets triggered
    });

    Promise.all(requestPromises).then(data=> {
        res.json({note: 'transaction got successfully broadcasted, will take few mins to validate your transaction'})
    })
})

//MAIN STEP - 2 MINING THE BLOCKS//

bitcoinBackend.get('/mine',function(req,res){

    //part - 1

    const lastBlock = bitcoin.getLastBlock()
    const previousBlockHash = lastBlock['hash']
    const currentBlockData = {
        transactions: bitcoin.pendingTransactions,
        index: lastBlock['index'] + 1
    }
    const nonce = bitcoin.proofOfWork(previousBlockHash,currentBlockData)
    const blockHash = bitcoin.generateHash(previousBlockHash,currentBlockData,nonce)
    const newBlock = bitcoin.createNewBlock(nonce,previousBlockHash,hash)

    //part - 2 -- broadcast node to all other nodes

    const requestPromises = [];
    bitcoin.networkNodes.forEach((networkNodeUrl)=> {
        const requestOptions = {
            url: networkNodeUrl + '/receive-new-block',
            method: 'POST',
            body: {newBlock: newBlock},
            json: true
        };
        requestPromises.push(rp(requestOptions));
    });

    //part - 3 -- reward the miner

    Promise.all(requestPromises)
    .then((data) => {
        const requestOptions = {
            url: bitcoin.currentNodeUrl + '/transaction/broadcast',
            method: 'POST',
            body:{
                amount: 6.5,
                sender: "00",
                recipient: nodeAddress
            },
            json: true
        }
        return rp(requestOptions)
    })

    .then((data) => {
        res.json({
            note: "new block mined & broadcasted successfully",
            block: newBlock,
        });
    });
});

//receive new block

bitcoinBackend.post('/receive-new-block',function(req,res){
    const newBlock = req.body.newBlock;
    const lastBlock = bitcoin.getLastBlock();
    const correctHash = lastBlock.hash === newBlock.previousBlockHash;
    const correctIndex = lastBlock['index'] + 1 === newBlock['index']

    if(correctHash && correctIndex){
        bitcoin.chain.push(newBlock);
        bitcoin.pendingTransactions = [];
        res.json({
            note: "New block received and accepted",
            newBlock: newBlock
        });
    } else {
        res.json({
            note: "New block rejected",
            newBlock: newBlock
        });
    }
});

//register a node and broadcast it in the network

bitcoinBackend.post('/register-broadcast-node',function(req,res){

    //STEP - 1 -- register the new node address at the node where it pings first 

    const newNodeUrl = req.body.newNodeUrl;
    console.log(newNodeUrl);
    console.log(bitcoin.networkNodes);
    if(bitcoin.networkNodes.indexOf(newNodeUrl) == -1){
        bitcoin.networkNodes.push(newNodeUrl);
    }

    //STEP - 2 -- let 3002 bradcast the new node info to all the others in the network

    const regNodePromises = [];
    bitcoin.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            url: networkNodeUrl + '/register-node',
            method: 'POST',
            body: {newNodeUrl:newNodeUrl},
            json: true
        }
        regNodePromises.push(rp(requestOptions)); //call gets triggered
    });

    //STEP - 3 -- Bulk registry of other nodes at 3004

    Promise.all(regNodePromises)
    .then(data=> {
        const bulkRegisterOptions = {
            url: newNodeUrl + '/register-nodes-bulk',
            method: 'POST',
            body: {nodeAddresses: [...bitcoin.networkNodes, bitcoin.currentNodeUrl]},
            json: true
        };
        return rp(bulkRegisterOptions);
    })
    .then(data =>{
        res.json({note: 'new node registered successfully'})
    });
});

//register a node with the network

bitcoinBackend.post('/register-node',function(req,res){
    const newNodeUrl = req.body.newNodeUrl;
    const nodeNotAreadyPresent = bitcoin.networkNodes.indexOf(newNodeUrl) == -1;
    const notCurrentNode = bitcoin.currentNodeUrl != newNodeUrl
    if(nodeNotAreadyPresent && notCurrentNode){
        bitcoin.networkNodes.push(newNodeUrl);
        res.json({note:'new node registered successfully'});
    }
});

//register multiple nodes at once

bitcoinBackend.post('/register-nodes-bulk',function(req,res){
    const nodeAddresses = req.body.nodeAddresses;
    nodeAddresses.forEach((networkNodeUrl) => {
       const nodeNotAreadyPresent = bitcoin.networkNodes.indexOf(networkNodeUrl) == -1;
       const notCurrentNode = bitcoin.currentNodeUrl != networkNodeUrl;
       if(nodeNotAreadyPresent && notCurrentNode){
           bitcoin.networkNodes.push(networkNodeUrl);
        }
    });
    res.json({ note: 'Bulk registration successful.' }); 
});

//consensus

bitcoinBackend.get('/consensus',function(req,res){

    //step - 1 get all the blockchains

    const requestPromises = [];
    bitcoin.networkNodes.forEach((networkNodeUrl) => {
        const requestOptions = {
          uri: networkNodeUrl + "/blockchain",
          method: "GET",
          json: true,
        };
        requestPromises.push(rp(requestOptions));
    });  

    //step - 2 find the longest chain

    Promise.all(requestPromises)
    .then(blockchains => {
        const currentChainLength = bitcoin.chain.length;
        let maxChainLength = currentChainLength;
        let newLongestChain = null;
        let newPendingTransactions = null; 
    
        
        blockchains.forEach((blockchain) => {
            if (blockchain.chain.length > maxChainLength) {
            maxChainLength = blockchain.chain.length;
            newLongestChain = blockchain.chain;
            newPendingTransactions = blockchain.pendingTransactions;
            }
        });
    
    //step - 3 validate the longest chain for replacement
          
        if (!newLongestChain || (newLongestChain && !bitcoin.chainIsValid(newLongestChain))) {
            res.json({
                note: 'Current chain has not been replaced.',
                chain: bitcoin.chain
            });
        }
        else {
                bitcoin.chain = newLongestChain;
                bitcoin.pendingTransactions = newPendingTransactions;
                res.json({
                    note: "This chain has been replaced.",
                    chain: bitcoin.chain,
                });
            }
    })
})

// get block by blockHash

bitcoinBackend.get("/block/:blockHash", function (req, res) {
    const blockHash = req.params.blockHash;
    const correctBlock = bitcoin.getBlock(blockHash);
    res.json({
        block: correctBlock,
    });
});
  
// get transaction by transactionId

bitcoinBackend.get("/transaction/:transactionId", function (req, res) {
    const transactionId = req.params.transactionId;
    const trasactionData = bitcoin.getTransaction(transactionId);
    res.json({
        transaction: trasactionData.transaction,
        block: trasactionData.block,
    });
});
  
// get address by address

bitcoinBackend.get("/address/:address", function (req, res) {
    const address = req.params.address;
    const addressData = bitcoin.getAddressData(address);
    res.json({
        addressData: addressData,
    });
});

bitcoinBackend.get('/block-explorer', function(req,res){
    res.sendFile('./block-explorer/index.html',{root:__dirname})
})

bitcoinBackend.listen(port, function(){
    console.log(`Listening on port ${port}...`);
});