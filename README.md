![build status](https://travis-ci.org/merklejerk/flex-ether.svg?branch=master)
![npm package](https://badge.fury.io/js/flex-ether.svg)

# flex-ether
A modern, flexible Ethereum library for sending ethereum transactions that:

- Requires minimal to *no* configuration to get going on all networks (no provider necessary).
- Can sign and send transactions from arbitrary wallets (private keys).
- Provides separate promises for transaction hashes, receipts, and confirmations.
- Automatically calculates gas and gas price for transactions in a configurable manner.
- Automatically resolves ENS addresses across all inputs.

## Installation
```bash
npm install flex-ether
# or
yarn install flex-ether
```

## Preview

```js
const FlexEther = require('flex-ether');
// A self-signing wallet key for transactions.
const PRIVATE_KEY = '0xb3734ec890893585330c71ece72afb05058192b6be47bee2b99714e6bb5696ab';

// Create instance on the mainnet.
let eth = new FlexEther();
// Send 100 wei from a self-signed wallet to an ENS address.
let tx = eth.transfer('ethereum.eth', '100', {key: PRIVATE_KEY});
// Wait for the transaction hash.
let transactionHash = await tx.txId;
// Wait for the receipt.
receipt = await tx.receipt;
// Wait for the receipt after 3 confirmations.
receipt = await tx.confirmed(3);
// Get the balance of an address at a certain block.
let balance = await eth.getBalance('0xf6fb5b73987d6d9a139e23bab97be6fc89e0dcd1', 412045);
// Estimate gas for a transaction, from a self-signed wallet.
let gas = eth.estimateGas('0xf6fb5b73987d6d9a139e23bab97be6fc89e0dcd1', '100',
   {key: PRIVATE_KEY});
```

## User Guide
- [Creating an instance](creating-an-instance)
- [Sending ether](#sending-ether)
- [Transaction promises](#transaction-promises)
- [Getting balances](#getting-balances)
- [Estimating gas](#estimating-gas)
- [ENS addresses](#ens-addresses)
- [Instance Properties](#instance-properties)

### Creating an instance
By default, the instance will create an [Infura](https://infura.io) provider to
talk to the main network. You can modify this behavior with the options
`network`, `infuraKey`, `provider`, or `providerURI`.

##### Full options
```js
eth = new FlexEther(
   // Options object. May be omitted.
   {
      // Network to use with Infura provider.
      // May be 'main', 'ropsten', 'rinkeby', or 'kovan'.
      // Defaults to 'main'
      network: String,
      // Infura Project ID, if not using a custom provider.
      infuraKey: String,
      // Connect to an existing provider at a URI
      // (e.g., http://localhost:8545 or https://mainnet.infura.io/v3/PROJECT_ID).
      // The 'net' option is required is using an IPC path.
      providerURI: String,
      // net instance, from require('net'), if using IPC path in providerURI
      net: Object,
      // Use a custom provider instance (e.g., web3.currentProvider for metamask).
      provider: Object,
      // Clamp transaction gas prices to this amount (in wei).
      // Defaults to 250 gwei.
      maxGasPrice: string,
      // Fractional bonus to apply to gas price when making transactions.
      // 0.01 = +1%. May be negative to under-price.
      // Defaults to -0.005.
      // Can be overridden in send/transfer calls.
      gasPriceBonus: Number,
      // Fractional bonus to apply to gas limit estimates when making transactions.
      // 0.01 = +1%. May be negative, but probably not a good idea.
      // Defaults to 0.66.
      // Can be overridden in send/transfer calls.
      gasBonus: Number,
      // ENS options.
      ens: {
          // Minimum number of seconds time to keep a resolved ENS name in cache.
          // Defaults to one hour.
          minTTL: Number,
          // Maximum number of seconds time to keep a resolved ENS name in cache.
          // Defaults to infinity.
          maxTTL: Number,
      }
   });
```

### Sending ether

Ether can be sent with the `transfer()` or the lower-level `send()` methods.

By default, transactions will be signed by the wallet associated with
the first account given by the provider. You can override the
caller by either passing the `from` or `key` option. The `from` option will
let the provider sign the transaction from an unlocked wallet, as usual.
But, the `key` option will *self-sign* the transaction with the private key
provided, allowing you to transact from any wallet you have the private keys
to.

Transactions return a [Transaction Promise Object](#transaction-promises), which
allow you to easily wait on transaction hashes,
[receipts](https://web3js.readthedocs.io/en/1.0/web3-eth.html#eth-gettransactionreceipt-return),
and confirmations.

##### Examples
```js
const FlexEther = require('flex-ether');
// A self-signing wallet key for transactions.
const PRIVATE_KEY = '0xb3734ec890893585330c71ece72afb05058192b6be47bee2b99714e6bb5696ab';
const eth = new FlexEther();

// Send 100 wei to an ENS address and wait for the receipt.
let receipt = await eth.transfer('ethereum.eth', '100');
/* Result: <Receipt Object> {
   transactionHash: '0x9eb3f89f8581e6c6df294344b538d44e265c226ae6e8ce6210df497cf2b54bd3',
   blockNumber: 3616104,
   gasUsed: 21000,
   ... etc.
}*/
// Send 100 wei to an address and wait for the transaction hash.
let txId = await eth.transfer(
   '0xf6fb5b73987d6d9a139e23bab97be6fc89e0dcd1', '100').txId;
// Send 100 wei to an address and wait for the receipt after 3 confirmations.
receipt = await eth.transfer(
   '0xf6fb5b73987d6d9a139e23bab97be6fc89e0dcd1', '100').confirmed(3);
// Send 100 wei from a wallet managed by the provider and wait for the receipt
receipt = await eth.transfer(
   '0xf6fb5b73987d6d9a139e23bab97be6fc89e0dcd1', '100',
   {from: '0x005B68A967D39c497074127871297b6728a1cfEd'});
// Send 100 wei from a wallet defined by a private key and wait for the receipt
receipt = await eth.transfer(
   '0xf6fb5b73987d6d9a139e23bab97be6fc89e0dcd1', '100', {key: PRIVATE_KEY});
// Same as above but with send().
receipt = await eth.send(
   '0xf6fb5b73987d6d9a139e23bab97be6fc89e0dcd1', {value: '100', key: PRIVATE_KEY});

```

##### Full options
```js
// Full method options.
await eth.transfer(
   // Recipient address. May be an ENS address.
   to: String,
   // Amount of ether to send, in weis.
   // Can be a base-10 string or hex-encoded number.
   amount: String,
   // Options.
   {
      // Address of wallet that will sign the transaction. May be an ENS address.
      // Must be unlocked by the provider.
      // Defaults to eth.getDefaultAccount().
      from: String,
      // Hex-encoded string private key.
      // Signs the transaction with this private key and sends it from the address
      // associated with it. Overrides 'from' option.
      key: String,
      // Gas price to use, as a hex or base-10 string, in wei.
      // If not specified, calculated from network gas price and bonus.
      gasPrice: String,
      // Execution gas limit.
      // If not specified, it will be estimated with bonus.
      gas: Number,
      // Bonus to apply to gas price calculations.
      // Should be a positive or negative Number, where 0.01 = +1%.
      // If omitted, `eth.gasPriceBonus` will be used.
      gasPriceBonus: undefined,
      // Bonus to apply to gas limit calculations.
      // Should be a positive or negative Number, where 0.01 = +1%.
      // If omitted, `eth.gasBonus` will be used.
      gasBonus: undefined
   });
```

### Transaction promises
`transfer()` and `send()` both return a Promise object that resolves
to the
[transaction receipt](https://web3js.readthedocs.io/en/1.0/web3-eth.html#eth-gettransactionreceipt-return),
once the transaction has been mined.

This Promise object also has the following properties:
- `txId`: a promise that resolves to the transaction hash when the transaction is
posted to the blockchain. This ususally comes much sooner than the receipt.
- `receipt`: a promise that resolves to the transaction receipt when the
transaction has been mined. Same as waiting on the parent object itself.
- `confirmed(count=1)` a function that returns a promise that resolves to the
transaction receipt after the transaction has been mined and `count` number of
confirmations have been seen, up to a maximum of 12 confirmations.

##### Example
```js
const FlexEther = require('flex-ether');
const eth = new FlexEther();

// Send 100 wei to an address and wait for the receipt.
let receipt = await eth.transfer(
   '0xf6fb5b73987d6d9a139e23bab97be6fc89e0dcd1', '100');
// Send 100 wei to an address and get the promise object.
let tx = eth.transfer(
   '0xf6fb5b73987d6d9a139e23bab97be6fc89e0dcd1', '100');
// Wait on the transaction hash.
let transactionHash = await tx.txId;
// Wait on the receipt. Equivalent to `await tx`
receipt = await tx.receipt;
// Wait on the receipt after 3 confirmations. Equivalent to `await tx`
receipt = await tx.confirmed(3);
```

### Getting balances
The `getBalance()` method queries the balance of an address.

You can also pass the block number at which to evaluate the balance. These
numbers can either be explicit block numbers or negative offsets from the last
block number, where `-1` is the last block, `-2` is the second to last block,
and so on.

##### Examples
```js
const FlexEther = require('flex-ether');
const eth = new FlexEther();

// Get the balance of an address at the current block.
let bal = await eth.getBalance('0xf6fb5b73987d6d9a139e23bab97be6fc89e0dcd1');
// Get the balance of an address at a specific block.
bal = await eth.getBalance('0xf6fb5b73987d6d9a139e23bab97be6fc89e0dcd1', 310319);
// Get the balance of an ENS address at the second to last block.
bal = await eth.getBalance('ethereum.eth', -2);

```

### Estimating gas
Sending ether from wallet to wallet generally costs exactly `21000` gas. However,
sending ether to a contract may actually cost more, as it might trigger the
execution of code. By default, the library will automatically compute and
allocate the gas needed before sending a transaction.

You can get the gas explicitly by calling `estimateGas()` with the same
parameters you would pass to `send()`.

##### Examples
```js
const FlexEther = require('flex-ether');
// A self-signing wallet key for transactions.
const PRIVATE_KEY = '0xb3734ec890893585330c71ece72afb05058192b6be47bee2b99714e6bb5696ab';
const eth = new FlexEther();

// Get the gas consumed by sending 100 wei to an address from the default account.
let gas = await eth.estimateGas('0xf6fb5b73987d6d9a139e23bab97be6fc89e0dcd1',
   {value: '100'});
// Get the gas consumed by sending 100 wei to an address from a wallet defined by
// a private key.
let gas = await eth.estimateGas('0xf6fb5b73987d6d9a139e23bab97be6fc89e0dcd1',
   {value: '100', key: PRIVATE_KEY});
```

### ENS addresses
Anywhere you can pass an address, you can instead pass an
[ENS address](http://docs.ens.domains/en/latest/introduction.html), such as
`'thisismyensaddress.eth'`. You can also call the `resolveAddress()` method
to resolve an address explicitly. If an ENS address cannot be resolved, an
exception will be raised (the promise will fail).

ENS is only available on the main, ropsten, and rinkeby networks.
The ENS address will also have to be set up with the ENS contract on the
respective network to properly resolve.

### Instance Properties
A contract instance exposes a few properties, most of which you are free to
change. Many of these can also be overridden in individual call options.

- `gasBonus (Number)` Gas limit estimate bonus for transactions, where `0.01 = +1%`. May be negative.
- `gasPriceBonus (Number)` Gas price bonus for transactions, where `0.01 = +1%`. May be negative.
- `async getTransactionCount(addr)` Get the nonce for an account.
- `async resolveBlockDirective(blockNum)` Resolve a block directive (e.g., `41204102` or `-2`) to a block number.
- `async getChainId()` Get the chain ID of the connected network.
- `async resolveAddress(addr)` Resolve an ENS address. If a regular address is passed, the checksummed version will be returned.
- `async getBlockNumber()` Get the current block number.
- `async getDefaultAccount()` Get the default account, set by the provider.

### Module Properties
The following module properties affect gas calculations for all instances:

- `MAX_GAS_PRICE` Maximum gas price for transactions. Defaults to `256` gwei.
