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
        
        <h2>Er is een nieuw contactbericht ontvangen via de website.</h2>
        <h3>Hier zijn de details:</h3>
        <p>Email: ${email}</p>
        <p>Naam: ${name}</p>
        <p>Adres: ${address}</p>
        <p>Telefoon: ${phoneNumber}</p>
        <p>Projecttype: ${projectType}</p>
        <p>subject: ${subject}</p>
        <p>Bericht: ${message}</p>
    `
  return sendMail('contact@dimac.be', 'contact@dimac.be', `${name}-${projectType}-${subject}`, html)
}

export const sendInviteMail = async (email, uuid) => {
  const html = `

        <h1>Welkom bij Keepit (made by Dimac).</h1>

        <p>Je bent uitgenodigd om lid te worden van de Dimac organisatie op Keepit, het platform voor tijdsregistratie en projectbeheer.</p>
        <p>Klik op de onderstaande link om je account aan te maken en toegang te krijgen tot de organisatie:</p>
        <a href="https://keepit.dimac.be/#!/register?uuid=${uuid}&email=${email}">Account aanmaken</a>
        <br />
        <strong>Gebruik keepit elke dag voor het registreren van je werkuren.</strong>
        <br />
        <h2>Wat is Keepit?</h2>
        <p>Keepit is een platform voor tijdsregistratie en projectbeheer, ontwikkeld door Dimac.</p>  
        <p>Gebruik Keepit om je werkuren bij te houden, projecten te beheren en de voortgang van je taken te volgen.</p>
        <p>Keepit biedt een gebruiksvriendelijke interface en handige functies om je productiviteit te verhogen.</p>
        <p>Volg de instructies op het registratieformulier om je account aan te maken. Zorg ervoor dat je het e-mailadres gebruikt waarop je deze uitnodiging hebt ontvangen.</p>
        <p>Als je vragen en of hulp nodig hebt, neem dan gerust contact op met onze ondersteuning via <a href="mailto:keepit.support@dimac.be">keepit.support@dimac.be</a>.</p>
        <p>We kijken ernaar uit je te verwelkomen in onze organisatie op Keepit!</p>
        <br />
        <small>Deze link is 7 dagen geldig.</small>

        <strong>Belangrijk:</strong> Deze link is uniek voor jou en mag niet worden gedeeld met anderen.</strong>
    `
  return sendMail(
    'keepit.invite@dimac.be',
    email,
    'Uitnodiging om lid te worden van de Dimac organisatie op Keepit',
    html
  )
}
