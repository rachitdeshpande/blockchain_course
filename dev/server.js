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

bitcoinBackend.get('/blockchain',function(req,res){
    res.send(bitcoin);
})

bitcoinBackend.post('/transaction',function(req,res){
    const sellerName = req.body.seller;
    const receiverName = req.body.receiver;
    const assetValue = req.body.assetValue;
    const transaction = {
        sellerName: sellerName,
        receiverName: receiverName,
        assetValue: assetValue
    }
    console.log(transaction);
    res.json({"message":"Transaction is created"})
})

//  MAIN STEP-1 BROADCASR TRANSACTIONS //   

bitcoinBackend.post('/transaction/broadcast',function(req,res){
    const newTransaction = bitcoin.createNewTransaction(
        req.body.seller,
        req.body.receiver,
        req.body.asset
    );

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

//Broadcast the reward

bitcoinBackend.post("/transaction/broadcast/reward", function (req, res) {
    const newTransaction = bitcoin.createNewTransaction(
      req.body.sender,
      req.body.receiver,
      req.body.reward
    );

    //broadcast the reward to all other nodes

    const requestPromises = [];
    bitcoin.networkNodes.forEach((networkNodeUrl) => {
      const requestOptions = {
        url: networkNodeUrl + "/transaction",
        method: "POST",
        body: newTransaction,
        json: true,
      };
      requestPromises.push(rp(requestOptions)); //call gets triggered
    });
  
    Promise.all(requestPromises).then((data) => {
      res.json({note: "transaction got successfully broadcasted, will take few mins to validate your transaction"});
    });
  });

  //MAIN STEP - 2 MINING THE BLOCKS//

bitcoinBackend.get('/mine',function(req,res){

    //part - 1

    const lastBlock = bitcoin.getLastBlock()
    const previousBlockHash = lastBlock['hash']
    const currentBlockData = {
        transactions: bitcoin.pendingTransactions
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
            url: bitcoin.currentNodeUrl + '/transaction-broadcast-reward',
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

bitcoinBackend.post('/register-node',function(req,res){
    const newNodeAddress = req.body.nodeAddress;
    const nodeNotAreadyPresent = bitcoin.networkNodes.indexOf(newNodeAddress) == -1;
    const notCurrentNode = bitcoin.currentNodeUrl != newNodeAddress
    if(nodeNotAreadyPresent && notCurrentNode){
        bitcoin.networkNodes.push(newNodeAddress);
        res.json({note:'new node registered successfully'});
    }
});


bitcoinBackend.post('/register-nodes-bulk',function(req,res){
    const newNodeAddresses = req.body.nodeAddresses;
    newNodeAddresses.forEach((oneNodeUrl) => {
       const nodeNotAreadyPresent = bitcoin.networkNodes.indexOf(oneNodeUrl) == -1;
       const notCurrentNode = bitcoin.currentNodeUrl != oneNodeUrl;
       if(nodeNotAreadyPresent && notCurrentNode){
           bitcoin.networkNodes.push(oneNodeUrl);
        }
    });    
});

bitcoinBackend.listen(port, function(){
    console.log(`Listening on port ${port}...`);
});