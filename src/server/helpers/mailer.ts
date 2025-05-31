import nodemailer from 'nodemailer'
import { config } from './config.js'

export type MailerOptions = {
  host: string
  port: number
  auth: {
    user?: string
    pass?: string
    token?: string
  }
  service?: string
}

const getTransporter = () => {
  const options: MailerOptions = {
    host: 'live.smtp.mailtrap.io',
    port: 587,
    auth: {
      user: config.email.auth.user || 'api',
      pass: config.email.auth.pass,
      token: config.email.auth.token || ''
    }
  }

  return nodemailer.createTransport(options)
}

const transporter = getTransporter()

export const sendMail = async (from, to, subject, html) => {
  return transporter.sendMail({
    from,
    to,
    subject,
    html
  })
}

export const sendContactMail = async (name, email, phoneNumber, address, message, projectType, subject) => {
  const html = `
        <h1>Nieuw contactbericht</h1>
        
        <p>Naam: ${name}</p>
        <p>Adres: ${address}</p>
        <p>Telefoon: ${phoneNumber}</p>
        <p>Projecttype: ${projectType}</p>
        <p>subject: ${subject}</p>
        <p>Bericht: ${message}</p>
    `
  return sendMail(email.contact, 'contact@dimac.be', `${name}-${projectType}-${subject}`, html)
}
