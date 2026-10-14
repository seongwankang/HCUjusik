import {createRemoteJWKSet, jwtVerify, decodeProtectedHeader} from 'jose';
import {HttpError} from './errors.js';

// Google public keys only. No emulator tokens, arbitrary key URLs or HS256.
const googleKeys = createRemoteJWKSet(new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
), {timeoutDuration: 5000, cooldownDuration: 30000});

export async function verifyFirebaseToken(token, projectId, keys = googleKeys, now = new Date()) {
  try {
    const header = decodeProtectedHeader(token);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
      throw new Error('invalid header');
    }
    const {payload} = await jwtVerify(token, keys, {
      algorithms: ['RS256'],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      requiredClaims: ['exp', 'iat', 'auth_time', 'sub'],
      currentDate: now
    });
    const seconds = Math.floor(now.getTime() / 1000);
    if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128 ||
        payload.sub.includes('/') || ['.', '..'].includes(payload.sub) ||
        !Number.isInteger(payload.iat) || payload.iat > seconds ||
        !Number.isInteger(payload.auth_time) || payload.auth_time > seconds ||
        payload.auth_time < 0 || !Number.isInteger(payload.exp) || payload.exp <= payload.iat) {
      throw new Error('invalid claims');
    }
    return payload;
  } catch {
    throw new HttpError(401, '로그인이 만료되었거나 인증 토큰이 올바르지 않습니다.');
  }
}

export async function authenticate(request, env, verify = verifyFirebaseToken) {
  const value = request.headers.get('authorization') || '';
  const match = value.match(/^Bearer ([A-Za-z0-9_.-]+)$/);
  if (!match || match[1].length > 8192) throw new HttpError(401, '로그인이 필요합니다.');
  const claims = await verify(match[1], env.FIREBASE_PROJECT_ID);
  return {uid: claims.sub, token: match[1], claims};
}
