'use strict'
const _ = require('lodash');
const ethjs = require('ethereumjs-util');
const promisify = require('util').promisify;

const {
	asAddress,
	asBlockNumber,
	isHash,
	asBytes,
	asHash,
	toHex,
	toChecksumAddress,
	toNumber,
	toUnsigned,
} = require('./util');

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
		return toNumber(await this._send(
			'eth_getTransactionCount',
			[
				asAddress(by),
				asBlockNumber(blockNumber),
			],
		));
	}

	async getBalance(by, blockNumber='latest') {
		return toUnsigned(await this._send(
			'eth_getBalance',
			[
				asAddress(by),
				asBlockNumber(blockNumber),
			],
		));
	}

	async getCode(at, blockNumber='latest') {
		return asBytes(await this._send(
			'eth_getCode',
			[
				asAddress(at),
				asBlockNumber(blockNumber),
			],
		));
	}

	async getLogs(filter) {
		const result = await this._send(
			'eth_getLogs',
			[
				{
					fromBlock: !_.isNil(filter.fromBlock) ?
						asBlockNumber(filter.fromBlock) : undefined,
					toBlock: !_.isNil(filter.toBlock) ?
						asBlockNumber(filter.toBlock) : undefined,
					address: !_.isNil(filter.address) ?
						asAddress(filter.address) : undefined,
					blockhash: !_.isNil(filter.blockhash) ?
						asHash(filter.blockhash) : undefined,
					topics: _.isArray(filter.topics) ?
						filter.topics.map(t => !_.isNil(t) ? toHex(t) : null) :
						[],
				}
			],
		);
		return result.map(log => normalizeLog(log));
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
			result = await this._send(
				'eth_getBlockByHash',
				[
					asHash(numberOrHash),
					false,
				],
			);
		} else {
			result = await this._send(
				'eth_getBlockByNumber',
				[
					asBlockNumber(numberOrHash),
					false,
				],
			);
		}
		return normalizeBlock(result);
	}

	async estimateGas(tx, blockNumber='latest') {
		blockNumber = asBlockNumber(blockNumber);
		return toNumber(await this._send(
			'eth_estimateGas',
			[
				{
					to: !_.isNil(tx.to) ? asAddress(tx.to) : undefined,
					from: !_.isNil(tx.from) ? asAddress(tx.from) : undefined,
					gas: !_.isNil(tx.gas) ? toHex(tx.gas) : undefined,
					gasPrice: !_.isNil(tx.gasPrice) ? toHex(tx.gasPrice) : undefined,
					value: !_.isNil(tx.value) ? toHex(tx.value) : undefined,
					data: !_.isNil(tx.data) ? asBytes(tx.data) : undefined,
				},
				// Some providers (e.g., infura ropsten)
				// do not like an extra estimateGas param.
				...(blockNumber !== 'latest' ? [blockNumber]: []),
			],
		));
	}

	async call(tx, blockNumber='latest', overrides=undefined) {
		return await this._send(
			'eth_call',
			[
				{
					to: !_.isNil(tx.to) ? asAddress(tx.to) : undefined,
					from: !_.isNil(tx.from) ? asAddress(tx.from) : undefined,
					gas: !_.isNil(tx.gas) ? toHex(tx.gas) : undefined,
					gasPrice: !_.isNil(tx.gasPrice) ? toHex(tx.gasPrice) : undefined,
					value: !_.isNil(tx.value) ? toHex(tx.value) : undefined,
					data: !_.isNil(tx.data) ? asBytes(tx.data) : undefined,
				},
				asBlockNumber(blockNumber),
				...(overrides
					? [
						_.zipObject(
							Object.keys(overrides).map(k => asAddress(k)),
							Object.values(overrides).map(v => marshallStateOverride(v)),
						),
					]
					: []
				),
			],
		);
	}

	async sendTransaction(tx) {
		return this._send('eth_sendTransaction',
			[{
				to: !_.isNil(tx.to) ? asAddress(tx.to) : undefined,
				from: !_.isNil(tx.from) ? asAddress(tx.from) : undefined,
				gas: !_.isNil(tx.gas) ? toHex(tx.gas) : undefined,
				gasPrice: !_.isNil(tx.gasPrice) ? toHex(tx.gasPrice) : undefined,
				nonce: !_.isNil(tx.nonce) ? toHex(tx.nonce) : undefined,
				value: !_.isNil(tx.value) ? toHex(tx.value) : undefined,
				data: !_.isNil(tx.data) ? asBytes(tx.data) : undefined,
			}],
		);
	}

	async sendRawTransaction(raw) {
		return this._send(
			'eth_sendRawTransaction',
			[ asBytes(raw) ],
		);
	}

	async getTransactionReceipt(txHash) {
		const result = await this._send(
			'eth_getTransactionReceipt',
			[ asHash(txHash) ],
		);
		return result ? normalizeReceipt(result) : result;
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
		const id = Math.floor(Math.random() * 2**64);
		const response = await sendPayload({
			jsonrpc: "2.0",
			id,
			method: method,
			params: params,
		});
		if (response.id !== id) {
			throw new RpcError(`Expected RPC id=${id} but got id=${response.id}`);
		}
		if (response.error) {
			let errorReturnData;
			if (response.error.data) {
				const errorTxHash = Object.keys(response.error.data).filter(k => k.startsWith('0x'))[0]
				const errorData = response.error.data[errorTxHash];
				if (errorData && errorData.return) {
					errorReturnData = errorData.return;
				}
			}
			throw new RpcError(
				[
					`method=${JSON.stringify(method)}`,
					`params=${JSON.stringify(params).slice(0, 64)}${JSON.stringify(params).length > 64 ? '...' : ''}`,
					`error="${(response.error || {}).message}"`,
					...(errorReturnData ? [`errorData=${errorReturnData}`] : []),
				].join(', '),
				{ errorReturnData },
			);
		}
		return response.result;
	}
}

