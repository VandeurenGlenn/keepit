import { LiteElement, html, css, query, property } from '@vandeurenglenn/lite'
import { DataFlow } from '../flows/data.js'
import { api } from '../api/client.js'
import { showToast } from '../helpers/toast.js'
import { confirmAction } from '../helpers/confirmation.js'
import '../flows/data.js'
import '../flows/data-input.js'

export const CompaniesMixin = (base: typeof LiteElement) =>
  class CompaniesMixin extends base {
    @query('data-flow') accessor dataFlow: DataFlow

    @property({ type: Object, consumes: true }) accessor companies

    @property({ type: Boolean }) accessor creatingCompany = false

    companyStepsFor(relationshipType: 'customer' | 'supplier') {
      const relation = relationshipType === 'supplier' ? 'leverancier' : 'klant'
      return [
      {
        name: `Naam van de ${relation}`,
        description: `Gebruik de bedrijfsnaam of naam van de ${relation}.`,
        template: html`<data-input label="name"></data-input> `,
        validateAndReturnValues: (inputs) => {
          const data = {}

          for (const input of inputs) {
            data[input.label] = input.value
            if (!data[input.label]) return { valid: false, values: data }
          }
          return { valid: true, values: data }
        }
      },
      {
        name: 'Adres',
        description: `Zoek het hoofdadres van de ${relation}.`,
        template: html`
          <data-input
            label="place"
            type="place"></data-input>
        `,

        validateAndReturnValues: (inputs) => {
          const data = {}

          for (const input of inputs) {
            data[input.label] = input.place
            if (!data[input.label]) {
              return { valid: false, values: data }
            }
          }
          return { valid: true, values: data }
        }
      },
      {
        name: 'Omschrijving',
        description: `Optioneel: voeg nuttige informatie over de ${relation} toe.`,
        template: html`<data-input label="description"></data-input> `,
        validateAndReturnValues: (inputs) => {
          const data = {}

          for (const input of inputs) {
            data[input.label] = input.value
          }
          return { valid: true, values: data }
        }
      }
      ]
    }

    _addCompany = async (relationshipType: 'customer' | 'supplier' = 'customer') => {
      if (this.creatingCompany) return // Prevent multiple clicks
      this.creatingCompany = true
      const dataFlow = new DataFlow()
      const relation = relationshipType === 'supplier' ? 'leverancier' : 'klant'
      dataFlow.steps = this.companyStepsFor(relationshipType)
      dataFlow.label = `Nieuwe ${relation}`
      document.body.appendChild(dataFlow)
      const stepResults = await dataFlow.done
      this.creatingCompany = false
      if (!stepResults) {
        document.body.removeChild(dataFlow)
        return
      }

      try {
        const companyData = {
          ...(stepResults as Array<Record<string, any>>).reduce((acc, item) => ({ ...acc, ...item }), {}),
          relationshipType
        }
        const data = await api.createCompany(companyData)
        this.companies = this.companies || {}
        this.companies = { ...this.companies, [data.uuid]: data.content }
        document.body.removeChild(dataFlow)
        const success = document.createElement('success-animation') as HTMLElement & { message?: string }
        document.body.appendChild(success)
        success.message = `${relationshipType === 'supplier' ? 'Leverancier' : 'Klant'} aangemaakt`
        setTimeout(() => {
          document.body.removeChild(success)
        }, 1200) // 1.2s for animation
      } catch (error) {
        console.error('Error creating company:', error)
        this.creatingCompany = false
        document.body.removeChild(dataFlow)
        showToast(`De ${relation} kon niet aangemaakt worden.`)
      }
    }

    _deleteCompany = async (uuid, relationshipType: 'customer' | 'supplier' = 'customer') => {
      const relation = relationshipType === 'supplier' ? 'leverancier' : 'klant'
      const answer = await confirmAction({ title: `${relation === 'klant' ? 'Klant' : 'Leverancier'} verwijderen?`, message: `De ${relation} en gekoppelde contactgegevens worden definitief verwijderd.`, confirmLabel: `${relation === 'klant' ? 'Klant' : 'Leverancier'} verwijderen` })
      if (!answer) return

      try {
        await api.deleteCompany(uuid)
        delete this.companies[uuid]
        this.requestRender()
        showToast(`${relation === 'klant' ? 'Klant' : 'Leverancier'} verwijderd.`)
      } catch (error) {
        console.error('Error deleting company:', error)
        showToast(`De ${relation} kon niet verwijderd worden.`)
      }
    }

    _handleFabKeyUp = (event) => {
      if (event.key === 'Enter' || event.key === 'Space') {
        event.preventDefault()
        this._addCompany()
      }
    }
  }
