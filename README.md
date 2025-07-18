# electron-ipc

简化 Electron 前后端通信的 ipc 工具

## 后端

```ts
import { checkSquirrel, ElectronHost, IpcHost, isPlatform } from 'electron-ipc/backend'
import { join } from 'path'
import { ElectronSvgHandler } from './electron/IpcHandler'


const url = MAIN_WINDOW_VITE_DEV_SERVER_URL
const file = join(__dirname, '..', `renderer/${ MAIN_WINDOW_VITE_NAME }/index.html`)
const frontendURL = url ?? file


if (checkSquirrel()) {
  ElectronHost.shutdown()
}

ElectronHost
  .startup({
    ipcHandlers: [ ElectronSvgHandler ],
  })
  .then(async _ => {
    await ElectronHost.openMainWindow({
      webPreferences: {
        preload: require.resolve('./preload.js'),
        sandbox: false,
      },
      width: 980,
      height: 740,
      show: false,
      frontendURL,
      icon: join(__dirname, `icons/icon.${ isPlatform('linux') ? 'png' : 'ico' }`),
    })
  })


IpcHost.addListener('changeTheme', (_e, data: string) => {
  console.log('changeTheme:receiver', data)
})

```

## Preload

```ts
import { contextBridge } from 'electron'
import { frontendApiKey, getFrontendApi } from 'electron-ipc'


contextBridge.exposeInMainWorld(frontendApiKey, getFrontendApi())
```

## 前端

```ts
import { svgoChannel, SvgoIpcInterface } from '@/electron/IpcInterface'
import { ElectronApp, IpcApp } from 'electron-ipc/frontend'


ElectronApp.startup()
const svgoIpc = IpcApp.makeIpcFunctionProxy<SvgoIpcInterface>(svgoChannel, 'callMethod')


IpcApp.send('changeTheme', 'light')
```
