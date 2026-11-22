import { createKeyedQueue } from './keyed-queue.js'

// Keep position processing, clearing the timeline and changing consent ordered per user.
export const queueTimelineUpdate = createKeyedQueue()

