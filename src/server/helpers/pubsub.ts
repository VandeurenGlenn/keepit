import Pubsub from '@vandeurenglenn/little-pubsub'
globalThis.pubsub = globalThis.pubsub || new Pubsub()
export default globalThis.pubsub
