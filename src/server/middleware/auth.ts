import { Context } from 'koa'

/**
 * Extract authenticated user ID from context
 * Returns the userid if authenticated, otherwise null
 */
export const getAuthToken = async (ctx: Context): Promise<string | null> => {
  return ctx.state.userid || null
}
