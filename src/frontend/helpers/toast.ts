export type ToastOptions = {
  actionLabel?: string
  action?: () => void | Promise<void>
}

export const showToast = (message: string, options: ToastOptions = {}) => {
  window.dispatchEvent(
    new CustomEvent('keepit-toast', {
      detail: { message, ...options }
    })
  )
}
