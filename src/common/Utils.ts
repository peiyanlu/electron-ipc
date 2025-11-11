export const isPlatform = (platform: NodeJS.Platform) => {
  return typeof process === 'object' && platform === process.platform
}


export const isElectronAppBackend = () => {
  return typeof process === 'object' && process.versions.hasOwnProperty('electron')
}


export const isBrowserProcess = () => {
  return typeof window === 'object' && typeof navigator === 'object'
}


export const isElectronAppFrontend = () => {
  return typeof navigator === 'object' && navigator.userAgent.toLowerCase().includes('electron')
}


export const isWin = isPlatform('win32')


