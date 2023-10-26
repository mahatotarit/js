const https = require('https');
const { ethers } = require('ethers');

// ================= get gas price funcitn start ================
async function getGasPrice() {
  try {
    const response = await new Promise((resolve, reject) => {
      https
        .get(
          'https://api.etherscan.io/api?module=gastracker&action=gasoracle',
          (res) => {
            let data = '';
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => {
              resolve(data);
            });
          },
        )
        .on('error', (e) => {
          reject(e);
        });
    });

    const gasInfo = JSON.parse(response);
    const live_gas_price = gasInfo.result.FastGasPrice;
    return live_gas_price;
  } catch (error) {
    console.error('Error fetching gas price:', error);
  }
}
// ================= get gas price funcitn end ================

require('dotenv').config();

const { BigNumber, utils } = ethers;

const provider = new ethers.WebSocketProvider(
  `wss://${process.env.ETHEREUM_NETWORK}.infura.io/ws/v3/${process.env.INFURA_ID}`,
  process.env.ETHEREUM_NETWORK,
);

const depositWallet = new ethers.Wallet(
  process.env.DEPOSIT_WALLET_PRIVATE_KEY,
  provider,
);

let sentTransactions = {};

async function main() {
  try {
    const depositWalletAddress = await depositWallet.getAddress();

    console.log(`Watching for incoming tx to ${depositWalletAddress}…`);
    console.log("");

    provider.on('pending', async (txHash) => {
      try {

        if (sentTransactions[txHash]) {
          console.log(`Watching for incoming tx to ${depositWalletAddress}…`);
          console.log("");
          return;
        }

        const tx = await provider.getTransaction(txHash);
        if (!tx) return;

        const { from, to, value } = tx;

        if (to === depositWalletAddress) {
          const valueInEther = ethers.formatEther(value);
          console.log(`${valueInEther} ETH coming to ${to} wallet from ${from} wallet.`);

          console.log(`Waiting for ${process.env.CONFIRMATIONS_BEFORE_WITHDRAWAL} confirmations…`,);

          const receipt = await tx.wait(process.env.CONFIRMATIONS_BEFORE_WITHDRAWAL,);

          if (receipt.status === 1) {
            const gasPrice = await getGasPrice() / 10;
            const gasLimit = 21000;
            const maxGasFee = Math.round((gasPrice * gasLimit) * 1e9); // wei 

            const balance = await provider.getBalance(depositWalletAddress);
            const currentBalance = (balance - BigInt(maxGasFee)).toString(); // wei

            if (ethers.formatEther(currentBalance) < 0.00009) {
              console.log(`🛑${ethers.formatEther( currentBalance,)} eth token will not transfer to ${ process.env.VAULT_WALLET_ADDRESS} wallet.🛑`,);
              sentTransactions[txHash] = true;
              console.log('');
              console.log(`Watching for incoming tx to ${depositWalletAddress}…`,);
              console.log('');
              return;
            }

            const nonceValue = await provider.getTransactionCount(depositWalletAddress,);

            console.log(`Transferring ${ethers.formatEther(currentBalance)} ETH to ${process.env.VAULT_WALLET_ADDRESS} wallet.`,
            );

            const tx = {
              from: depositWalletAddress,
              to: process.env.VAULT_WALLET_ADDRESS,
              value: currentBalance,
              nonce: nonceValue,
              chainId: 11155111, // Mainnet chain ID = 1
            };

            const sentTx = await depositWallet.sendTransaction(tx);

            if (sentTx) {
              console.log('✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅',);
              console.log(' ');
            }

            sentTransactions[sentTx.hash] = true;
            
          } else {
            console.error('Transaction failed with status:', receipt.status);
          }


        }
        
      } catch (err) {
        console.error(err);
      }
    });

  } catch (error) {
    console.error('Error in main function:', error);
  }
}

if (require.main === module) {
  main();
}
