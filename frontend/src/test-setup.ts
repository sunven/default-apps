import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { dismissNotification } from './Notifications'
afterEach(()=>{cleanup();dismissNotification()})

window.matchMedia = window.matchMedia ?? (() => ({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent(){return true},media:'',onchange:null}))
HTMLElement.prototype.setPointerCapture = function() {}
HTMLElement.prototype.releasePointerCapture = function() {}

// jsdom does not implement the browser top layer; focus behavior remains exercised by userEvent.
HTMLDialogElement.prototype.showModal = function() { this.setAttribute("open", "") }
HTMLDialogElement.prototype.close = function() { this.removeAttribute("open") }
