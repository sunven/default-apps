import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
afterEach(cleanup)

// jsdom does not implement the browser top layer; focus behavior remains exercised by userEvent.
HTMLDialogElement.prototype.showModal = function() { this.setAttribute("open", "") }
HTMLDialogElement.prototype.close = function() { this.removeAttribute("open") }
