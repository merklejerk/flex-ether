'use strict'
const _ = require('lodash');
const ethjs = require('ethereumjs-util');

const HASH_REGEX = /^0x([0-9a-f]{2}){32}$/i;
const HEX_REGEX = /^0x[0-9a-f]*$/i;
const UNSIGNED_REGEX = /^[0-9]+$/;

function privateKeyToAddress(key) {
	return ethjs.toChecksumAddress(
		'0x'+(ethjs.privateToAddress(ethjs.toBuffer(key)).toString('hex')));
}

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
	if (typeof(v) === 'string') {
		if (v === '0x') {
			return v;
		}
		if (!HEX_REGEX.test(v)) {
			throw new InvalidBytesError(v);
		}
		return ethjs.bufferToHex(ethjs.toBuffer(v));
	} else if (_.isBuffer(v)) {
		return ethjs.bufferToHex(v);
	}
	throw new InvalidBytesError(v);
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
	if (_.isBuffer(v)) {
		return new ethjs.BN(v);
	}
	throw new InvalidUnsignedError(v);
}

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

module.exports = {
	privateKeyToAddress: privateKeyToAddress,
	isHash: isHash,
	asHash: asHash,
	asAddress: asAddress,
	asBlockNumber: asBlockNumber,
	asBytes: asBytes,
	asHex: asHex,
	toNumber: toNumber,
	toUnsigned: toUnsigned,
	toBN: toBN,
	InvalidAddressError,
	InvalidHashError,
	InvalidBlockNumberError,
	InvalidNumberError,
	InvalidUnsignedError
};
