import { JWT, JWTAccess, OAuth2Client } from 'google-auth-library'
import * as jose from 'jose'

const tickets = new Map()

const client = new OAuth2Client()

export const verifyToken = async (token) => {
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: '108028336132-s1j25jmsu1d222ovrabdk2kcbvkie474.apps.googleusercontent.com'
    })
    const payload = ticket.getPayload()
    const userid = payload['sub']
    return { userid, payload }
  } catch (error) {
    return null
  }
}

export const generateTicket = async (userid, remoteAddress) => {
  const payload = { userid, remoteAddress }
  const key = await crypto.subtle.generateKey(
    {
      name: 'HMAC',
      hash: 'SHA-256'
    },
    true,
    ['sign', 'verify']
  )

  const jwt = await new jose.SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('24h').sign(key)
  tickets.set(jwt, { userid, remoteAddress, key })
  return jwt
}

export const validateTicket = async (ticket, remoteAddress) => {
  try {
    if (!tickets.has(ticket)) return null
    const { key, userid } = tickets.get(ticket)
    const result = await jose.jwtVerify(ticket, key)

    if (!result.payload.userid || result.payload.userid !== userid || result.payload.remoteAddress !== remoteAddress) {
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
  const now = Math.floor(Date.now() / 1000)
  return exp < now
}
