'use strict'
const _ = require('lodash');
const ethjs = require('ethereumjs-util');

const ENS_ADDRESSES = {
	'1': '0x314159265dd8dbb310642f98f50c066173c1259b',
	'3': '0x112234455c3a32fd11230c42e7bccd4a84e02010',
	'4': '0xe7410170f87102df0055eb195163a03b7f2bff4a'
};
const RESOLVER_FN_SIG = '0x0178b8bf';
const ADDR_FN_SIG = '0x3b3b57de';
const TTL_FN_SIG = '0x16a25cbd';
const ONE_HOUR = 60 * 60 * 1000;
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';

module.exports = class Resolver {
	constructor(rpc, opts={}) {
		const _opts = _.defaults({}, opts, {
			minTTL: ONE_HOUR,
			maxTTL: Number.MAX_SAFE_INTEGER
		});
		this.rpc = rpc;
		this.minTTL = _opts.minTTL;
		this.maxTTL = _opts.maxTTL;
		this._cache = {};
	}

	async resolve(name, block='latest') {
		if (ethjs.isValidAddress(name)) {
			return ethjs.toChecksumAddress(name);
		}

		const topLevelHash = hashName(name, true);
		const fullHash = hashName(name, false);
		const chainId = await this.rpc.getChainId();

		// Try the cache first.
		const cached = this._getCached(chainId, fullHash);
		if (cached) {
			return cached.address;
		}

		const resolver = await this._getResolver(chainId, topLevelHash, block);
		if (!resolver) {
			throw new Error(`No resolver for ENS address: "${name}"`);
		}

		const address = await this._resolveHash(chainId, resolver, fullHash, block);
		if (!address) {
			throw new Error(`Failed to resolve ENS address: "${name}"`);
		}

		const ttl = await this._getTTL(chainId, topLevelHash, block);
		if (ttl > 0) {
			// Cache it.
			this._putCached(chainId, fullHash, address, ttl);
		}
		return address;
	}

	_getCached(chainId, hash) {
		const cached = _.get(this._cache, [ _.toString(chainId), hash ]);
		if (cached && cached.expires > _.now()) {
			return cached.address;
		}
	}

	_putCached(chainId, hash, address, ttl) {
		_.set(
			this._cache,
			[ _.toString(chainId), hash ],
			{
				address: address,
				expires: _.now() + _.clamp(ttl, this.minTTL, this.maxTTL)
			}
		);
	}

	async _call(chainId, contract, data, block='latest') {
		return this.rpc.call({
			data: data,
			value: 0,
			to: contract,
			chainId: chainId
		});
	}

	async _getResolver(chainId, hash, block='latest') {
		const ens = getENSContract(chainId);
		const resolver = extractBytes(
			await this._call(
				chainId,
				ens,
				encodeCallData(RESOLVER_FN_SIG, hash),
				block
			),
			20
		);
		if (resolver !== NULL_ADDRESS && ethjs.isValidAddress(resolver)) {
			return resolver;
		}
	}

	async _resolveHash(chainId, resolver, hash, block='latest') {
		let address = extractBytes(
			await this._call(
				chainId,
				resolver,
				encodeCallData(ADDR_FN_SIG, hash),
				block
			),
			20
		);
		if (address !== NULL_ADDRESS && ethjs.isValidAddress(address)) {
			return ethjs.toChecksumAddress(address);
		}
	}

	async _getTTL(chainId, hash, block='latest') {
		const ens = getENSContract(chainId);
		const ttl = extractBytes(
			await this._call(
				chainId,
				ens,
				encodeCallData(TTL_FN_SIG, hash),
				block
			),
			8
		);
		return _.clamp(
			parseInt(ttl.substr(2), 16) * 1000,
			this.minTTL,
			this.maxTTL
		);
	}
}

function hashName(name, topLevelOnly=false) {
	if (!_.isString(name)) {
		throw new Error('ENS name must be a string');
	}
	let hashBuffer = Buffer.alloc(32);
	let labels = _.reverse(_.filter(name.toLowerCase().split('.')));
	if (labels.length < 2) {
		throw new Error(`Invalid ENS name: "${name}"`);
	}
	if (topLevelOnly) {
		labels = labels.slice(0, 2);
	}
	for (const label of labels) {
		const labelHash = ethjs.keccak256(Buffer.from(label));
		hashBuffer = ethjs.keccak256(Buffer.concat([hashBuffer, labelHash]));
	}
	return ethjs.bufferToHex(hashBuffer);
}

function getENSContract(chainId) {
	const ens = ENS_ADDRESSES[chainId];
	if (ens) {
		return ens;
	}
	throw new Error(`ENS is not supported on chain ID ${chainId}`);
}

function extractBytes(raw, size) {
	return '0x' + raw.substr(raw.length - size * 2);
}

function encodeCallData(sig, arg) {
	return sig + arg.substr(2);
}
