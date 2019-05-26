'use strict'
const ganache = require('ganache-cli');
const FlexEther = require('../src/index');
const promisify = require('util').promisify;
const assert = require('assert');
const crypto = require('crypto');
const ethjs = require('ethereumjs-util');

describe('flex-contract', function() {
	let _ganache = null;
	let provider = null;
	let accounts = null;

	before(async function() {
		accounts = _.times(16, () => {
			const key = crypto.randomBytes(32);
			return {
				secretKey: key,
				address: ethjs.toChecksumAddress(
					'0x'+ethjs.privateToAddress(key).toString('hex')
				),
				balance: 100 + _.repeat('0', 18)
			};
		});
		provider = ganache.provider({
			accounts: accounts
		});
		// Suppress max listener warnings.
		provider.setMaxListeners(4096);
		provider.engine.setMaxListeners(4096);
	});

	it('can get balance', async function() {
		const eth = new FlexEther({provider: provider});
		assert.equal(await eth.getBalance(accounts[0].address), accounts[0].balance);
		assert.equal(await eth.getBalance(randomAddress()), '0');
	});

	it('can get balance at block number', async function() {
		const eth = new FlexEther({provider: provider});
		const block = await eth.getBlockNumber();
		const balance = await eth.getBalance(accounts[0].address);
		await eth.transfer(randomAddress(), 100);
		assert.equal(await eth.getBalance(accounts[0].address, block), balance);
	});

	it('can wait for receipt', async function() {
		const eth = new FlexEther({provider: provider});
		const to = randomAddress();
		const amount = _.random(1, 100);
		const tx = eth.transfer(to, amount);
		const receipt = await tx.receipt;
		assert.ok(receipt.transactionHash);
	});

	it('can wait for transaction hash', async function() {
		const eth = new FlexEther({provider: provider});
		const to = randomAddress();
		const amount = _.random(1, 100);
		const tx = eth.transfer(to, amount);
		const txId = await tx.txId;
		assert.ok(txId);
	});

	it('can wait for past confirmations', async function() {
		const eth = new FlexEther({provider: provider});
		const to = randomAddress();
		const amount = _.random(1, 100);
		const tx = eth.transfer(to, amount, {from: accounts[1].address});
		await tx;
		// Do some transactions to advance the block.
		for (let i = 0; i < 3; i++) {
			await eth.transfer(randomAddress(), _.random(1, 100));
		}
		const receipt = await tx.confirmed(3);
		assert.ok(receipt.transactionHash);
	});

	it('can wait for future confirmations', async function() {
		const eth = new FlexEther({provider: provider});
		const to = randomAddress();
		const amount = _.random(1, 100);
		const confirmed = (async () => {
			const tx = eth.transfer(to, amount, {from: accounts[1].address});
			return tx.confirmed(3);
		})();
		// Do some transactions to advance the block.
		for (let i = 0; i < 3; i++) {
			await eth.transfer(randomAddress(), _.random(1, 100));
		}
		const receipt = await confirmed;
		assert.ok(receipt.transactionHash);
	});

	it('can send ether from default account', async function() {
		const eth = new FlexEther({provider: provider});
		const from = await eth.getDefaultAccount();;
		const prevBalance = await eth.getBalance(from);
		const to = randomAddress();
		const amount = _.random(1, 100);
		const receipt = await eth.transfer(to, amount);
		assert.ok(receipt.transactionHash);
		assert.equal(await eth.getBalance(to), amount);
		assert.ok(await eth.getBalance(from) != prevBalance);
	});

	it('can send ether from provider account', async function() {
		const eth = new FlexEther({provider: provider});
		const from = accounts[1].address;
		const prevBalance = await eth.getBalance(from);
		const to = randomAddress();
		const amount = _.random(1, 100);
		const receipt = await eth.transfer(to, amount, {from: from});
		assert.ok(receipt.transactionHash);
		assert.equal(await eth.getBalance(to), amount);
		assert.ok(await eth.getBalance(from) != prevBalance);
	});

	it('can send ether with key', async function() {
		const eth = new FlexEther({provider: provider});
		const from = accounts[2].address;
		const key = accounts[2].secretKey;
		const to = randomAddress();
		const amount = _.random(1, 100);
		const prevBalance = await eth.getBalance(from);
		const receipt = await eth.transfer(to, amount, {key: key});
		assert.ok(receipt.transactionHash);
		assert.equal(await eth.getBalance(to), amount);
		assert.ok(await eth.getBalance(from) != prevBalance);
	});

	it('can estimate gas', async function() {
		const eth = new FlexEther({provider: provider});
		const to = randomAddress();
		const amount = _.random(1, 100);
		const gas = await eth.estimateGas(to, amount);
		assert.ok(gas >= 21000);
	});

	it('can call', async function() {
		const eth = new FlexEther({provider: provider});
		const to = randomAddress();
		const amount = _.random(1, 100);
		const r = await eth.call(to, amount);
		assert.equal(r, '0x');
	});

	it('can get balance from a prior block number', async function() {
		const eth = new FlexEther({provider: provider});
		const to = randomAddress();
		const blockNumber = await eth.getBlockNumber();
		const amount = _.random(100, 1000);
		const balance = await eth.getBalance(to, blockNumber);
		assert.equal(balance, '0');
	});

	it('can get balance from a prior block number by offset', async function() {
		const eth = new FlexEther({provider: provider});
		const to = randomAddress();
		const blockNumber = await eth.getBlockNumber();
		const amount = _.random(100, 1000);
		const balance = await eth.getBalance(to, -1);
		assert.equal(balance, '0');
	});

	it('can get gas price', async function() {
		const eth = new FlexEther({provider: provider});
		assert.ok(await eth.getGasPrice());
	});
});

function randomHex(size=32) {
	return '0x'+crypto.randomBytes(size).toString('hex');
}

function randomAddress() {
	return ethjs.toChecksumAddress(randomHex(20));
}
