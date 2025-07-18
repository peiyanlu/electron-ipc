import { dialog } from 'electron'
import {
  IpcHostChannel,
  IpcHostFunctions,
  IpcHostNotifications,
  IpcInvokeReturn,
  RemoveFunction,
} from '../common/IpcSocket'
import { AsyncMethodsOf } from '../common/UtilityTypes'
import { IpcHost } from './IpcHost'


/**
 * send → addListener
 */
export abstract class HostNotificationHandler {
  public abstract get channelName(): string;
  
  public static register(): RemoveFunction {
    const impl = new (this as any)() as HostNotificationHandler
    return IpcHost.addListener(
      impl.channelName,
      (_evt: Electron.Event, funcName: string, ...args: any[]) => {
        const func = (impl as any)[funcName]
        if (typeof func !== 'function') {
          throw new Error(`Method "${ impl.constructor.name }.${ funcName }" not found on NotificationHandler registered for channel: ${ impl.channelName }`)
        }
        
        func.call(impl, ...args)
      },
    )
  }
}


export class IpcHostNotifyHandler extends HostNotificationHandler implements IpcHostNotifications {
  public get channelName() {
    return IpcHostChannel.HostNotify
  }
  
  public notifyHost() {
    console.log('收到了前端调用')
  }
}

// ---------------------------------------------

/**
 * invoke → handle
 */
export abstract class IpcHandler {
  public abstract get channelName(): string;
  
  public static register(): RemoveFunction {
    const impl = new (this as any)() as IpcHandler // create an instance of subclass. "as any" is necessary because base class is abstract
    return IpcHost.handle(
      impl.channelName,
      async (_evt: Electron.Event, funcName: string, ...args: any[]): Promise<IpcInvokeReturn> => {
        try {
          const func = (impl as any)[funcName]
          if (typeof func !== 'function') {
            throw new Error(`Method "${ impl.constructor.name }.${ funcName }" not found on IpcHandler registered for channel: ${ impl.channelName }`)
          }
          
          return { result: await func.call(impl, ...args) }
        } catch (err: any) {
          const ret: IpcInvokeReturn = {
            error: {
              name: err.hasOwnProperty('name') ? err.name : err.constructor?.name ?? 'Unknown Error',
              message: err.message,
              errorNumber: err.errorNumber ?? 0,
            },
          }
          
          return ret
        }
      },
    )
  }
}


export class IpcHostHandler extends IpcHandler implements IpcHostFunctions {
  public get channelName() {
    return IpcHostChannel.Functions
  }
  
  async ping() {
    return process.versions
  }
}


export class ElectronDialogHandler extends IpcHandler {
  public get channelName() {
    return IpcHostChannel.Dialog
  }
  
  public async callDialog(method: AsyncMethodsOf<Electron.Dialog>, ...args: any) {
    const dialogMethod = dialog[method] as (...args: any[]) => any
    if (typeof dialogMethod !== 'function') {
      throw new Error(`illegal electron dialog method`)
    }
    
    return dialogMethod.call(dialog, ...args)
  }
}
