import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET!);

const JWT_EXPIRY = '7d';
const CLI_TOKEN_EXPIRY = '90d';

export interface TokenPayload extends JWTPayload {
  sub: string;   // user id
  email: string;
  type: 'web' | 'cli';
}

export async function signJwt(
  userId: string,
  email: string,
  type: 'web' | 'cli' = 'web',
): Promise<string> {
  const expiry = type === 'cli' ? CLI_TOKEN_EXPIRY : JWT_EXPIRY;
  return new SignJWT({ email, type })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(expiry)
    .sign(secret());
}

export async function verifyJwt(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as TokenPayload;
  } catch {
    return null;
  }
}
