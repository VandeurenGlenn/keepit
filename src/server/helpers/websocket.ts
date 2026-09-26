import pubsub from './pubsub.js'
import { users } from '../database/database.js'
import { isExpired, validateTicket } from './auth.js'

export const handleWebSocketConnection = async (socket, req) => {
  if (!socket.protocol.startsWith('ticket__')) {
    socket.close()
    return
  }

  const valid = await validateTicket(socket.protocol.split('__')[1], req.socket.remoteAddress)
  if (!valid) {
    socket.send(JSON.stringify({ type: 'error', message: 'Ticket session expired' }))
    socket.close()
    return
  }
  const expired = isExpired(valid.exp)
  if (expired) {
    socket.send(JSON.stringify({ type: 'error', message: 'Ticket session expired' }))
    socket.close()
    return
  }

  if (valid) {
    const subscriptions = new Map<string, () => void>()
    socket.on('message', (data) => {
      try {
        const { type, params } = JSON.parse(typeof data === 'string' ? data : data.toString())
        if (type === 'pubsub') {
          if (params && params.subscribe) {
            const channel = String(params.subscribe)
            const actor = users[valid.userid]
            const canManageTeam = actor?.roles?.some((role) => role === 'admin' || role === 'roles')
            const allowed = channel === 'users.changed'
              || channel === `notifications.${valid.userid}`
              || (channel === 'invites.changed' && canManageTeam)
            if (!allowed) {
              socket.send(JSON.stringify({ type: 'error', message: 'Forbidden subscription channel' }))
              return
            }
            if (subscriptions.has(channel)) return
            const unsubscribe = pubsub.subscribe(channel, (value) => {
              if (socket.readyState !== 1) return
              socket.send(
                JSON.stringify({
                  type: 'pubsub',
                  params: {
                    value: channel === 'users.changed' ? { [valid.userid]: users[valid.userid] } : value,
                    publish: channel
                  }
                })
              )
            })
            subscriptions.set(channel, unsubscribe)
          }
        }
      } catch (e) {
        if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'error', message: 'Invalid websocket message' }))
      }
    })

    socket.on('close', () => {
      for (const unsubscribe of subscriptions.values()) unsubscribe()
      subscriptions.clear()
    })
  } else {
    socket.close()
  }
}
