import { OAuth2Client } from 'google-auth-library'
import * as jose from 'jose'
import { sessionSecret } from './session-secret.js'

const verifiedTokens = new Map()

const client = new OAuth2Client()
const sessionSecretKey = new TextEncoder().encode(sessionSecret)

const getUnixTime = () => Math.floor(Date.now() / 1000)

const readCachedToken = (token) => {
  const cached = verifiedTokens.get(token)
  if (!cached) return null

  if (cached.expiresAt <= getUnixTime()) {
    verifiedTokens.delete(token)
    return null
  }

  return cached.value
}

const cacheVerifiedToken = (token, value) => {
  const expiresAt = Number(value?.payload?.exp)
  if (!expiresAt || Number.isNaN(expiresAt)) return

  verifiedTokens.set(token, { value, expiresAt })
}

export const verifyToken = async (token) => {
  const cached = readCachedToken(token)
  if (cached) return cached

  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: '108028336132-s1j25jmsu1d222ovrabdk2kcbvkie474.apps.googleusercontent.com'
    })
    const payload = ticket.getPayload()
    const userid = payload['sub']
    const value = { userid, payload }
    cacheVerifiedToken(token, value)
    return value
  } catch (error) {
    verifiedTokens.delete(token)
    return null
  }
}

export const generateTicket = async (userid, remoteAddress) => {
  const payload = { userid, remoteAddress }

  return new jose.SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('24h').sign(sessionSecretKey)
}

export const validateTicket = async (ticket, remoteAddress) => {
  try {
    const result = await jose.jwtVerify(ticket, sessionSecretKey)
    const userid = typeof result.payload.userid === 'string' ? result.payload.userid : ''
    const signedRemoteAddress = typeof result.payload.remoteAddress === 'string' ? result.payload.remoteAddress : ''

    if (!userid || signedRemoteAddress !== remoteAddress) {
      return null
    }
    return result.payload as { userid: string; remoteAddress: string; exp: number }
  } catch (error) {
    console.log(error)

    return null
  }
}
export const isExpired = (exp) => {
  if (!exp) return true
  const now = getUnixTime()
  return exp < now
}
