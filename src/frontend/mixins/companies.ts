import { LiteElement, html, css, query, property } from '@vandeurenglenn/lite'
import { DataFlow } from '../flows/data.js'
import { api } from '../api/client.js'
import '../flows/data.js'
import '../flows/data-input.js'

export const CompaniesMixin = (base: typeof LiteElement) =>
  class CompaniesMixin extends base {
    @query('data-flow') accessor dataFlow: DataFlow

    @property({ type: Object, consumes: true }) accessor companies

    @property({ type: Boolean }) accessor creatingCompany = false

    @property({ type: Array }) accessor companySteps = [
      {
        template: html`<data-input label="name"></data-input> `,
        validateAndReturnValues: (inputs) => {
          const data = {}

          for (const input of inputs) {
            data[input.label] = input.value
            if (!data[input.label]) {
              return { valid: false, values: data }
            }
          }
          return { valid: true, values: data }
        }
      },
      {
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
        description: 'optional',
        template: html`<data-input label="description"></data-input> `,
        validateAndReturnValues: (inputs) => {
          const data = {}

          for (const input of inputs) {
            data[input.label] = input.value
            if (!data[input.label]) {
              return { valid: false, values: data }
            }
          }
          return { valid: true, values: data }
        }
      }
    ]
    _addCompany = async () => {
      if (this.creatingCompany) return // Prevent multiple clicks
      this.creatingCompany = true
      const dataFlow = new DataFlow()
      dataFlow.steps = this.companySteps
      dataFlow.label = 'Add Company'
      document.body.appendChild(dataFlow)
      const stepResults = await dataFlow.done
      this.creatingCompany = false
      if (!stepResults) {
        document.body.removeChild(dataFlow)
        return
      }

      try {
        const companyData = (stepResults as Array<Record<string, any>>).reduce((acc, item) => ({ ...acc, ...item }), {})
        const data = await api.createCompany(companyData)
        this.companies = this.companies || {}
        this.companies[data.uuid] = data
        document.body.removeChild(dataFlow)
        const success = document.createElement('success-animation') as HTMLElement & { message?: string }
        document.body.appendChild(success)
        success.message = 'Company created successfully!'
        setTimeout(() => {
          document.body.removeChild(success)
        }, 1200) // 1.2s for animation
      } catch (error) {
        console.error('Error creating company:', error)
        this.creatingCompany = false
        document.body.removeChild(dataFlow)
        alert('Failed to create company')
      }
    }

    _deleteCompany = async (uuid) => {
      const answer = confirm('Are you sure you want to delete this company?')
      if (!answer) return

      try {
        await api.deleteCompany(uuid)
        delete this.companies[uuid]
        this.requestRender()
      } catch (error) {
        console.error('Error deleting company:', error)
        alert('Failed to delete company')
      }
    }

    _handleFabKeyUp = (event) => {
      if (event.key === 'Enter' || event.key === 'Space') {
        event.preventDefault()
        this._addCompany()
      }
    }
  }
