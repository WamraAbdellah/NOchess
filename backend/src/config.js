'use strict';

// Secrets that have appeared in this public repository. Tokens signed with
// any of these can be forged by anyone, so the server refuses to use them.
const KNOWN_PUBLIC_SECRETS = new Set([
  'nochess_secret_key',
  'nochess_super_secret_jwt_key_change_in_production',
  'change_this_to_a_strong_random_secret_in_production',
]);

function loadJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32 || KNOWN_PUBLIC_SECRETS.has(secret)) {
    console.error(
      '❌ JWT_SECRET is missing, too short (< 32 chars) or a publicly known default.\n' +
      '   Generate one with:  openssl rand -hex 32   and put it in your .env file.'
    );
    process.exit(1);
  }
  return secret;
}

const JWT_SECRET = loadJwtSecret();

// Pin the algorithm so a token can never pick its own verification method.
const JWT_SIGN_OPTIONS = { algorithm: 'HS256', expiresIn: '7d' };
const JWT_VERIFY_OPTIONS = { algorithms: ['HS256'] };

module.exports = { JWT_SECRET, JWT_SIGN_OPTIONS, JWT_VERIFY_OPTIONS };
