import {HttpError} from './errors.js';

function decode(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) {
    const n = Number(value.integerValue);
    if (!Number.isSafeInteger(n)) throw new HttpError(502, '데이터 정수 범위를 확인하세요.');
    return n;
  }
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields);
  throw new HttpError(502, '지원하지 않는 데이터 형식입니다.');
}
function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v)]));
}
export function documentData(document) {
  // Stored data cannot override the authoritative Firestore document ID.
  return {...decodeFields(document.fields), id: document.name.split('/').at(-1)};
}

export function createFirestore(env, token, fetcher = fetch) {
  const base = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  async function read(path, missing = false) {
    const response = await fetcher(base + path, {
      headers: {authorization: `Bearer ${token}`},
      signal: AbortSignal.timeout(8000)
    });
    if (missing && response.status === 404) return null;
    if (!response.ok) {
      // Never echo upstream errors, account details, or credentials.
      const status = response.status === 429 ? 429 :
        response.status === 401 ? 401 : response.status === 403 ? 403 : 503;
      throw new HttpError(status, status === 429 ? '무료 사용량 한도에 도달했습니다. 나중에 다시 시도하세요.' : 'Firestore 접근 권한 또는 연결을 확인하세요.');
    }
    return response.json();
  }
  return {
    async get(path) {
      const document = await read('/' + path.split('/').map(encodeURIComponent).join('/'), true);
      return document ? documentData(document) : null;
    },
    async list(path, limit, orderBy) {
      // Firestore orderBy requires URI-encoded spaces, not form-encoded '+'.
      const query = `pageSize=${limit}&orderBy=${encodeURIComponent(orderBy)}`;
      const data = await read('/' + path.split('/').map(encodeURIComponent).join('/') + '?' + query);
      // One bounded page. No hidden pagination/read amplification.
      return (data.documents || []).map(documentData);
    }
  };
}