function marshallStateOverride(override) {
	return _.merge(
		{ ...override },
		{
			balance: _.isNil(override.balance) ? undefined : toHex(override.balance),
			nonce: _.isNil(override.nonce) ? undefined : toHex(override.nonce),
			state: _.isNil(override.state) ? undefined : _.zipObject(
				Object.keys(override.state).map(k => toHex(k)),
				Object.values(override.state).map(v => toHex(v)),
			),
			stateDiff: _.isNil(override.stateDiff) ? undefined : _.zipObject(
				Object.keys(override.stateDiff).map(k => toHex(k)),
				Object.values(override.stateDiff).map(v => toHex(v)),
			),
		},
	);
}

function normalizeBlock(block) {
	return {
		...block,
		difficulty: toNumber(block.difficulty),
		gasLimit: toNumber(block.gasLimit),
		gasUsed: toNumber(block.gasUsed),
		number: toNumber(block.number),
		size: toNumber(block.size),
		timestamp: toNumber(block.timestamp),
		totalDifficulty: toNumber(block.totalDifficulty),
		miner: toChecksumAddress(block.miner),
	};
}

function normalizeReceipt(receipt) {
	return {
		...receipt,
		blockNumber: toNumber(receipt.blockNumber),
		cumulativeGasUsed: toNumber(receipt.cumulativeGasUsed),
		gasUsed: toNumber(receipt.gasUsed),
		status: toNumber(receipt.status),
		transactionIndex: toNumber(receipt.transactionIndex),
		contractAddress: !_.isNil(receipt.contractAddress) ?
			toChecksumAddress(receipt.contractAddress) : undefined,
		logs: receipt.logs.map(log => normalizeLog(log)),
	};
}

function normalizeLog(log) {
	return {
		...log,
		address: toChecksumAddress(log.address),
		blockNumber: toNumber(log.blockNumber),
		logIndex: toNumber(log.logIndex),
		transactionIndex: toNumber(log.transactionIndex),
	};
}

class RpcError extends Error {
	constructor(msg, data = {}) {
		super(msg);
		this.name = this.constructor.name;
		Object.assign(this, data);
	}
};

module.exports.RpcError = RpcError;
