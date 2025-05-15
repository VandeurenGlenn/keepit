import { users, usersStore } from '../database/database.js'

export const hasRole = (userid, role) => {
  if (!userid || !users[userid].roles) return false
  return users[userid].roles.includes(role)
}

export const grantRole = async (userid, role) => {
  if (!userid || !users[userid].roles) return false
  if (users[userid].roles.includes(role)) return false
  users[userid].roles.push(role)
  await usersStore.put(users)
}

export const revokeRole = async (userid, role) => {
  if (!userid || !users[userid].roles) return false
  if (!users[userid].roles.includes(role)) return false
  users[userid].roles = users[userid].roles.filter((r) => r !== role)
  await usersStore.put(users)
}
