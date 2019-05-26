'use strict'
const _ = require('lodash');
const ethjs = require('ethereumjs-util');
const promisify = require('util').promisify;

module.exports = class RpcClient {
	constructor(provider) {
		this.provider = provider;
		this._chainId = null;
		this._nextRpcId = _.random(1, 2**64);
	}

	async getDefaultAccount() {
		return _.first(await this.getAccounts());
	}

	async getAccounts() {
		return this._send('eth_accounts');
	}

	async getTransactionCount(by, blockNumber='latest') {
		return toNumber(await this._send('eth_getTransactionCount',
			[
				asAddress(by),
				asBlockNumber(blockNumber)
			]
		));
	}

	async getBalance(by, blockNumber='latest') {
		return toUnsigned(await this._send('eth_getBalance',
			[
				asAddress(by),
				asBlockNumber(blockNumber)
			]
		));
	}

	async getGasPrice() {
		return toUnsigned(await this._send('eth_gasPrice'));
	}

	async getBlockNumber() {
		return toNumber(await this._send('eth_blockNumber'));
	}

	async getBlock(numberOrHash='latest') {
		let result;
		if (isHash(numberOrHash)) {
			result = await this._send('eth_getBlockByHash',
				[
					asHash(numberOrHash),
					false
				]
			);
		} else {
			result = await this._send('eth_getBlockByNumber',
				[
					asBlockNumber(numberOrHash),
					false
				]
			);
		}
		return normalizeBlock(result);
	}

	async estimateGas(tx) {
		return toNumber(await this._send('eth_estimateGas',
			[{
				to: asAddress(tx.to),
				from: !_.isNil(tx.from) ? asAddress(tx.from) : undefined,
				gas: !_.isNil(tx.gas) ? asHex(tx.gas) : undefined,
				gasPrice: !_.isNil(tx.gasPrice) ? asHex(tx.gasPrice) : undefined,
				value: !_.isNil(tx.value) ? asHex(tx.value) : undefined,
				data: !_.isNil(tx.data) ? asBytes(tx.data) : undefined,
			}]
		));
	}

	async call(tx, blockNumber='latest') {
		return await this._send('eth_call',
			[
				{
					to: asAddress(tx.to),
					from: !_.isNil(tx.from) ? asAddress(tx.from) : undefined,
					gas: !_.isNil(tx.gas) ? asHex(tx.gas) : undefined,
					gasPrice: !_.isNil(tx.gasPrice) ? asHex(tx.gasPrice) : undefined,
					value: !_.isNil(tx.value) ? asHex(tx.value) : undefined,
					data: !_.isNil(tx.data) ? asBytes(tx.data) : undefined,
				},
				asBlockNumber(blockNumber)
			]
		);
	}

	async sendTransaction(tx) {
		return this._send('eth_sendTransaction',
			[{
				to: asAddress(tx.to),
				from: !_.isNil(tx.from) ? asAddress(tx.from) : undefined,
				gas: !_.isNil(tx.gas) ? asHex(tx.gas) : undefined,
				gasPrice: !_.isNil(tx.gasPrice) ? asHex(tx.gasPrice) : undefined,
				value: !_.isNil(tx.value) ? asHex(tx.value) : undefined,
				data: !_.isNil(tx.data) ? asBytes(tx.data) : undefined,
			}]
		);
	}

	async sendRawTransaction(raw) {
		return this._send('eth_sendRawTransaction',
			[
				asBytes(raw)
			]
		);
	}

	async getTransactionReceipt(txHash) {
		const result = await this._send('eth_getTransactionReceipt',
			[
				asHash(txHash)
			]
		);
		return normalizeReceipt(result);
	}

	async getChainId() {
		if (typeof(this._chainId) === 'number') {
			return this._chainId;
		}
		return this._chainId = toNumber(await this._send('net_version'));
	}

	async _send(method, params=[]) {
		let sendPayload =
			this.provider.sendPayload ||
			this.provider.sendAsync ||
			this.provider.send;
		const numArgs = sendPayload.length;
		sendPayload = _.bind(sendPayload, this.provider);
		if (numArgs > 1) {
			sendPayload = promisify(sendPayload);
		}
		const { result } = await sendPayload({
			jsonrpc: "2.0",
			id: this._nextRpcId++,
			method: method,
			params: params
		});
		if (!result) {
			throw new RpcError(
				[
					`method=${JSON.stringify(method)}`,
					`params=${JSON.stringify(params)}`
				].join(', ')
			);
		}
		return result;
	}
}

