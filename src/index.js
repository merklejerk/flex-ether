'use strict'
const _ = require('lodash');
const assert = require('assert');
const BigNumber = require('bignumber.js');
const cw3p = require('create-web3-provider');
const ethjsTx = require('@ethereumjs/tx');
const ethjscom = require('@ethereumjs/common').default;
const ethjs = require('ethereumjs-util');

const util = require('./util');
const Resolver = require('./resolver');
const RpcClient = require('./rpc-client');
const createTransactionPromise = require('./transaction-promise');

function createCommonFork(chainId, fork='istanbul', parentChain='mainnet') {
	return ethjscom.forCustomChain(
		parentChain,
		{
			chainId,
			name: `FlexEther-${fork}-${chainId}`,
		},
		fork,
	);
}

const TX_TYPE_FOR_HARDFORK = {
	'london': ethjsTx.FeeMarketEIP1559Transaction,
	'berlin': ethjsTx.AccessListEIP2930Transaction,
	'istanbul': ethjsTx.Transaction,
};

const HARD_FORKS_BY_CHAIN_ID = {
	'1': [
		{ block: 12965000, common: createCommonFork(1, 'london') },
		{ block: 12244000, common: createCommonFork(1, 'berlin') },
		{ block: 0, common: createCommonFork(1, 'istanbul') },
	],
	'3': [
		{ block: 10499401, common: createCommonFork(3, 'london') },
		{ block: 9812189, common: createCommonFork(3, 'berlin') },
		{ block: 0, common: createCommonFork(3, 'istanbul') },
	],
	'*': [ { block: 0, common: createCommonFork(3, 'istanbul') } ],
};

