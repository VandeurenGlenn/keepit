import { OAuth2Client } from 'google-auth-library'

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
