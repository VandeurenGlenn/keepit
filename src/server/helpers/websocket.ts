import pubsub from './pubsub.js'
import { users } from '../database/database.js'
import { isExpired, validateTicket } from './auth.js'

export const handleWebSocketConnection = async (socket, req) => {
  const remote = req.socket.remoteAddress || 'unknown'
  console.log('WebSocket connection from', remote)
  if (!socket.protocol.startsWith('ticket__')) {
    socket.close()
    return
  }

  const valid = await validateTicket(socket.protocol.split('__')[1], req.socket.remoteAddress)
  console.log(valid)
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
    socket.on('message', (data) => {
      console.log(`WebSocket message received`, data)
      // simple echo behavior for now
      const { type, params } = JSON.parse(typeof data === 'string' ? data : data.toString())
      console.log(`WebSocket message received: ${type}`, params)

      try {
        if (type === 'pubsub') {
          if (params && params.subscribe) {
            pubsub.subscribe(params.subscribe, (value) => {
              console.log(`WebSocket subscription to ${params.subscribe}`)
              socket.send(
                JSON.stringify({
                  type: 'pubsub',
                  params: {
                    value: params.subscribe === 'users.changed' ? users[valid.userid] : value,
                    publish: params.subscribe
                  }
                })
              )
            })
          }
        }
      } catch (e) {
        console.error('Failed to send WS message', e)
      }
    })

    socket.on('close', () => {
      console.log('WebSocket closed for', remote)
    })
  } else {
    console.log('WebSocket connection not authenticated for', remote)
    socket.close()
  }
}
