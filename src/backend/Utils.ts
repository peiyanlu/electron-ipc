import { exec } from 'child_process'
import { app } from 'electron'
import { spawn } from 'node:child_process'
import { appendFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { posix } from 'path'
import { isWin } from '../common/Utils'
import { tmpdir } from 'node:os'


export const openPath = (dir: string) => {
  let cmd = `explorer "" "${ dir }"`
  switch (process.platform) {
    case 'win32':
      cmd = `start "" "${ dir }"`
      break
    case 'darwin':
      cmd = `open "${ dir }"`
      break
    case 'linux':
      cmd = `xdg-open "${ dir }"`
      break
  }
  exec(cmd)
}

export const normalizePath = (id: string): string => {
  const windowsSlashRE = /\\/g
  const slash = (p: string): string => p.replace(windowsSlashRE, '/')
  return posix.normalize(isWin ? slash(id) : id)
}


export const checkSquirrel = () => {
  if (isWin) {
    const cmd = process.argv[1]
    const target = basename(process.execPath) // [AppName].exe
    
    const writeLog = (cmd: string) => {
      const logPath = resolve(tmpdir(), `${ target }.log`)
      appendFile(logPath, `${ new Date().toLocaleString() } ${ cmd } \n`).catch()
    }
    
    const run = (args: string[], done: () => void) => {
      const updateExe = resolve(dirname(process.execPath), '..', 'Update.exe')
      writeLog(updateExe)
      spawn(updateExe, args, { detached: true }).on('close', done)
    }
    
    if ([ '--squirrel-install', '--squirrel-updated' ].includes(cmd)) {
      writeLog(cmd)
      run([ `--createShortcut=${ target }` ], app.quit)
      return true
    }
    
    if (cmd === '--squirrel-uninstall') {
      writeLog(cmd)
      run([ `--removeShortcut=${ target }` ], app.quit)
      return true
    }
    
    if (cmd === '--squirrel-obsolete') {
      writeLog(cmd)
      app.quit()
      return true
    }
    
    return false
  }
  
  return false
}