const BLOCK_NUMBER_FIELDS = [
	'difficulty',
	'gasLimit',
	'gasUsed',
	'number',
	'size',
	'timestamp',
	'totalDifficulty'
];

function normalizeBlock(block) {
	for (const field of BLOCK_NUMBER_FIELDS) {
		block[field] = toNumber(block[field]);
	}
	return block;
}

const RECEIPT_NUMBER_FIELDS = [
	'blockNumber',
	'cumulativeGasUsed',
	'gasUsed',
	'status',
	'transactionIndex'
];

function normalizeReceipt(block) {
	for (const field of RECEIPT_NUMBER_FIELDS) {
		block[field] = toNumber(block[field]);
	}
	return block;
}

const HASH_REGEX = /^0x([0-9a-f]{2}){32}$/i;
const HEX_REGEX = /^0x[0-9a-f]*$/i;
const UNSIGNED_REGEX = /^[0-9]+$/;

function isHash(v) {
	return typeof(v) === 'string' && HASH_REGEX.test(v);
}

function asAddress(v) {
	if (!ethjs.isValidAddress(v)) {
		throw new InvalidAddressError(v);
	}
	return v;
}

function asHash(v) {
	if (!isHash(v)) {
		throw new InvalidHashError(v);
	}
	return v;
}

function asBlockNumber(v) {
	if (_.isNil(v)) {
		return 'latest';
	}
	if (v === 'latest' || v === 'pending' || v === 'earliest') {
		return v;
	}
	try {
		return asHex(v);
	} catch (err) {
		throw new InvalidBlockNumberError(v);
	}
}

function asBytes(v) {
	if (v == '0x') {
		return v;
	}
	if (!HEX_REGEX.test(v)) {
		throw new InvalidBytesError(v);
	}
	return ethjs.bufferToHex(ethjs.toBuffer(v));
}

function asHex(v) {
	const bn = toBN(v);
	return '0x' + bn.toString(16);
}

function toNumber(v) {
	return _.toNumber(v);
}

function toUnsigned(v) {
	return toBN(v).toString(10);
}

function toBN(v) {
	if (typeof(v) === 'number') {
		return new ethjs.BN(v);
	}
	if (typeof(v) === 'string') {
		if (HEX_REGEX.test(v)) {
			return new ethjs.BN(v.substr(2), 16);
		}
		if (UNSIGNED_REGEX.test(v)) {
			return new ethjs.BN(v);
		}
	}
	throw new InvalidUnsignedError(v);
}

class RpcError extends Error {
	constructor(msg) {
		super(msg);
		this.name = this.constructor.name;
	}
};

class InvalidAddressError extends Error {
	constructor(v) {
		super(`Invalid address: ${JSON.stringify(v)}`);
		this.name = this.constructor.name;
	}
};

class InvalidHashError extends Error {
	constructor(v) {
		super(`Invalid hash: ${JSON.stringify(v)}`);
		this.name = this.constructor.name;
	}
};

class InvalidBlockNumberError extends Error {
	constructor(v) {
		super(`Invalid block number: ${JSON.stringify(v)}`);
		this.name = this.constructor.name;
	}
};

class InvalidNumberError extends Error {
	constructor(v) {
		super(`Invalid number: ${JSON.stringify(v)}`);
		this.name = this.constructor.name;
	}
};

class InvalidUnsignedError extends Error {
	constructor(v) {
		super(`Invalid unsigned number: ${JSON.stringify(v)}`);
		this.name = this.constructor.name;
	}
};

class InvalidBytesError extends Error {
	constructor(v) {
		super(`Invalid bytes: ${JSON.stringify(v)}`);
		this.name = this.constructor.name;
	}
};

module.exports.RpcError = RpcError;
module.exports.InvalidAddressError = InvalidAddressError;
module.exports.InvalidHashError = InvalidHashError;
module.exports.InvalidBlockNumberError = InvalidBlockNumberError;
module.exports.InvalidNumberError = InvalidNumberError;
module.exports.InvalidUnsignedError = InvalidUnsignedError;
