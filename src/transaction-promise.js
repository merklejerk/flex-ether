'use strict'

const CONFIRMATION_INTERVAL_MS = 4 * 1000;

function createTransactionPromise(flexEther, txHashPromise) {
    const confirmed = async function(minConfirmations=0) {
        const txHash = await txHashPromise;
        while (true) {
            const [
                receipt,
                confirmations
            ] = await getConfirmationsAndWait(flexEther, txHash);
            if (receipt && confirmations >= minConfirmations) {
                return receipt;
            }
        }
    };
    const txPromise = confirmed();
    txPromise.txHash = txPromise.transactionHash = txPromise.txId = txHashPromise;
    txPromise.confirmed = confirmed;
    txPromise.receipt = txPromise;;
    return txPromise;
}

async function getConfirmationsAndWait(flexEther, txHash) {
    // Need to keep fetching the receipt block number in case of a re-org.
    const [receipt, currentBlockNumber] = await Promise.all([
        await flexEther.getTransactionReceipt(txHash),
        await flexEther.getBlockNumber(),
    ]);
    if (receipt === null) {
        // No receipt available yet. Delay the response.
        return new Promise((accept, reject) => {
            setTimeout(() => accept([]), CONFIRMATION_INTERVAL_MS);
        });
    }
    return [receipt, currentBlockNumber - receipt.blockNumber];
};

module.exports = createTransactionPromise;
