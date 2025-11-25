export const isPlatform = (platform: NodeJS.Platform) => {
  return typeof process === 'object' && platform === process.platform
}

export const isBackend = () => {
  return typeof process === 'object' && process.versions.hasOwnProperty('electron')
}

export const isBrowser = () => {
  return typeof window === 'object' && typeof navigator === 'object'
}

export const isFrontend = () => {
  return typeof navigator === 'object' && navigator.userAgent.toLowerCase().includes('electron')
}

export const isWin = isPlatform('win32')

export const isMac = isPlatform('darwin')

export const isLinux = isPlatform('linux')

export const classifyUrl = (url: string) => {
  const isHttp = /^https?:\/\//i.test(url)
  const isFile = /^file:\/\//i.test(url)
  /* /page 或 #/page */
  const isInternalRoute = /^\/[^/]+|^#\/.+/.test(url)
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|\[?::1]?)(?::\d+)?(\/|$)/i.test(url)
  
  return { isHttp, isFile, isInternalRoute, isLocalhost }
}

export const isElectronAppBackend = () => {
  return isBackend()
}

export const isBrowserProcess = () => {
  return isBrowser()
}

export const isElectronAppFrontend = () => {
  return isFrontend()
}