module.exports = class FlexEther {
	constructor(opts={}) {
		this.provider = opts.provider;
		if (!this.provider) {
			this.provider = cw3p({
				ws: opts.ws,
				infuraKey: opts.infuraKey,
				network: opts.network,
				uri: opts.providerURI,
				net: opts.net,
			});
		}
		this.rpc = new RpcClient(this.provider);
		this._resolver = new Resolver(this.rpc, opts.ens);
		this.gasBonus = _.isNumber(opts.gasBonus) ? opts.gasBonus : 0.5;
		this.gasPriceBonus = _.isNumber(opts.gasPriceBonus) ?
			opts.gasPriceBonus : 0.005;
	}

	async getChainId() {
		return this._chainId || (this._chainId = await this.rpc.getChainId());
	}

	async _getChainCommon(blockNumber=undefined) {
		if (!_.isNil(blockNumber)) {
			blockNumber = this.resolveBlockDirective(blockNumber);
		} else {
			blockNumber = await this.getBlockNumber();
		}
		const chainId = await this.getChainId();
		const forks = HARD_FORKS_BY_CHAIN_ID[chainId] || HARD_FORKS_BY_CHAIN_ID['*'];
		for (const fork of forks) {
			if (fork.block <= blockNumber) {
				return fork.common;
			}
		}
	}

	async getDefaultAccount() {
		return this.rpc.getDefaultAccount();
	}

	async getTransactionCount(addr) {
		addr = await this._resolver.resolve(addr);
		return this.rpc.getTransactionCount(addr);
	}

	async getTransactionReceipt(txHash) {
		return this.rpc.getTransactionReceipt(txHash);
	}

	async getTransaction(txHash) {
		return this.rpc.getTransaction(txHash);
	}

	async getBalance(addr, block='latest') {
		return this.rpc.getBalance(
			await this.resolve(addr, block),
			await this.resolveBlockDirective(block),
		);
	}

	async getGasPrice() {
		return this.rpc.getGasPrice();
	}

	async getBaseFee(block='pending') {
		return (await this.getBlock(block)).baseFeePerGas;
	}

	async getMaxPriorityFee() {
		return this.rpc.getMaxPriorityFeePerGas();
	}

	async getPastLogs(filter) {
		return this.rpc.getLogs({
			...filter,
			fromBlock: !_.isNil(filter.fromBlock) ?
				await this.resolveBlockDirective(filter.fromBlock) : undefined,
			toBlock: !_.isNil(filter.toBlock) ?
				await this.resolveBlockDirective(filter.toBlock) : undefined,
			address: !_.isNil(filter.address) ?
				await this.resolve(filter.address) : undefined,
		});
	}

	async getBlock(numberOrHash='latest') {
		return this.rpc.getBlock(
			await this.resolveBlockDirective(numberOrHash),
		);
	}

	async getBlockNumber() {
		return this.rpc.getBlockNumber();
	}

	async getCode(addr, block='latest') {
		return this.rpc.getCode(
			await this.resolve(addr, block),
			await this.resolveBlockDirective(block),
		);
	}

	async _getGasPriceWithBonus(bonus) {
		bonus = (_.isNumber(bonus) ? bonus : this.gasPriceBonus) || 0;
		const price = new BigNumber(await this.getGasPrice()).times(1 + bonus);
		return price.integerValue().toString(10);
	}

	async _getMaxPriorityFeeWithBonus(bonus) {
		bonus = (_.isNumber(bonus) ? bonus : this.gasPriceBonus) || 0;
		const price = new BigNumber(await this.getMaxPriorityFee()).times(1 + bonus);
		return price.integerValue().toString(10);
	}

	async _getBaseFeeWithBonus(bonus) {
		bonus = (_.isNumber(bonus) ? bonus : this.gasPriceBonus) || 0;
		const price = new BigNumber(await this.getBaseFee()).times(1 + bonus);
		return price.integerValue().toString(10);
	}

	async estimateGas(to, opts={}) {
		const txOpts = await createTransactionOpts(this, to, opts);
		return await estimateGasRaw(this, txOpts, opts.block, opts.gasBonus);
	}

	send(to, opts={}) {
		return createTransactionPromise(this, sendTx(this, to, opts));
	}

	transfer(to, amount, opts) {
		return createTransactionPromise(
			this,
			sendTx(
				this,
				to,
				_.assign({}, opts, { value: amount })
			)
		);
	}

	async call(to, opts={}) {
		return callTx(this, to, opts);
	}

	async getBlockNumber() {
		return this.rpc.getBlockNumber();
	}

	async resolveBlockDirective(block=-1) {
		if (block === 'latest' || block === 'pending' || block === 'earliest') {
			return block;
		}
		if (_.isNumber(block)) {
			if (block < 0) {
				let n = await this.rpc.getBlockNumber();
				n += block + 1;
				if (n <= 0) {
					throw Error(`Block number offset is too large: ${block}`);
				}
				return n;
			}
			return block;
		}
		throw new Error(`Invalid block directive: ${block}`);
	}

	async resolve(addr, block='latest') {
		if (!addr)
			throw new Error(`Invalid address: "${addr}"`);
		return this._resolver.resolve(addr, block);
	}
};

async function getBlockGasLimit(inst) {
	while (true) {
		const lastBlock = await inst.getBlock();
		if (lastBlock != null)
			return lastBlock.gasLimit;
	}
}

async function estimateGasRaw(inst, txOpts, block, bonus) {
	bonus = (_.isNumber(bonus) ? bonus : inst.gasBonus) || 0;
	block = _.isNil(block)
		? undefined : await inst.resolveBlockDirective(block);
	const gas = await inst.rpc.estimateGas(
		{
			...normalizeTxOpts(txOpts),
			gas: undefined,
		},
		block,
	);
	return Math.ceil(gas * (1+bonus));
}

async function createTransactionOpts(inst, to, opts) {
	let from = undefined;
	if (opts.from === null) {
		// Explicitly leaving it undefined.
	} else if (_.isString(opts.from)) {
		from = await inst.resolve(opts.from, opts.block);
	} else if (_.isNumber(opts.from)) {
		from = opts.from;
	} else if (opts.key)
		from = util.privateKeyToAddress(opts.key);
	else
		from = await inst.getDefaultAccount();
	to = to ? await inst.resolve(to, opts.block) : undefined;
	return {
		gasPrice: opts.gasPrice,
		maxFeePerGas: opts.maxFeePerGas,
		maxPriorityFeePerGas: opts.maxPriorityFeePerGas,
		gasLimit: opts.gasLimit || opts.gas,
		value: opts.value || 0,
		data: opts.data,
		to: to,
		from: from
	};
}

