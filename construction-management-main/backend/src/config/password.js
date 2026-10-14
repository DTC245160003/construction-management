const argon2 = require("argon2");
const { randomBytes } = require("crypto");

let dummyHash;

function getDummyHash() {
    if (!dummyHash) {
        dummyHash = argon2.hash(randomBytes(32).toString("hex"), { type: argon2.argon2id });
    }
    return dummyHash;
}

async function verifyPassword(hash, password) {
    const isArgon2id = typeof hash === "string" && hash.startsWith("$argon2id$");
    const encoded = isArgon2id ? hash : await getDummyHash();

    try {
        const matches = await argon2.verify(encoded, password);
        return isArgon2id && matches;
    } catch (error) {
        if (!isArgon2id) throw error;
        // Treat malformed/legacy hashes as invalid credentials, without exposing them.
        await argon2.verify(await getDummyHash(), password);
        return false;
    }
}

async function hashPassword(password) {
    return argon2.hash(password, { type: argon2.argon2id });
}

module.exports = { verifyPassword, hashPassword };