function normalizeTxOpts(opts) {
	const _opts = {};
	if (!_.isNil(opts.gasPrice)) {
		_opts.gasPrice = util.toHex(opts.gasPrice || 0);
	}
	if (!_.isNil(opts.maxFeePerGas)) {
		_opts.maxFeePerGas = util.toHex(opts.maxFeePerGas || 0);
	}
	if (!_.isNil(opts.maxPriorityFeePerGas)) {
		_opts.maxPriorityFeePerGas = util.toHex(opts.maxPriorityFeePerGas || 0);
	}
	_opts.gasLimit = util.toHex(opts.gasLimit || opts.gas || 0);
	_opts.gas = _opts.gasLimit;
	_opts.value = util.toHex(opts.value || 0);
	if (!_.isNil(opts.nonce))
		_opts.nonce = util.toHex(opts.nonce);
	if (opts.data && opts.data != '0x')
		_opts.data = util.toHex(opts.data);
	else
		_opts.data = '0x';
	if (_.isString(opts.to))
		_opts.to = ethjs.toChecksumAddress(opts.to);
	if (_.isString(opts.from))
		_opts.from = ethjs.toChecksumAddress(opts.from);
	return _opts;
}

async function callTx(inst, to, opts) {
	const block = _.isNil(opts.block)
		? undefined : await inst.resolveBlockDirective(opts.block);
	const overrides = _.isNil(opts.overrides)
		? undefined
		: _.zipObject(
			await Promise.all(
				Object.keys(opts.overrides).map(k => inst.resolve(k, opts.block)),
			),
			Object.values(opts.overrides),
		);
	const txOpts = await createTransactionOpts(inst, to, opts);
	if (_.isNil(txOpts.gasLimit)) {
		txOpts.gasLimit = await getBlockGasLimit(inst);
	}
	if (!txOpts.to && (!txOpts.data || txOpts.data == '0x'))
		throw Error('Transaction has no destination.');
	return inst.rpc.call(normalizeTxOpts(txOpts), block, overrides);
}

async function sendTx(inst, to, opts) {
	const common = await inst._getChainCommon(opts.block);
	const txOpts = await createTransactionOpts(inst, to, opts);
	if (!txOpts.from)
		throw Error('Cannot determine caller.');
	if (!txOpts.to && (!txOpts.data || txOpts.data == '0x'))
		throw Error('Transaction has no destination.');
	if (_.isNumber(opts.nonce))
		txOpts.nonce = opts.nonce;
	else
		txOpts.nonce = await inst.getTransactionCount(txOpts.from);
	if (!txOpts.gasLimit)
		txOpts.gasLimit = await estimateGasRaw(inst, txOpts, undefined, opts.gasBonus);
	if (!txOpts.chainId)
		txOpts.chainId = await inst._chainId;
	if (common.hardfork() === 'london') {
		if (_.isNil(txOpts.maxPriorityFeePerGas)) {
			txOpts.maxPriorityFeePerGas = await inst._getMaxPriorityFeeWithBonus(opts.gasPriceBonus);
		}
		if (_.isNil(txOpts.maxFeePerGas)) {
			txOpts.maxFeePerGas = BigNumber.sum(
				await inst._getBaseFeeWithBonus(opts.gasPriceBonus),
				txOpts.maxPriorityFeePerGas,
			).toString(10);
		}
	} else {
		if (_.isNil(txOpts.gasPrice)) {
			txOpts.gasPrice = await inst._getGasPriceWithBonus(opts.gasPriceBonus);
		}
	}
	if (opts.key) {
		// Sign the TX ourselves.
		let tx = TX_TYPE_FOR_HARDFORK[common.hardfork()].fromTxData(normalizeTxOpts(txOpts), { common });
		tx = tx.sign(ethjs.toBuffer(opts.key));
		const serialized = util.asBytes(tx.serialize());
		return inst.rpc.sendRawTransaction(serialized);
	}
	// Let the provider sign it.
	return inst.rpc.sendTransaction(normalizeTxOpts(txOpts));
}

module.exports.util = util;
